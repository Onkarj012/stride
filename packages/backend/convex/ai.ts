import { action, query, internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { deriveGroupKey, deriveMemberKey, deriveSubmissionFingerprint, ensureGroup, ensureMember } from "./actions_idempotency";
import { ConvexError, v } from "convex/values";
import { resolveActionDate } from "./time_resolve";
import {
  AUTO_WRITE_MAX_ACTIONS,
  CONFIRMATION_TTL_MS,
  LOW_CONFIDENCE_CONFIRM_THRESHOLD,
  buildActionMembers,
  assertGroupTransition,
  assertTransition,
  type ActionGroupStatus,
} from "./actions_envelope";
import { getCoach, classifyCoachType, COACHES, behaviorSummary, toneInstruction, type CoachType } from "./coaches";
import { toLegacyPersona } from "./personas";
import { insertActionTelemetry } from "./telemetry";
import { assertValidDate, stableHash } from "./validation";
import { finalizeActionGroup as finalizeActionGroupInMutation } from "./actions_group";

async function recordActionTelemetry(ctx: any, input: Parameters<typeof insertActionTelemetry>[1]) {
  await ctx.runMutation((internal as any).telemetry.record, { input });
}
import { buildMealDraftFromParsed, mealPayloadFromDraft, type MealDraft } from "./nutrition_draft";
import { calculateNonPersonalizedWorkoutCalories, calculateWorkoutCalories, parseDurationMinutes } from "./calorie_engine";
import { matchExercises, getWeightedMET } from "./exercise_db";
import { mapAIIntensity, inferDensity, countCompoundRatio } from "./workout_scorer";
import { buildRecoveryDraft, recoveryPayloadFromDraft } from "./recovery_draft";
import {
  callAI, parseJSON, type AIMessage,
  DEFAULT_MODEL, CHAT_MODEL, VISION_MODELS, OPENROUTER_URL,
} from "./ai/llm";
import {
  looksLikeLog, looksLikeFoodEstimate, extractUserMacros, applyUserMacros,
  classifyHomepageIntent, isNegatedLogItem,
} from "./ai/intent";
import {
  parseMealDescription, parseWorkoutDescription,
  extractStatedWorkoutCalories, NUTRITION_ACCURACY_RULES,
  type UserPhysique, type ParsedWorkoutResult,
} from "./ai/parse";

// callAI, parseJSON, AIMessage, model constants → ./ai/llm
// intent helpers (looksLikeLog, etc.) → ./ai/intent
// meal/workout parsing + nutrition engine → ./ai/parse

function getConvexErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data = err.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return (data as { code?: string }).code;
}

function getConvexErrorMessage(err: unknown): string | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data = err.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return (data as { message?: string }).message;
}

function markerMember(
  groupKey: string,
  actionType: "meal" | "workout" | "recovery",
  payload: any,
  ordinal: number,
  confidence?: number,
  validation: { status: "valid" | "warning" | "error"; messages: string[] } = { status: "valid", messages: [] },
  resolvedDate?: string,
) {
  return {
    memberIdempotencyKey: deriveMemberKey({ groupKey, actionType, payloadFingerprint: JSON.stringify(payload), ordinal }),
    payload,
    provenance: "ai_extracted" as const,
    confidence,
    validation,
    reversible: true,
    resolvedDate: resolvedDate ?? payload.date,
    resolvedTime: payload.time ?? payload.timestamp,
  };
}

async function committedActionMetadata(ctx: any, userId: string, table: string, rowId: string) {
  const action = await ctx.runQuery((internal as any).actions_undo.getCommittedActionForRow, {
    userId,
    table,
    rowId,
  });
  return action ? { actionId: action._id, groupId: action.groupId } : {};
}

async function pendingMemoryApprovalsForAction(ctx: any, userId: string, actionId: string) {
  const [food, workout] = await Promise.all([
    ctx.runQuery((internal as any).food_memory.getPendingForAction, { userId, sourceActionId: actionId }),
    ctx.runQuery((internal as any).workout_memory.getPendingForAction, { userId, sourceActionId: actionId }),
  ]);
  return [...food, ...workout];
}

function isConfidenceLow(confidence: number | undefined): boolean {
  return confidence !== undefined && confidence < LOW_CONFIDENCE_CONFIRM_THRESHOLD;
}

const RESTRICTED_RECOVERY_PATTERNS = [
  /severe\s+(?:pain|painful)/i,
  /(?:chest|head|abdominal|stomach|back|joint) pain/i,
  /(?:suicid|kill myself|self[- ]harm|end my life|crisis)/i,
  /(?:eating disorder|anorexi|bulimi|purge|binge and purge)/i,
  /(?:dangerously|severely|extremely) dehydrated/i,
  /(?:can't keep fluids|cannot keep fluids|fainting).*(?:water|drink|dehydrat)/i,
  /(?:dangerous|extreme|severe) fatigue/i,
  /(?:too tired|exhausted).*(?:drive|driving|stay awake)/i,
];

export function hasRestrictedRecoverySignal(message: string): boolean {
  return RESTRICTED_RECOVERY_PATTERNS.some((pattern) => pattern.test(message));
}

const RESTRICTED_GUIDANCE = `SAFETY RESTRICTION: The user's message contains a potentially urgent pain, crisis, eating-disorder, dehydration, or dangerous-fatigue signal. Do not diagnose, prescribe treatment, recommend compensating exercise, dieting, fluid-loading, or other precise self-management. Respond with empathy, advise contacting local emergency services or a qualified clinician/crisis service as appropriate, and ask whether they are in immediate danger. Escalate, do not advise.`;

function isVagueDate(date: unknown): boolean {
  return date === "UNKNOWN_VAGUE";
}

function nutritionFromDraft(draft: MealDraft) {
  return {
    calories: draft.calories,
    protein: draft.protein,
    carbs: draft.carbs,
    fat: draft.fat,
    confidence: draft.confidence,
    nutritionSource: draft.nutritionSource,
    ingredientBreakdown: draft,
    reportedCalories: draft.reportedCalories,
    estimatedCalories: draft.estimatedCalories,
    calorieSource: draft.calorieSource,
  };
}

function resolveChatActionDate(
  input: Omit<import("./time_resolve").ResolveActionDateInput, "now" | "userTimeZone">,
  timezoneOffsetMinutes = 0,
): import("./time_resolve").ActionDateResolution {
  return resolveActionDate({ ...input, now: Date.now() - timezoneOffsetMinutes * 60_000, userTimeZone: "UTC" });
}

function clarifyingReason(
  date: unknown,
  resolved: { status: "resolved" | "needs_clarification" | "rejected"; reason?: string },
  confidence?: number,
  validationStatus?: "valid" | "warning" | "error",
  hasUnresolvedFood = false,
): string | null {
  if (isVagueDate(date)) return "The date is too vague; provide an exact date";
  if (resolved.status === "needs_clarification") return resolved.reason ?? "The date needs clarification";
  if (resolved.status === "rejected") return resolved.reason ?? "The date cannot be used";
  if (validationStatus === "warning") return "The action needs confirmation before saving";
  if (hasUnresolvedFood) return "ambiguous_food";
  if (isConfidenceLow(confidence)) return `Confidence (${confidence!.toFixed(2)}) is below the auto-write threshold`;
  return null;
}

function parseMarkerValidation(logData: any): { status: "valid" | "warning" | "error"; messages: string[] } {
  const status = logData?.validation?.status;
  if (status === "warning" || status === "error") {
    return {
      status,
      messages: Array.isArray(logData.validation.messages) ? logData.validation.messages : [],
    };
  }
  return { status: "valid", messages: [] };
}

/** Persist a pending action group + members without writing domain rows. */
export const stageClarificationGroup = internalMutation({
  args: {
    userId: v.string(),
    groupIdempotencyKey: v.string(),
    sourceSurface: v.union(
      v.literal("chat"),
      v.literal("quick_log"),
      v.literal("barcode"),
      v.literal("recipe"),
      v.literal("checkin"),
      v.literal("direct_ui"),
      v.literal("mobile"),
    ),
    rawInput: v.string(),
    model: v.optional(v.string()),
    clientLocalDate: v.optional(v.string()),
    clientLocalTime: v.optional(v.string()),
    clientTimeZone: v.optional(v.string()),
    createdAt: v.number(),
    members: v.array(v.object({
      actionType: v.union(v.literal("meal"), v.literal("workout"), v.literal("recovery")),
      memberIdempotencyKey: v.string(),
      payload: v.any(),
      provenance: v.union(v.literal("user_reported"), v.literal("ai_extracted"), v.literal("ai_estimated"), v.literal("database_match")),
      confidence: v.optional(v.number()),
      validation: v.object({ status: v.union(v.literal("valid"), v.literal("warning"), v.literal("error")), messages: v.array(v.string()) }),
      reversible: v.boolean(),
      resolvedDate: v.optional(v.string()),
      resolvedTime: v.optional(v.string()),
      ordinal: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    if (args.clientLocalDate) {
      assertValidDate(args.clientLocalDate);
      const serverDate = new Date().toISOString().slice(0, 10);
      const [year, month, day] = serverDate.split("-").map(Number);
      const toleranceDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
      if (args.clientLocalDate > toleranceDate) {
        throw new Error("Client local date cannot be in the future");
      }
    }
    const groupResult = await ensureGroup(ctx, {
      userId: args.userId,
      groupIdempotencyKey: args.groupIdempotencyKey,
      sourceSurface: args.sourceSurface,
      rawInput: args.rawInput,
      model: args.model,
      clientLocalDate: args.clientLocalDate,
      clientLocalTime: args.clientLocalTime,
      clientTimeZone: args.clientTimeZone,
      createdAt: args.createdAt,
      status: "pending",
      submissionFingerprint: deriveSubmissionFingerprint({
        userId: args.userId,
        sourceSurface: args.sourceSurface,
        rawInput: args.rawInput,
        clientLocalDate: args.clientLocalDate,
        clientLocalTime: args.clientLocalTime,
        clientTimeZone: args.clientTimeZone,
      }),
    });
    if (["committed", "discarded", "expired"].includes(groupResult.group.status)) {
      return { groupId: groupResult.group._id };
    }
    const members = buildActionMembers({
      groupId: groupResult.group._id,
      userId: args.userId,
      candidates: args.members.map(({ ordinal, ...member }) => ({
        ...member,
        payload: ordinal === undefined ? member.payload : { ...member.payload, _confirmationOrdinal: ordinal },
      })),
    });
    for (const member of members) {
      const ensured = await ensureMember(ctx, member);
      if (ensured.state === "created") {
        await insertActionTelemetry(ctx, {
          actionId: String(ensured.member._id),
          groupId: String(groupResult.group._id),
          userId: args.userId,
          actionType: ensured.member.actionType,
          event: "staged",
          sourceSurface: args.sourceSurface,
          model: args.model,
          retryCount: 0,
          validationStatus: ensured.member.validation.status,
          confidence: ensured.member.confidence,
          provenance: ensured.member.provenance,
          mutationResult: { ok: true },
        });
      }
    }
    return { groupId: groupResult.group._id };
  },
});

type ResolveClarificationResult = { groupId: string; loggedItems: any[]; memoryApprovals?: any[]; errors?: string[] };

async function executeClarificationResolution(ctx: any, userId: string, groupId: string, date: string): Promise<ResolveClarificationResult> {
  const group = await ctx.runQuery(internal.ai.getActionGroupForClarification, { groupId: groupId as any });
  if (!group) throw new Error("Clarification group not found");
  if (group.userId !== userId) throw new Error("Not authorized");
  if (group.status === "pending" && Date.now() - group.createdAt > CONFIRMATION_TTL_MS) {
    await ctx.runMutation(internal.ai.expireActionGroup, { groupId: groupId as any });
    throw new Error("This confirmation has expired");
  }
  if (group.status === "expired") throw new Error("This confirmation has expired");
  if (!["pending", "partial", "failed"].includes(group.status)) throw new Error("Group is not pending clarification");
  const settings = (await ctx.runQuery(internal.profile.getSettingsForContext, { userId })) as any;
  const dateCheck = resolveChatActionDate({ explicitDate: date, actionKind: "actual" }, settings?.timezoneOffsetMinutes ?? 0);
  if (dateCheck.status !== "resolved" && !(group.clientLocalDate !== undefined && group.clientLocalDate === date)) {
    throw new Error(dateCheck.reason ?? "This date cannot be used");
  }

  const members: any[] = await ctx.runQuery(internal.ai.getPendingMembersForClarification, { groupId: groupId as any });
  const loggedItems: any[] = [];
  const errors: string[] = [];

  for (const member of members) {
    if (member.status !== "pending" && member.status !== "failed") continue;
    try {
      const payload = { ...member.payload, date };
      const groupInput = {
        userId: group.userId,
        groupIdempotencyKey: group.groupIdempotencyKey,
        sourceSurface: group.sourceSurface,
        rawInput: group.rawInput,
        model: group.model,
        clientLocalDate: group.clientLocalDate,
        clientLocalTime: group.clientLocalTime,
        clientTimeZone: group.clientTimeZone,
        createdAt: group.createdAt,
      };
      const memberInput = {
        memberIdempotencyKey: member.memberIdempotencyKey,
        payload,
        provenance: member.provenance,
        confidence: member.confidence,
        validation: member.validation,
        reversible: member.reversible,
        resolvedDate: date,
        resolvedTime: member.resolvedTime,
      };
      let result: any;
      if (member.actionType === "meal") {
        result = await ctx.runMutation((internal as any).actions_writer.writeMealAction, {
          group: groupInput,
          member: memberInput,
        });
      } else if (member.actionType === "workout") {
        result = await ctx.runMutation((internal as any).actions_writer.writeWorkoutAction, {
          group: groupInput,
          member: memberInput,
        });
      } else if (member.actionType === "recovery") {
        result = await ctx.runMutation((internal as any).actions_writer.writeRecoveryAction, {
          group: groupInput,
          member: memberInput,
        });
      } else {
        continue;
      }
      const rowId = member.actionType === "recovery" ? (result as { id: string }).id : (result as string);
      loggedItems.push({
        type: member.actionType === "recovery" ? payload.kind : member.actionType,
        data: {
          _id: rowId,
          ...payload,
          actionId: member._id,
          groupId: member.groupId,
          provenance: member.provenance,
          confidence: member.confidence,
          validation: member.validation,
        },
      });
      await recordActionTelemetry(ctx, {
        actionId: String(member._id),
        groupId: String(member.groupId),
        userId,
        actionType: member.actionType,
        event: "clarification_resolved",
        sourceSurface: group.sourceSurface,
        model: group.model,
        retryCount: member.retryCount ?? 0,
        validationStatus: member.validation.status,
        confidence: member.confidence,
        provenance: member.provenance,
        mutationResult: { ok: true },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      await ctx.runMutation(internal.ai.recordConfirmationMemberFailure, { actionId: member._id, error: message });
      console.error("Failed to resolve clarification member:", err);
    }
  }

  await finalizeActionGroup(ctx, groupId);

  if (errors.length > 0 && loggedItems.length === 0) {
    throw new Error(`Could not resolve clarification: ${errors.join("; ")}`);
  }

  const memoryApprovals = (await Promise.all(loggedItems.map((item) =>
    item.data?.actionId ? pendingMemoryApprovalsForAction(ctx, userId, item.data.actionId) : [],
  ))).flat();
  return { groupId, loggedItems, memoryApprovals, errors: errors.length > 0 ? errors : undefined };
}

async function finalizeActionGroup(ctx: ActionCtx, groupId: string): Promise<ActionGroupStatus> {
  const group: Doc<"actionGroups"> | null = await ctx.runMutation(internal.ai.finalizeConfirmationGroup, { groupId: groupId as any });
  if (!group) throw new Error("Action group not found after finalization");
  return group.status;
}

/** Resolve a pending clarification group with an exact date and write through canonical writers. */
export const resolveClarification = action({
  args: {
    groupId: v.id("actionGroups"),
    date: v.string(),
  },
  handler: async (ctx, { groupId, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return executeClarificationResolution(ctx, identity.subject, groupId as unknown as string, date);
  },
});

export const getActionGroupForClarification = internalQuery({
  args: { groupId: v.id("actionGroups") },
  handler: async (ctx, { groupId }) => {
    return await ctx.db.get("actionGroups", groupId);
  },
});

export const getActionGroupByKey = internalQuery({
  args: { userId: v.string(), groupIdempotencyKey: v.string() },
  handler: async (ctx, { userId, groupIdempotencyKey }) => {
    return await ctx.db
      .query("actionGroups")
      .withIndex("by_group_idempotency_key", (q) => q.eq("userId", userId).eq("groupIdempotencyKey", groupIdempotencyKey))
      .first();
  },
});

export const getPendingMembersForClarification = internalQuery({
  args: { groupId: v.id("actionGroups") },
  handler: async (ctx, { groupId }) => {
    return await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
  },
});

export const expireActionGroup = internalMutation({
  args: { groupId: v.id("actionGroups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get("actionGroups", groupId);
    if (!group || group.status === "expired") return group;
    const members = await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    for (const member of members) {
      if (member.status === "pending" || member.status === "failed") {
        assertTransition(member.status, "expired");
        await ctx.db.patch(member._id, { status: "expired" });
        await insertActionTelemetry(ctx, {
          actionId: String(member._id),
          groupId: String(groupId),
          userId: group.userId,
          actionType: member.actionType,
          event: "expired",
          sourceSurface: group.sourceSurface,
          model: group.model,
          retryCount: (member as any).retryCount ?? 0,
          validationStatus: member.validation.status,
          confidence: member.confidence,
          provenance: member.provenance,
          mutationResult: { ok: false, error: "Confirmation expired", code: "CONFIRMATION_EXPIRED" },
        });
      }
    }
    assertGroupTransition(group.status, "expired");
    await ctx.db.patch(groupId, { status: "expired", resolvedAt: Date.now() });
    return await ctx.db.get("actionGroups", groupId);
  },
});

export const recordConfirmationMemberFailure = internalMutation({
  args: { actionId: v.id("actions"), error: v.string() },
  handler: async (ctx, { actionId, error }) => {
    const member = await ctx.db.get(actionId);
    if (!member || member.status === "committed" || member.status === "discarded" || member.status === "expired" || member.status === "undone") return member;
    if (member.status === "failed") {
      assertTransition("failed", "pending");
      await ctx.db.patch(actionId, { status: "pending" });
    }
    assertTransition("pending", "failed");
    await ctx.db.patch(actionId, {
      status: "failed",
      validation: {
        status: "error",
        messages: [...member.validation.messages, error],
      },
    });
    await insertActionTelemetry(ctx, {
      actionId: String(actionId),
      groupId: String(member.groupId),
      userId: member.userId,
      actionType: member.actionType,
      event: "failed",
      sourceSurface: (await ctx.db.get(member.groupId))?.sourceSurface ?? "chat",
      model: (await ctx.db.get(member.groupId))?.model,
      retryCount: (member as any).retryCount ?? 0,
      validationStatus: "error",
      confidence: member.confidence,
      provenance: member.provenance,
      mutationResult: { ok: false, error, code: "CANONICAL_MUTATION_FAILED" },
    });
    return await ctx.db.get(actionId);
  },
});

export const finalizeConfirmationGroup = internalMutation({
  args: { groupId: v.id("actionGroups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get("actionGroups", groupId);
    if (!group) throw new Error("Action group not found");
    return finalizeActionGroupInMutation(ctx, groupId);
  },
});

type ConfirmationDecision = {
  ordinal: number;
  action: "confirm" | "discard";
  edits?: any;
};

type ConfirmGroupResult = {
  groupId: Id<"actionGroups">;
  status: ActionGroupStatus;
  results: unknown[];
  loggedItems: unknown[];
  unresolvedItems: unknown[];
  memoryApprovals?: unknown[];
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function editedConfirmationMember(member: any, decision: ConfirmationDecision) {
  const edits = isRecord(decision.edits) ? decision.edits : {};
  const payloadEdits = isRecord(edits.payload)
    ? Object.fromEntries(Object.entries(edits.payload).filter(([key]) => key !== "previous"))
    : {};
  const directPayloadEdits = Object.fromEntries(
    Object.entries(edits).filter(([key]) => key !== "date" && key !== "description" && key !== "payload" && key !== "previous"),
  );
  const basePayload = isRecord(member.payload)
    ? Object.fromEntries(Object.entries(member.payload).filter(([key]) => key !== "previous"))
    : {};
  const payload = { ...basePayload, ...directPayloadEdits, ...payloadEdits };
  if (typeof edits.date === "string" && edits.date.length > 0) payload.date = edits.date;
  if (typeof edits.description === "string" && edits.description.length > 0) {
    payload.description = edits.description;
    if (member.actionType === "meal" || member.actionType === "workout") payload.name = edits.description;
  }
  const effectiveDate = payload.date ?? member.resolvedDate;
  return {
    payload: { ...payload, date: effectiveDate },
    resolvedDate: effectiveDate,
    resolvedTime: member.resolvedTime,
  };
}

function confirmationDescription(member: any): string {
  if (member.actionType === "recovery") {
    const payload = member.payload as Record<string, any>;
    if (payload.kind === "water") return `Water ${payload.ml}ml`;
    if (payload.kind === "sleep") return `Sleep ${payload.hours}h (${payload.quality})`;
    if (payload.kind === "mood") return `Mood ${payload.rating}/5`;
    if (payload.kind === "steps") return `Steps ${payload.count}`;
  }
  return member.payload?.name ?? member.payload?.description ?? member.actionType;
}

function confirmationOrdinal(member: any): number {
  return typeof member.payload?._confirmationOrdinal === "number" ? member.payload._confirmationOrdinal : -1;
}

function confirmationLoggedItem(member: any, rowId: string, payload: any, actionId: string) {
  const type = member.actionType === "recovery" ? payload.kind : member.actionType;
  return {
    type,
    data: {
      _id: rowId,
      ...payload,
      actionId,
      groupId: member.groupId,
      provenance: member.provenance,
      confidence: member.confidence,
      validation: member.validation,
    },
  };
}

/** Confirm, discard, or edit members of a staged large batch independently. */
export const confirmGroup = action({
  args: {
    groupId: v.id("actionGroups"),
    decisions: v.array(v.object({
      ordinal: v.number(),
      action: v.union(v.literal("confirm"), v.literal("discard")),
      edits: v.optional(v.any()),
    })),
  },
  handler: async (ctx, { groupId, decisions }): Promise<ConfirmGroupResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const aiInternal = (internal as any).ai;
    const group = await ctx.runQuery(aiInternal.getActionGroupForClarification, { groupId });
    if (!group || group.userId !== userId) throw new Error("Action group not found");

    if ((group.status === "pending" || group.status === "partial" || group.status === "failed") && Date.now() - group.createdAt > CONFIRMATION_TTL_MS) {
      await ctx.runMutation(aiInternal.expireActionGroup, { groupId });
      const expiredMembers: any[] = await ctx.runQuery(aiInternal.getPendingMembersForClarification, { groupId });
      return {
        groupId,
        status: "expired",
        results: expiredMembers.map((member: any) => ({ ordinal: confirmationOrdinal(member), actionType: member.actionType, status: "expired" })),
        loggedItems: [],
        unresolvedItems: [],
      };
    }
    if (group.status === "expired") {
      const expiredMembers: any[] = await ctx.runQuery(aiInternal.getPendingMembersForClarification, { groupId });
      return {
        groupId,
        status: "expired",
        results: expiredMembers.map((member: any) => ({ ordinal: confirmationOrdinal(member), actionType: member.actionType, status: "expired" })),
        loggedItems: [],
        unresolvedItems: [],
      };
    }

    const members: any[] = await ctx.runQuery(aiInternal.getPendingMembersForClarification, { groupId });
    const decisionsByOrdinal = new Map(decisions.map((decision) => [decision.ordinal, decision]));
    const results: any[] = [];
    const loggedItems: any[] = [];
    const unresolvedItems: any[] = [];
    const memoryApprovals: any[] = [];

    for (const member of members) {
      const ordinal = confirmationOrdinal(member);
      const decision = decisionsByOrdinal.get(ordinal);
      if (!decision) continue;
      const description = confirmationDescription(member);
      if (member.status === "committed") {
        await recordActionTelemetry(ctx, {
          actionId: String(member._id),
          groupId: String(groupId),
          userId,
          actionType: member.actionType,
          event: "already_committed",
          sourceSurface: group.sourceSurface,
          model: group.model,
          retryCount: (member as any).retryCount ?? 0,
          validationStatus: member.validation.status,
          confidence: member.confidence,
          provenance: member.provenance,
          mutationResult: { ok: true },
        });
        results.push({ ordinal, actionType: member.actionType, status: "already_committed", actionId: member._id, rowId: member.committedRowRef?.id });
        continue;
      }
      if (member.status === "discarded" || member.status === "expired") {
        results.push({ ordinal, actionType: member.actionType, status: member.status });
        continue;
      }
      if (decision.action === "discard") {
        await ctx.runMutation(aiInternal.discardConfirmationMember, { actionId: member._id });
        results.push({ ordinal, actionType: member.actionType, description, status: "discarded" });
        continue;
      }

      const edited = editedConfirmationMember(member, decision);
      try {
        const settings = (await ctx.runQuery(internal.profile.getSettingsForContext, { userId: group.userId })) as any;
        const dateCheck = resolveChatActionDate({ explicitDate: edited.resolvedDate, actionKind: "actual" }, settings?.timezoneOffsetMinutes ?? 0);
        if (dateCheck.status !== "resolved") {
          throw new Error(dateCheck.reason ?? "This date cannot be used");
        }

        const groupInput = {
          userId: group.userId,
          groupIdempotencyKey: group.groupIdempotencyKey,
          sourceSurface: group.sourceSurface,
          rawInput: group.rawInput,
          model: group.model,
          clientLocalDate: group.clientLocalDate,
          clientLocalTime: group.clientLocalTime,
          clientTimeZone: group.clientTimeZone,
          createdAt: group.createdAt,
        };
        const memberInput = {
          memberIdempotencyKey: member.memberIdempotencyKey,
          payload: edited.payload,
          provenance: member.provenance,
          confidence: member.confidence,
          validation: member.validation,
          reversible: member.reversible,
          resolvedDate: edited.resolvedDate,
          resolvedTime: edited.resolvedTime,
        };
        let rowId: string;
        if (member.actionType === "meal") {
          rowId = String(await ctx.runMutation((internal as any).actions_writer.writeMealAction, { group: groupInput, member: memberInput }));
        } else if (member.actionType === "workout") {
          rowId = String(await ctx.runMutation((internal as any).actions_writer.writeWorkoutAction, { group: groupInput, member: memberInput }));
        } else if (member.actionType === "recovery") {
          const result = await ctx.runMutation((internal as any).actions_writer.writeRecoveryAction, { group: groupInput, member: memberInput });
          rowId = String(result?.id ?? result);
        } else {
          throw new Error(`Unsupported confirmation action type: ${member.actionType}`);
        }
        const committed = await ctx.runQuery(aiInternal.getActionMember, { actionId: member._id });
        const actionId = committed?._id ?? member._id;
        const committedPayload = committed?.payload ?? edited.payload;
        loggedItems.push(confirmationLoggedItem(member, rowId, committedPayload, actionId));
        memoryApprovals.push(...await pendingMemoryApprovalsForAction(ctx, userId, actionId));
        results.push({ ordinal, actionType: member.actionType, description, status: "committed", actionId, rowId });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await ctx.runMutation(aiInternal.recordConfirmationMemberFailure, { actionId: member._id, error });
        const unresolved = { ordinal, actionType: member.actionType, description, status: "failed", error };
        results.push(unresolved);
        unresolvedItems.push(unresolved);
      }
    }

    const status = await finalizeActionGroup(ctx, groupId);
    return { groupId, status, results, loggedItems, unresolvedItems, memoryApprovals };
  },
});

export const getActionMember = internalQuery({
  args: { actionId: v.id("actions") },
  handler: async (ctx, { actionId }) => await ctx.db.get(actionId),
});

export const discardConfirmationMember = internalMutation({
  args: { actionId: v.id("actions") },
  handler: async (ctx, { actionId }) => {
    const member = await ctx.db.get(actionId);
    if (!member || member.status === "committed") return member;
    if (member.status === "pending" || member.status === "failed") {
      assertTransition(member.status, "discarded");
      await ctx.db.patch(actionId, { status: "discarded" });
      const group = await ctx.db.get(member.groupId);
      await insertActionTelemetry(ctx, {
        actionId: String(actionId),
        groupId: String(member.groupId),
        userId: member.userId,
        actionType: member.actionType,
        event: "discarded",
        sourceSurface: group?.sourceSurface ?? "chat",
        model: group?.model,
        retryCount: (member as any).retryCount ?? 0,
        validationStatus: member.validation.status,
        confidence: member.confidence,
        provenance: member.provenance,
        mutationResult: { ok: true },
      });
    }
    return await ctx.db.get(actionId);
  },
});


// ─── Public actions ───────────────────────────────────────────────────────────

export const parseOnboarding = action({
  args: { field: v.string(), text: v.string() },
  handler: async (ctx, { field, text }): Promise<Record<string, unknown>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });

    const SCHEMAS: Record<string, string> = {
      stats: `{"age": number|null, "weightKg": number|null, "heightCm": number|null, "sex": "male"|"female"|null, "bodyFat": number|null}. Convert lbs→kg (÷2.205), ft/in→cm. Example: "28yo male, 176lb, 5'10\\"" → {"age":28,"weightKg":79.8,"heightCm":177.8,"sex":"male","bodyFat":null}`,
      goal: `{"goal": one of "aggressive_loss"|"moderate_loss"|"mild_loss"|"maintain"|"recomp"|"lean_gain"|"muscle_gain"}. "lose fat fast"→aggressive_loss, "lose weight"→moderate_loss, "tone up / build muscle while losing fat"→recomp, "bulk / gain muscle"→muscle_gain, "lean bulk"→lean_gain, "stay the same"→maintain.`,
      work: `{"occupationType": "desk"|"mixed"|"standing"|"physical"|null, "workHoursPerDay": number|null, "lifestyleActivity": "sedentary"|"light"|"moderate"|"active"|null}. "office job 9 hours, lazy otherwise" → {"occupationType":"desk","workHoursPerDay":9,"lifestyleActivity":"sedentary"}`,
      training: `{"weeklyWorkouts": [{"type": one of "strength"|"run_slow"|"run_fast"|"cycling"|"hiit"|"yoga"|"swim"|"walk"|"sport", "durationMin": number, "sessionsPerWeek": number}]}. "lift 4x/week ~1h, run twice for 30min" → {"weeklyWorkouts":[{"type":"strength","durationMin":60,"sessionsPerWeek":4},{"type":"run_slow","durationMin":30,"sessionsPerWeek":2}]}`,
      diet: `{"dietaryPreference": "none"|"vegetarian"|"vegan"|"pescatarian"|"keto"|null, "allergies": string|null}. "veggie, allergic to peanuts and shellfish" → {"dietaryPreference":"vegetarian","allergies":"peanuts, shellfish"}`,
      name: `{"firstName": string}. Extract just the first name.`,
    };
    const schema = SCHEMAS[field];
    if (!schema) throw new Error(`Unknown field: ${field}`);

    const prompt = `Extract structured data from the user's message. Return ONLY a JSON object matching this schema, no prose:\n${schema}\n\nUser message: "${text}"\n\nUse null for anything not mentioned. Return only valid JSON.`;
    const content = await callAI(
      [{ role: "user", content: prompt }],
      300,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
    try {
      const match = content.match(/\{[\s\S]*\}/);
      return JSON.parse(match ? match[0] : content) as Record<string, unknown>;
    } catch {
      return {};
    }
  },
});
export const recipeInsight = action({
  args: {
    name: v.string(),
    perServing: v.object({ kcal: v.number(), p: v.number(), c: v.number(), f: v.number() }),
    ingredients: v.array(v.string()),
  },
  handler: async (ctx, { name, perServing, ingredients }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `You are a friendly nutrition coach. In 1-2 short sentences, give one specific, encouraging insight about this recipe — name a nutritional strength and (optionally) one small tweak. No preamble.\nRecipe: ${name}\nPer serving: ${perServing.kcal} kcal, ${perServing.p}g protein, ${perServing.c}g carbs, ${perServing.f}g fat\nIngredients: ${ingredients.join(", ")}`;
    return callAI(
      [{ role: "user", content: prompt }],
      140,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
  },
});

/** Frictionless recipe ingredient entry: parse a free-text ingredient list
 *  (natural portions, any units) into structured per-100g ingredients with an
 *  AI-estimated gram weight for each portion. One AI round-trip, no DB lookups. */
export const parseIngredients = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<Array<{ name: string; grams: number; caloriesPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number; source: string }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `You are a nutrition database. Parse this ingredient list (natural language, any units or portions) into structured JSON. For EACH ingredient: estimate the realistic edible weight in grams of the stated portion (e.g. "1 large banana"≈120, "1 tbsp olive oil"≈14, "2 eggs"≈100, "a handful of almonds"≈30, "1 cup cooked rice"≈195), and give standard per-100g macros. Return ONLY a JSON array, no prose:\n[{"name": string, "grams": number, "caloriesPer100g": number, "proteinPer100g": number, "carbsPer100g": number, "fatPer100g": number}]\n\nIngredients: "${text}"`;
    const content = await callAI(
      [{ role: "user", content: prompt }],
      700,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
    try {
      const match = content.match(/\[[\s\S]*\]/);
      const raw = JSON.parse(match ? match[0] : content) as any[];
      return raw
        .filter((r) => r && typeof r.name === "string" && r.name.trim())
        .map((r) => ({
          name: String(r.name).trim(),
          grams: Math.max(0, Number(r.grams) || 0),
          caloriesPer100g: Math.max(0, Number(r.caloriesPer100g) || 0),
          proteinPer100g: Math.max(0, Number(r.proteinPer100g) || 0),
          carbsPer100g: Math.max(0, Number(r.carbsPer100g) || 0),
          fatPer100g: Math.max(0, Number(r.fatPer100g) || 0),
          source: "ai",
        }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Malformed AI output parsing ingredients: ${message} - content: ${content}`);
    }
  },
});


/** Turn a free-text method into clean, ordered recipe steps. */
export const parseSteps = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<string[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `Turn this cooking method into clear, concise, ordered recipe steps. One action per step, imperative voice, no numbering or prose. Return ONLY a JSON array of strings.\n\nMethod: "${text}"`;
    const content = await callAI(
      [{ role: "user", content: prompt }],
      500,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
    try {
      const match = content.match(/\[[\s\S]*\]/);
      const raw = JSON.parse(match ? match[0] : content) as any[];
      return raw.map((s) => String(s).trim()).filter(Boolean);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Malformed AI output parsing steps: ${message} - content: ${content}`);
    }
  },
});


export const estimateMeal = action({
  args: { mealName: v.string() },
  handler: async (ctx, { mealName }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const prompt = `Estimate the nutritional values for this meal: "${mealName}".

${NUTRITION_ACCURACY_RULES}

Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
    const content = await callAI([{ role: "user", content: prompt }], 200, model, apiKey);
    const result = parseJSON<any>(content, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return { calories: result.calories || 0, protein: result.protein || 0, carbs: result.carbs || 0, fat: result.fat || 0 };
  },
});

export const parseMeal = action({
  args: {
    description: v.string(),
    mealType: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { description, mealType, time }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const parsedMeal = await parseMealDescription(description, mealType || "unspecified", time || "", model, apiKey);

    // Run deterministic nutrition calculation
    const nutrition = nutritionFromDraft(await buildMealDraftFromParsed(ctx, { ...parsedMeal, date: new Date().toISOString().split("T")[0] }, { userId, useMemory: true }));

    return {
      ...parsedMeal,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      confidence: nutrition.confidence,
      nutritionSource: nutrition.nutritionSource,
      ingredientBreakdown: nutrition.ingredientBreakdown,
    };
  },
});

export const parseWorkout = action({
  args: {
    description: v.string(),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
  },
  handler: async (ctx, { description, duration, intensity }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    let userPhysique: UserPhysique | undefined;
    if (userId) {
      const [settings, profile, metabolicProfile] = await Promise.all([
        ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
        ctx.runQuery(internal.profile.getProfileForContext, { userId }),
        ctx.runQuery(api.calibration.getMetabolicProfileForContext, {}),
      ]);
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
      if (profile) {
        userPhysique = {
          weight: profile.weight,
          height: profile.height,
          age: profile.age,
          sex: profile.sex,
          fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
          metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
        };
      }
    }
    const result = await parseWorkoutDescription(description, duration, intensity, model, apiKey, userPhysique);
    return result;
  },
});

export const logMeal = action({
  args: {
    description: v.optional(v.string()),
    mealType: v.optional(v.string()),
    time: v.optional(v.string()),
    parsedData: v.optional(v.any()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { description, mealType, time, parsedData, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = date ?? new Date().toISOString().split("T")[0];

    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;

    let data: any;
    let parsedMeal: any;
    if (parsedData) {
      parsedMeal = {
        ...parsedData,
        mealType: parsedData.mealType || mealType || "unspecified",
        time: parsedData.time || new Date().toTimeString().slice(0, 5),
        ingredients: parsedData.ingredients || [],
        cooking_method: parsedData.cooking_method || "unknown",
        portion_scale: parsedData.portion_scale ?? 1.0,
        missing_fields: parsedData.missing_fields || [],
      };
    } else if (description) {
      parsedMeal = await parseMealDescription(description, mealType || "unspecified", time || "", model, apiKey);
    } else {
      throw new Error("description or parsedData required");
    }
    if (parsedMeal.parseError) throw new Error("Meal could not be parsed. Edit it before saving.");

    const nutrition = nutritionFromDraft(await buildMealDraftFromParsed(ctx, { ...parsedMeal, date: today }, { userId, useMemory: true }));

    const draft = nutrition.ingredientBreakdown as MealDraft;
    const rawInput = description ?? JSON.stringify(parsedData ?? {});
    const groupIdempotencyKey = deriveGroupKey({
      userId,
      sourceSurface: "chat",
      rawInput: `${rawInput}\n[date:${today}]\n[time:${parsedMeal.time}]`,
    });
    const id = await ctx.runMutation((internal as any).actions_writer.writeMealAction, {
      group: { userId, groupIdempotencyKey, sourceSurface: "chat", rawInput, clientLocalDate: today },
      member: {
        memberIdempotencyKey: deriveMemberKey({ groupKey: groupIdempotencyKey, actionType: "meal", payloadFingerprint: "log-meal", ordinal: 0 }),
        payload: mealPayloadFromDraft(draft, { aiSuggestion: parsedMeal.aiSuggestion, components: parsedMeal.components, logSource: "ai" }),
        provenance: draft.nutritionSource === "database" ? "database_match" : draft.nutritionSource === "memory" ? "database_match" : "ai_estimated",
        confidence: draft.confidence,
        validation: { status: draft.unresolved.length > 0 ? "warning" : "valid", messages: draft.unresolved.map((name) => `Ambiguous food: ${name}`) },
        reversible: true,
        resolvedDate: today,
        resolvedTime: parsedMeal.time,
      },
    });
    const group = await ctx.runQuery(internal.ai.getActionGroupByKey, { userId, groupIdempotencyKey });
    if (!group) throw new Error("Action group not found after canonical write");
    await finalizeActionGroup(ctx, group._id);
    data = {
      _id: id,
      name: parsedMeal.name,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      time: parsedMeal.time,
      aiSuggestion: parsedMeal.aiSuggestion,
      mealType: parsedMeal.mealType || mealType || "unspecified",
      components: parsedMeal.components,
      confidence: nutrition.confidence,
      nutritionSource: nutrition.nutritionSource,
      ingredientBreakdown: nutrition.ingredientBreakdown,
      reportedCalories: nutrition.reportedCalories,
      estimatedCalories: nutrition.estimatedCalories,
      calorieSource: nutrition.calorieSource,
    };
    return data;
  },
});

export const logWorkout = action({
  args: {
    description: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
    parsedData: v.optional(v.any()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { description, duration, intensity, parsedData, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = date ?? new Date().toISOString().split("T")[0];

    const [settings, profile, metabolicProfile] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(api.calibration.getMetabolicProfileForContext, {}),
    ]);
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const userPhysique: UserPhysique | undefined = profile ? {
      weight: profile.weight,
      height: profile.height,
      age: profile.age,
      sex: profile.sex,
      fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
      metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
    } : undefined;

    let data: any;
    if (parsedData) {
      if (parsedData.parseError) throw new Error("Workout could not be parsed. Edit it before saving.");
      // If passed parsed data, run through calorie engine if it has exercises
      let calorieFields: any = {};
      if (parsedData.calorieResult) {
        calorieFields = {
          calorieConfidence: parsedData.calorieResult.confidence,
          calorieRangeLow: parsedData.calorieResult.range_low,
          calorieRangeHigh: parsedData.calorieResult.range_high,
          calorieEstimateRough: parsedData.calorieResult.rough,
          calorieBreakdown: JSON.stringify(parsedData.calorieResult.breakdown),
          calculationVersion: 1,
        };
      }
      const reportedCaloriesValue = parsedData.reportedCalories;
      const estimatedCaloriesValue = userPhysique?.weight && parsedData.estimatedCalories != null
        ? parsedData.estimatedCalories
        : userPhysique?.weight && parsedData.calorieResult?.total_kcal != null
          ? parsedData.calorieResult.total_kcal
          : undefined;
      const calorieSourceValue = parsedData.calorieSource ?? (reportedCaloriesValue != null ? "reported" : estimatedCaloriesValue != null ? "estimated" : undefined);
      const caloriesBurnedValue = reportedCaloriesValue ?? estimatedCaloriesValue ?? parsedData.caloriesBurned;
      const id = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
        userId, date: today,
        name: parsedData.name || "Workout",
        sets: parsedData.sets || "–",
        duration: parsedData.duration || duration || "30 min",
        intensity: parsedData.intensity || intensity || "HIGH",
        exercises: parsedData.exercises,
        rationale: parsedData.rationale,
        caloriesBurned: caloriesBurnedValue,
        reportedCalories: reportedCaloriesValue,
        estimatedCalories: estimatedCaloriesValue,
        calorieSource: calorieSourceValue,
          structuredSets: parsedData.exercises ? JSON.stringify(parsedData.exercises) : undefined,
          logSource: "ai",
          ...calorieFields,
        });
      data = { _id: id, ...parsedData };
    } else if (description) {
      const parsed = await parseWorkoutDescription(description, duration, intensity, model, apiKey, userPhysique);
      if (parsed.parseError) throw new Error("Workout could not be parsed. Edit it before saving.");
      const calorieFields = parsed.calorieResult ? {
        calorieConfidence: parsed.calorieResult.confidence,
        calorieRangeLow: parsed.calorieResult.range_low,
        calorieRangeHigh: parsed.calorieResult.range_high,
        calorieEstimateRough: parsed.calorieResult.rough,
        calorieBreakdown: JSON.stringify(parsed.calorieResult.breakdown),
        calculationVersion: 1,
      } : {};
      const reportedCaloriesValue = extractStatedWorkoutCalories(description ?? "") ?? undefined;
      const estimatedCaloriesValue = userPhysique?.weight && parsed.calorieResult?.total_kcal != null ? parsed.calorieResult.total_kcal : undefined;
      const calorieSourceValue = reportedCaloriesValue != null ? "reported" : estimatedCaloriesValue != null ? "estimated" : undefined;
      const caloriesBurnedValue = reportedCaloriesValue ?? estimatedCaloriesValue ?? parsed.caloriesBurned;
      const id = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
        userId, date: today,
        name: parsed.name, sets: parsed.sets, duration: parsed.duration,
        intensity: parsed.intensity, exercises: parsed.exercises, rationale: parsed.rationale,
        caloriesBurned: caloriesBurnedValue,
        reportedCalories: reportedCaloriesValue,
        estimatedCalories: estimatedCaloriesValue,
        calorieSource: calorieSourceValue,
        structuredSets: parsed.exercises ? JSON.stringify(parsed.exercises) : undefined,
        logSource: "ai",
        ...calorieFields,
      });
      data = { _id: id, ...parsed };
    } else {
      throw new Error("description or parsedData required");
    }

    return data;
  },
});

export const chat = action({
  args: {
    message: v.string(),
    sessionId: v.optional(v.id("chat_sessions")),
    coachType: v.optional(v.string()),
    today: v.optional(v.string()),
    image: v.optional(v.string()),
    clarificationGroupId: v.optional(v.id("actionGroups")),
    clientSubmissionId: v.optional(v.string()),
  },
  handler: async (ctx, { message, sessionId, coachType, today: todayArg, image, clarificationGroupId, clientSubmissionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const userName = identity.name ?? "Athlete";
    const today = assertValidDate(todayArg ?? new Date().toISOString().split("T")[0]);
    const restrictedGuidance = hasRestrictedRecoverySignal(message);

    // Gather context
    const [profile, todayMeals, todayWorkouts, recentCals, settings, behavior, topMemories, lastSleep, patterns, topRecipes, topWorkoutMemory, userIngredients, checkInAnswers] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
      ctx.runQuery(internal.meals.getRecentCalories, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.behavior.getBehaviorProfileForContext, { userId }),
      ctx.runQuery(internal.food_memory.getTopForContext, { userId, limit: 8 }),
      ctx.runQuery(internal.wellness.getLastSleepForContext, { userId }),
      ctx.runQuery(internal.patterns.getPatternsForContext, { userId }),
      ctx.runQuery(internal.recipes.getTopRecipesForContext, { userId }),
      ctx.runQuery(internal.workout_memory.getTopForContext, { userId, limit: 6 }),
      ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
      ctx.runQuery(internal.checkins.getAnswerContextForContext, { userId, date: today }),
    ]);

    const totalCals = todayMeals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = todayMeals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalBurned = todayWorkouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);

    let contextBlock = `USER PROFILE:\nName: ${userName}\n`;
    if (profile?.weight) contextBlock += `Weight: ${profile.weight}kg\n`;
    if (profile?.height) contextBlock += `Height: ${profile.height}cm\n`;
    if (profile?.age) contextBlock += `Age: ${profile.age}\n`;
    if (profile?.sex) contextBlock += `Sex: ${profile.sex}\n`;
    contextBlock += `Activity Level: ${profile?.activityLevel || "moderate"}\n`;
    if (profile?.goal) contextBlock += `Goal: ${profile.goal}\n`;
    if (profile?.dietaryPreference && profile.dietaryPreference !== "none") {
      contextBlock += `Dietary Preference: ${profile.dietaryPreference} (IMPORTANT: Only suggest foods that comply with this diet)\n`;
    }
    if (profile?.allergies) {
      contextBlock += `Allergies/Avoid: ${profile.allergies} (CRITICAL: Never suggest foods containing these)\n`;
    }
    if (profile?.calorieTarget) contextBlock += `Daily Calorie Target: ${profile.calorieTarget}\n`;
    if (profile?.proteinTarget) contextBlock += `Daily Protein Target: ${profile.proteinTarget}g\n`;
    const totalCarbs = todayMeals.reduce((s: number, m: any) => s + (m.carbs ?? 0), 0);
    const totalFat = todayMeals.reduce((s: number, m: any) => s + (m.fat ?? 0), 0);
    contextBlock += `\nTODAY'S LOG (${today}):\nCalories consumed: ${totalCals}\nCalories burned: ${totalBurned}\nNet calories: ${totalCals - totalBurned}\nProtein: ${totalProtein}g | Carbs: ${totalCarbs}g | Fat: ${totalFat}g\nMeals logged: ${todayMeals.length}\n`;
    if (todayMeals.length > 0) {
      contextBlock += `Meals:\n`;
      todayMeals.forEach((m: any) => {
        contextBlock += `- ${m.name} at ${m.time}: ${m.calories}cal, P:${m.protein}g C:${m.carbs}g F:${m.fat}g`;
        if (m.mealType) contextBlock += ` (${m.mealType})`;
        contextBlock += `\n`;
      });
    }
    contextBlock += `Workouts logged: ${todayWorkouts.length}\n`;
    if (todayWorkouts.length > 0) {
      contextBlock += `Workouts:\n`;
      todayWorkouts.forEach((w: any) => {
        contextBlock += `- ${w.name}: ${w.duration || "?"}, ${w.intensity}, ${w.caloriesBurned ?? 0}kcal burned`;
        if (w.exercises?.length) {
          contextBlock += ` [${w.exercises.map((e: any) => e.name).join(", ")}]`;
        }
        contextBlock += `\n`;
      });
    }
    contextBlock += `\nRECENT 7-DAY TREND:\n${recentCals.map((d: any) => `${d.date}: ${d.cals}cal`).join(", ")}`;
    if (checkInAnswers) {
      contextBlock += `\n\nTODAY'S CHECK-IN ANSWERS:\n${checkInAnswers}\n`;
    }

    const loggingPrompt = `\n\nDIRECT LOGGING CAPABILITY:
You can log multiple items directly when the user describes them. Append log blocks at the very end of your response.

Today's date is ${today}. Each log block can include an optional "date" field (YYYY-MM-DD). If the user says "yesterday", "2 days ago", or names a specific past day, set the date accordingly. Default is today.

For meals: ⟦LOG_MEAL⟧{"description":"full meal description","mealType":"breakfast|lunch|dinner|snack","time":"HH:MM or empty string","date":"YYYY-MM-DD or UNKNOWN_VAGUE","question":"optional clarification question","validation":{"status":"valid|warning|error","messages":[]}}⟦/LOG_MEAL⟧
For workouts: ⟦LOG_WORKOUT⟧{"description":"full workout description with exercises, sets, reps, weights","date":"YYYY-MM-DD or UNKNOWN_VAGUE","question":"optional clarification question","validation":{"status":"valid|warning|error","messages":[]}}⟦/LOG_WORKOUT⟧
For sleep: ⟦LOG_SLEEP⟧{"hours":6.5,"quality":"poor|ok|good|great","date":"YYYY-MM-DD or UNKNOWN_VAGUE","question":"optional clarification question","validation":{"status":"valid|warning|error","messages":[]}}⟦/LOG_SLEEP⟧
For water: ⟦LOG_WATER⟧{"ml":500,"date":"YYYY-MM-DD or UNKNOWN_VAGUE","question":"optional clarification question","validation":{"status":"valid|warning|error","messages":[]}}⟦/LOG_WATER⟧
For mood: ⟦LOG_MOOD⟧{"rating":3,"note":"optional note","date":"YYYY-MM-DD or UNKNOWN_VAGUE","question":"optional clarification question","validation":{"status":"valid|warning|error","messages":[]}}⟦/LOG_MOOD⟧
For steps: ⟦LOG_STEPS⟧{"count":8000,"date":"YYYY-MM-DD or UNKNOWN_VAGUE","question":"optional clarification question","validation":{"status":"valid|warning|error","messages":[]}}⟦/LOG_STEPS⟧

Rules:
- Append ALL relevant log blocks when the user reports multiple activities (e.g. meal + water → append both blocks)
- ONLY append log blocks when the user is clearly reporting what they did/ate/slept
- If user says "yesterday I had X" → use yesterday's date in the log block
- Sleep descriptions ("slept X hours", "went to bed at X", "woke up at Y") → LOG_SLEEP, NOT LOG_WORKOUT
- Your message text (before the blocks) should confirm what you logged AND mention the date if it's not today
- YOU MUST include the markers exactly as shown.
- Vague historical time references such as "a while ago", "last week sometime", "recently", "the other day", or "a few days ago" must NOT be resolved to a guessed date. Set the "date" field to "UNKNOWN_VAGUE" and include a brief "question" asking for the exact date (e.g. "Which date did you have this?").
- Vague workout descriptions with no identifiable exercise must NOT invent a synthetic exercise. Set the "date" field to "UNKNOWN_VAGUE" and include a "question" asking what exercise the user did.
- If you are uncertain about an entry, set "validation.status" to "warning" and the app will ask for confirmation before saving.`;

    // Load session history
    let history: { role: string; content: string }[] = [];
    let isFirstMessage = false;
    if (sessionId) {
      const [msgs, count] = await Promise.all([
        ctx.runQuery(internal.chat.getMessagesForContext, { userId, sessionId }),
        ctx.runQuery(internal.chat.getMessageCount, { sessionId }),
      ]);
      history = msgs;
      isFirstMessage = count === 0;
    }

    // Save user message
    await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "user", content: message });

    // Free-text clarification answer: if the user provided a groupId and a resolvable date,
    // write the pending group immediately without another AI round-trip.
    if (clarificationGroupId) {
      let answerDate: string | undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(message.trim())) {
        answerDate = message.trim();
      } else {
        const resolved = resolveChatActionDate({ relativePhrase: message.trim(), actionKind: "actual" }, settings?.timezoneOffsetMinutes ?? 0);
        if (resolved.status === "resolved") answerDate = resolved.date;
      }
      if (answerDate) {
        const resolved = await executeClarificationResolution(ctx, userId, clarificationGroupId as unknown as string, answerDate);
        const resolvedReply = resolved.loggedItems.length > 0
          ? `Saved ${resolved.loggedItems.map((item: any) => item.data?.name ?? item.type).join(", ")} for ${answerDate}.`
          : `I couldn't save that. Please try again.`;
        await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "ai", content: resolvedReply });
        if (sessionId) {
          await ctx.runMutation(internal.chat.touchSession, { sessionId });
        }
        const loggedItem = resolved.loggedItems.length === 1
          ? resolved.loggedItems[0]
          : resolved.loggedItems.length > 1
            ? { type: "multiple", items: resolved.loggedItems }
            : null;
        return { reply: resolvedReply, loggedItem, memoryApprovals: resolved.memoryApprovals ?? [], failedItems: [], coachType: toLegacyPersona(coachType), restricted: restrictedGuidance };
      }
    }

    // Detect coach (keyword routing, biased toward the user's preferred coach)
    let detectedCoach: CoachType = toLegacyPersona(coachType) as CoachType;
    if (!coachType || coachType === "auto") detectedCoach = classifyCoachType(message, behavior?.preferredCoach);
    const coach = getCoach(detectedCoach);

    // Known food memory context
    if (Array.isArray(topMemories) && topMemories.length > 0) {
      contextBlock += `\nUSER'S KNOWN FOODS (from memory — use these when the user mentions their usual meals):\n`;
      for (const m of topMemories as any[]) {
        contextBlock += `- ${m.name}: ~${m.kcal} kcal, P:${m.protein}g C:${m.carbs}g F:${m.fat}g (logged ${m.timesLogged}×${m.components ? `, ingredients: ${m.components}` : ""})\n`;
      }
    }

    // Personal ingredient database
    if (Array.isArray(userIngredients) && userIngredients.length > 0) {
      contextBlock += `\nUSER'S PERSONAL INGREDIENTS (use these instead of generic values when estimating nutrition):\n`;
      for (const ing of userIngredients as any[]) {
        const macros = [
          ing.caloriesPer100g != null ? `${ing.caloriesPer100g} kcal/100g` : null,
          ing.proteinPer100g != null ? `${ing.proteinPer100g}g P/100g` : null,
          ing.carbsPer100g != null ? `${ing.carbsPer100g}g C/100g` : null,
          ing.fatPer100g != null ? `${ing.fatPer100g}g F/100g` : null,
        ].filter(Boolean).join(", ");
        contextBlock += `- ${ing.name}: ${macros || "custom"}${ing.notes ? ` (${ing.notes})` : ""}\n`;
      }
    }

    // Known workout memory
    if (Array.isArray(topWorkoutMemory) && topWorkoutMemory.length > 0) {
      contextBlock += `\nUSER'S KNOWN WORKOUTS (from memory):\n`;
      for (const w of topWorkoutMemory as any[]) {
        const parts = [`${w.name} (logged ${w.timesLogged}×)`];
        if (w.intensity) parts.push(w.intensity);
        if (w.durationMin) parts.push(`~${Math.round(w.durationMin)} min`);
        if (w.caloriesBurned) parts.push(`~${Math.round(w.caloriesBurned)} kcal`);
        contextBlock += `- ${parts.join(", ")}\n`;
      }
    }

    // Saved recipes
    if (Array.isArray(topRecipes) && topRecipes.length > 0) {
      contextBlock += `\nUSER'S SAVED RECIPES:\n`;
      for (const r of topRecipes as any[]) {
        contextBlock += `- ${r.name} (${r.servings} servings): ${r.kcalPerServing} kcal/serving, P:${r.proteinPerServing}g C:${r.carbsPerServing}g F:${r.fatPerServing}g\n`;
      }
    }

    // Last night's sleep (Phase 3: cross-domain)
    if (lastSleep) {
      const sleepLabel = (lastSleep as any).date === today ? "Today" : "Last night";
      const sleepValue = (lastSleep as any).hours != null
        ? `${(lastSleep as any).hours}h`
        : (lastSleep as any).band ?? "unknown duration";
      contextBlock += `\nSLEEP: ${sleepLabel} — ${sleepValue}, quality: ${(lastSleep as any).quality ?? "unknown"}\n`;
    }

    // Behavioral patterns (Phase 1b)
    if (Array.isArray(patterns) && patterns.length > 0) {
      contextBlock += `\nBEHAVIORAL PATTERNS (last 28 days):\n`;
      for (const p of patterns as string[]) contextBlock += `- ${p}\n`;
    }

    // Behavioral memory + tone layer (Phase 3+4: sleep + acceptance rate)
    const behaviorLine = behaviorSummary({ ...(behavior ?? {}), acceptRate: (behavior as any)?.acceptRate ?? null });
    const toneLine = toneInstruction(settings?.coachingStyle, {
      sleepHours: lastSleep && (lastSleep as any).hours != null ? (lastSleep as any).hours : undefined,
      sleepQuality: lastSleep ? (lastSleep as any).quality : undefined,
      acceptRate: (behavior as any)?.acceptRate ?? undefined,
    });
    const personaSuffix = [behaviorLine, toneLine].filter(Boolean).join("\n");

    const messages: AIMessage[] = [
      { role: "system", content: `${coach.systemPrompt}${personaSuffix ? `\n\n${personaSuffix}` : ""}\n\n${contextBlock}${loggingPrompt}${restrictedGuidance ? `\n\n${RESTRICTED_GUIDANCE}` : ""}` },
      ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content })),
      image
        ? {
            role: "user",
            content: [
              { type: "text", text: message || "What do you see in this image? If it's food, estimate the macros and offer to log it." },
              { type: "image_url", image_url: { url: image } },
            ],
          }
        : { role: "user", content: message },
    ];

    const settingsModel = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    // Split-model: parsing/extraction stays cheap (user override → else DEFAULT_MODEL
    // inside callAI); the chat reply users read gets the upgraded CHAT_MODEL.
    const parseModel = settingsModel;
    const replyModel = settingsModel ?? CHAT_MODEL; // Sonnet handles text + vision
    const reply = await callAI(messages, 800, replyModel, apiKey);

    // Parse log blocks — support multiple items and new types
    let cleanReply = reply;
    const loggedItems: any[] = [];
    const memoryApprovals: any[] = [];
    const logOutcomes: Array<{ type: string; name: string; ok: boolean; error?: string; errorCode?: string; actionId?: string; groupId?: string }> = [];
    type MealRetryArgs = {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      time: string;
      date: string;
      aiSuggestion?: string;
      mealType?: string;
      components?: string;
      confidence?: number;
      nutritionSource?: string;
      structuredItems?: string;
      ingredientBreakdown?: string;
      logSource: string;
    };
    type WorkoutRetryArgs = {
      name: string;
      sets: string;
      duration?: string;
      intensity: string;
      date: string;
      exercises?: unknown;
      rationale?: string;
      caloriesBurned?: number;
      reportedCalories?: number;
      estimatedCalories?: number;
      calorieSource?: "reported" | "estimated";
      calorieEstimateProvenance?: string;
      structuredSets?: string;
      timestamp: string;
      logSource: string;
      calorieConfidence?: number;
      calorieRangeLow?: number;
      calorieRangeHigh?: number;
      calorieBreakdown?: string;
      calculationVersion?: number;
    };
    type FailedLogItem =
      | { kind: "meal"; code: string; description: string; retryArgs: MealRetryArgs }
      | { kind: "workout"; code: string; description: string; retryArgs: WorkoutRetryArgs };
    const failedItems: FailedLogItem[] = [];
    const submissionRawInput = image ? `${message}\n[image:${stableHash(image)}]` : message;
    const chatGroupKey = deriveGroupKey({ userId, sourceSurface: "chat", rawInput: submissionRawInput, clientSubmissionId });
    const chatGroup = {
      userId,
      groupIdempotencyKey: chatGroupKey,
      clientSubmissionId,
      sourceSurface: "chat" as const,
      rawInput: submissionRawInput,
      clientLocalDate: today,
    };

    // Candidates held for clarification instead of being written immediately.
    type PendingCandidate = {
      actionType: "meal" | "workout" | "recovery";
      description: string;
      payload: any;
      confidence?: number;
      resolvedDate?: string;
      resolvedTime?: string;
      provenance: "user_reported" | "ai_extracted" | "ai_estimated" | "database_match";
      validation: { status: "valid" | "warning" | "error"; messages: string[] };
      reason: string;
      question?: string;
      ordinal: number;
    };
    type ParsedCandidate = Omit<PendingCandidate, "reason"> & { reason?: string };
    const pendingCandidates: PendingCandidate[] = [];
    const parsedCandidates: ParsedCandidate[] = [];

    // Strip all log blocks from the reply text
    cleanReply = reply
      .replace(/⟦LOG_MEAL⟧[\s\S]*?⟦\/LOG_MEAL⟧/g, "")
      .replace(/⟦LOG_WORKOUT⟧[\s\S]*?⟦\/LOG_WORKOUT⟧/g, "")
      .replace(/⟦LOG_SLEEP⟧[\s\S]*?⟦\/LOG_SLEEP⟧/g, "")
      .replace(/⟦LOG_WATER⟧[\s\S]*?⟦\/LOG_WATER⟧/g, "")
      .replace(/⟦LOG_MOOD⟧[\s\S]*?⟦\/LOG_MOOD⟧/g, "")
      .replace(/⟦LOG_STEPS⟧[\s\S]*?⟦\/LOG_STEPS⟧/g, "")
      .trim();

    function resolveMarkerDate(dateValue: unknown): { date: string; resolution: import("./time_resolve").ActionDateResolution } {
      if (dateValue === "UNKNOWN_VAGUE") {
        return { date: today, resolution: { status: "needs_clarification", reason: "The date is too vague; provide an exact date" } };
      }
      if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return { date: dateValue, resolution: resolveChatActionDate({ explicitDate: dateValue, actionKind: "actual" }, settings?.timezoneOffsetMinutes ?? 0) };
      }
      const resolution = resolveChatActionDate({ actionKind: "actual" }, settings?.timezoneOffsetMinutes ?? 0);
      return { date: today, resolution };
    }

    // Meal
    const mealMatches = [...reply.matchAll(/⟦LOG_MEAL⟧([\s\S]*?)⟦\/LOG_MEAL⟧/g)];
    for (const [mealIndex, mealMatch] of mealMatches.entries()) {
      let retryArgs: MealRetryArgs | undefined;
      let retryDescription = "meal";
      try {
        const logData = JSON.parse(mealMatch[1].trim());
        retryDescription = logData.description || message;
        const { date: initialDate, resolution: dateResolution } = resolveMarkerDate(logData.date);
        const parsed = await parseMealDescription(logData.description || message, logData.mealType || "unspecified", logData.time || "", parseModel, apiKey);
        if (parsed.parseError) {
          logOutcomes.push({ type: "meal", name: parsed.name || "meal", ok: false, error: parsed.parseError, errorCode: "PARSE_ERROR" });
          continue;
        }
        const targetDate = dateResolution.status === "resolved" ? dateResolution.date : initialDate;
        const exposedResolvedDate = dateResolution.status === "resolved" ? dateResolution.date : undefined;
        const nutrition = nutritionFromDraft(await buildMealDraftFromParsed(ctx, { ...parsed, date: targetDate }, { userId, useMemory: true }));
        const draft = nutrition.ingredientBreakdown as MealDraft;
        const finalStructuredItems = JSON.stringify(draft.ingredients);
        const finalIngredientBreakdown = JSON.stringify(draft);
        retryArgs = {
          name: parsed.name,
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          time: parsed.time,
          date: targetDate,
          aiSuggestion: parsed.aiSuggestion,
          mealType: parsed.mealType,
          components: parsed.components,
          confidence: nutrition.confidence,
          nutritionSource: nutrition.nutritionSource,
          structuredItems: finalStructuredItems,
          ingredientBreakdown: finalIngredientBreakdown,
          logSource: "coach",
        };
        const mealPayload = mealPayloadFromDraft(draft, {
          aiSuggestion: parsed.aiSuggestion,
          mealType: parsed.mealType,
          components: parsed.components,
          logSource: "coach",
        });
        const mealValidation = parseMarkerValidation(logData);
        const reason = clarifyingReason(logData.date, dateResolution, nutrition.confidence, mealValidation.status, draft.ingredients.length > 0 && draft.unresolved.length > 0);
        const candidate: ParsedCandidate = {
          actionType: "meal",
          description: retryDescription,
          payload: mealPayload,
          confidence: nutrition.confidence,
          resolvedDate: exposedResolvedDate,
          resolvedTime: parsed.time,
          provenance: "ai_extracted",
          validation: mealValidation,
          reason: reason ?? undefined,
          question: logData.question,
          ordinal: parsedCandidates.length,
        };
        parsedCandidates.push(candidate);
        if (reason) {
          pendingCandidates.push({ ...candidate, reason });
          logOutcomes.push({ type: "meal", name: parsed.name || "meal", ok: false, error: reason, errorCode: "CLARIFICATION_NEEDED" });
          continue;
        }
      } catch (err) {
        const message = getConvexErrorMessage(err) ?? (err instanceof Error ? err.message : String(err));
        const errorCode = getConvexErrorCode(err);
        logOutcomes.push({ type: "meal", name: "meal", ok: false, error: message, errorCode });
        if (retryArgs && errorCode === "NEAR_DUPLICATE") {
          failedItems.push({
            kind: "meal",
            code: errorCode,
            description: retryDescription,
            retryArgs,
          });
        }
        console.error("Failed to log meal from AI:", err);
      }
    }

    // Workout
    const workoutMatches = [...reply.matchAll(/⟦LOG_WORKOUT⟧([\s\S]*?)⟦\/LOG_WORKOUT⟧/g)];
    for (const [workoutIndex, workoutMatch] of workoutMatches.entries()) {
      let retryArgs: WorkoutRetryArgs | undefined;
      let retryDescription = "workout";
      try {
        const logData = JSON.parse(workoutMatch[1].trim());
        retryDescription = logData.description || message;
        const { date: initialDate, resolution: dateResolution } = resolveMarkerDate(logData.date);
        const timestamp = new Date().toISOString().slice(11, 16);
        const metabolicProfile: any = await ctx.runQuery(api.calibration.getMetabolicProfileForContext, {});
        const userPhysique: UserPhysique | undefined = profile ? {
          weight: profile.weight, height: profile.height, age: profile.age, sex: profile.sex,
          fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
          metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
        } : undefined;
        const parsed = await parseWorkoutDescription(logData.description || message, undefined, undefined, parseModel, apiKey, userPhysique);
        if (parsed.parseError) {
          logOutcomes.push({ type: "workout", name: parsed.name || "workout", ok: false, error: parsed.parseError, errorCode: "PARSE_ERROR" });
          continue;
        }
        const calorieFields = parsed.calorieResult ? {
          calorieConfidence: parsed.calorieResult.confidence, calorieRangeLow: parsed.calorieResult.range_low,
          calorieRangeHigh: parsed.calorieResult.range_high, calorieEstimateRough: parsed.calorieResult.rough,
          calorieBreakdown: JSON.stringify(parsed.calorieResult.breakdown), calculationVersion: 1,
        } : {};
        const targetDate = dateResolution.status === "resolved" ? dateResolution.date : initialDate;
        const exposedResolvedDate = dateResolution.status === "resolved" ? dateResolution.date : undefined;
        const workoutConfidence = parsed.calorieResult?.confidence;
        const reportedCaloriesValue = extractStatedWorkoutCalories(logData.description || message) ?? undefined;
        const estimatedCaloriesValue = profile?.weight && parsed.calorieResult?.total_kcal != null ? parsed.calorieResult.total_kcal : undefined;
        const calorieSourceValue = reportedCaloriesValue != null ? "reported" : estimatedCaloriesValue != null ? "estimated" : undefined;
        const caloriesBurnedValue = reportedCaloriesValue ?? estimatedCaloriesValue ?? parsed.caloriesBurned;
        retryArgs = {
          name: parsed.name,
          sets: parsed.sets,
          duration: parsed.duration,
          intensity: parsed.intensity,
          date: targetDate,
          exercises: parsed.exercises,
          rationale: parsed.rationale,
          caloriesBurned: caloriesBurnedValue,
          reportedCalories: reportedCaloriesValue,
          estimatedCalories: estimatedCaloriesValue,
          calorieSource: calorieSourceValue,
          structuredSets: parsed.exercises ? JSON.stringify(parsed.exercises) : undefined,
          timestamp,
          logSource: "coach",
          ...calorieFields,
        };
        const workoutPayload = {
          date: targetDate, name: parsed.name, sets: parsed.sets, duration: parsed.duration,
          intensity: parsed.intensity, exercises: parsed.exercises, rationale: parsed.rationale,
          caloriesBurned: caloriesBurnedValue,
          reportedCalories: reportedCaloriesValue,
          estimatedCalories: estimatedCaloriesValue,
          calorieSource: calorieSourceValue,
          structuredSets: parsed.exercises ? JSON.stringify(parsed.exercises) : undefined,
          timestamp, logSource: "coach", ...calorieFields,
        };
        const workoutValidation = parseMarkerValidation(logData);
        const reason = clarifyingReason(logData.date, dateResolution, workoutConfidence, workoutValidation.status);
        const candidate: ParsedCandidate = {
          actionType: "workout",
          description: retryDescription,
          payload: workoutPayload,
          confidence: workoutConfidence,
          resolvedDate: exposedResolvedDate,
          resolvedTime: timestamp,
          provenance: "ai_extracted",
          validation: workoutValidation,
          reason: reason ?? undefined,
          question: logData.question,
          ordinal: parsedCandidates.length,
        };
        parsedCandidates.push(candidate);
        if (reason) {
          pendingCandidates.push({ ...candidate, reason });
          logOutcomes.push({ type: "workout", name: parsed.name || "workout", ok: false, error: reason, errorCode: "CLARIFICATION_NEEDED" });
          continue;
        }
      } catch (err) {
        const message = getConvexErrorMessage(err) ?? (err instanceof Error ? err.message : String(err));
        const errorCode = getConvexErrorCode(err);
        logOutcomes.push({ type: "workout", name: "workout", ok: false, error: message, errorCode });
        if (retryArgs && errorCode === "NEAR_DUPLICATE") {
          failedItems.push({
            kind: "workout",
            code: errorCode,
            description: retryDescription,
            retryArgs,
          });
        }
        console.error("Failed to log workout from AI:", err);
      }
    }

    // Sleep
    const sleepMatches = [...reply.matchAll(/⟦LOG_SLEEP⟧([\s\S]*?)⟦\/LOG_SLEEP⟧/g)];
    for (const [sleepIndex, sleepMatch] of sleepMatches.entries()) {
      try {
        const logData = JSON.parse(sleepMatch[1].trim());
        const { date: initialDate, resolution: dateResolution } = resolveMarkerDate(logData.date);
        const targetDate = dateResolution.status === "resolved" ? dateResolution.date : initialDate;
        const exposedResolvedDate = dateResolution.status === "resolved" ? dateResolution.date : undefined;
        const parsedHours = typeof logData.hours === "number" && Number.isFinite(logData.hours) ? logData.hours : undefined;
        const parsedBand = ["under_6", "six_to_eight", "eight_plus"].includes(logData.band) ? logData.band : undefined;
        const parsedQuality = ["poor", "ok", "good", "great"].includes(logData.quality) ? logData.quality : undefined;
        const sleepDraft = buildRecoveryDraft({ kind: "sleep", date: targetDate, hours: parsedHours, band: parsedBand, quality: parsedQuality, source: "ai_extracted" });
        const sleepPayload = recoveryPayloadFromDraft(sleepDraft);
        const sleepValidation = parseMarkerValidation(logData);
        const reason = clarifyingReason(logData.date, dateResolution, undefined, sleepValidation.status)
          ?? (sleepDraft.unresolved.length > 0 ? "Sleep hours or band is required" : null);
        const candidate: ParsedCandidate = {
          actionType: "recovery",
          description: `Sleep ${parsedHours != null ? `${parsedHours}h` : parsedBand ?? "value needed"}${parsedQuality ? ` (${parsedQuality})` : ""}`,
          payload: sleepPayload,
          resolvedDate: exposedResolvedDate,
          provenance: "ai_extracted",
          validation: sleepValidation,
          reason: reason ?? undefined,
          question: logData.question,
          ordinal: parsedCandidates.length,
        };
        parsedCandidates.push(candidate);
        if (reason) {
          pendingCandidates.push({ ...candidate, reason });
          logOutcomes.push({ type: "sleep", name: "sleep", ok: false, error: reason, errorCode: "CLARIFICATION_NEEDED" });
          continue;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logOutcomes.push({ type: "sleep", name: "sleep", ok: false, error: message });
        console.error("Failed to log sleep from AI:", err);
      }
    }

    // Water
    const waterMatches = [...reply.matchAll(/⟦LOG_WATER⟧([\s\S]*?)⟦\/LOG_WATER⟧/g)];
    for (const [waterIndex, waterMatch] of waterMatches.entries()) {
      try {
        const logData = JSON.parse(waterMatch[1].trim());
        const { date: initialDate, resolution: dateResolution } = resolveMarkerDate(logData.date);
        const targetDate = dateResolution.status === "resolved" ? dateResolution.date : initialDate;
        const exposedResolvedDate = dateResolution.status === "resolved" ? dateResolution.date : undefined;
        const ml = typeof logData.ml === "number" && Number.isFinite(logData.ml) ? logData.ml : undefined;
        const time = new Date().toTimeString().slice(0, 5);
        const waterDraft = buildRecoveryDraft({ kind: "water", ml, date: targetDate, time, source: "ai_extracted" });
        const waterPayload = recoveryPayloadFromDraft(waterDraft);
        const waterValidation = parseMarkerValidation(logData);
        const reason = clarifyingReason(logData.date, dateResolution, undefined, waterValidation.status)
          ?? (waterDraft.unresolved.length > 0 ? "Water amount is required" : null);
        const candidate: ParsedCandidate = {
          actionType: "recovery",
          description: `Water ${ml != null ? `${ml}ml` : "value needed"}`,
          payload: waterPayload,
          resolvedDate: exposedResolvedDate,
          resolvedTime: time,
          provenance: "ai_extracted",
          validation: waterValidation,
          reason: reason ?? undefined,
          question: logData.question,
          ordinal: parsedCandidates.length,
        };
        parsedCandidates.push(candidate);
        if (reason) {
          pendingCandidates.push({ ...candidate, reason });
          logOutcomes.push({ type: "water", name: "water", ok: false, error: reason, errorCode: "CLARIFICATION_NEEDED" });
          continue;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logOutcomes.push({ type: "water", name: "water", ok: false, error: message });
        console.error("Failed to log water from AI:", err);
      }
    }

    // Mood
    const moodMatches = [...reply.matchAll(/⟦LOG_MOOD⟧([\s\S]*?)⟦\/LOG_MOOD⟧/g)];
    for (const [moodIndex, moodMatch] of moodMatches.entries()) {
      try {
        const logData = JSON.parse(moodMatch[1].trim());
        const { date: initialDate, resolution: dateResolution } = resolveMarkerDate(logData.date);
        const targetDate = dateResolution.status === "resolved" ? dateResolution.date : initialDate;
        const exposedResolvedDate = dateResolution.status === "resolved" ? dateResolution.date : undefined;
        const rating = typeof logData.rating === "number" && Number.isFinite(logData.rating) ? logData.rating : undefined;
        const time = new Date().toTimeString().slice(0, 5);
        const moodDraft = buildRecoveryDraft({ kind: "mood", rating, date: targetDate, time, note: logData.note, source: "ai_extracted" });
        const moodPayload = recoveryPayloadFromDraft(moodDraft);
        const moodValidation = parseMarkerValidation(logData);
        const reason = clarifyingReason(logData.date, dateResolution, undefined, moodValidation.status)
          ?? (moodDraft.unresolved.length > 0 ? "Mood rating is required" : null);
        const candidate: ParsedCandidate = {
          actionType: "recovery",
          description: `Mood ${rating != null ? `${rating}/5` : "value needed"}`,
          payload: moodPayload,
          resolvedDate: exposedResolvedDate,
          resolvedTime: time,
          provenance: "ai_extracted",
          validation: moodValidation,
          reason: reason ?? undefined,
          question: logData.question,
          ordinal: parsedCandidates.length,
        };
        parsedCandidates.push(candidate);
        if (reason) {
          pendingCandidates.push({ ...candidate, reason });
          logOutcomes.push({ type: "mood", name: "mood", ok: false, error: reason, errorCode: "CLARIFICATION_NEEDED" });
          continue;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logOutcomes.push({ type: "mood", name: "mood", ok: false, error: message });
        console.error("Failed to log mood from AI:", err);
      }
    }

    // Steps
    const stepsMatches = [...reply.matchAll(/⟦LOG_STEPS⟧([\s\S]*?)⟦\/LOG_STEPS⟧/g)];
    for (const [stepsIndex, stepsMatch] of stepsMatches.entries()) {
      try {
        const logData = JSON.parse(stepsMatch[1].trim());
        const { date: initialDate, resolution: dateResolution } = resolveMarkerDate(logData.date);
        const targetDate = dateResolution.status === "resolved" ? dateResolution.date : initialDate;
        const exposedResolvedDate = dateResolution.status === "resolved" ? dateResolution.date : undefined;
        const count = typeof logData.count === "number" && Number.isFinite(logData.count) ? logData.count : undefined;
        const stepsDraft = buildRecoveryDraft({ kind: "steps", count, date: targetDate, source: "ai_extracted" });
        const stepsPayload = recoveryPayloadFromDraft(stepsDraft);
        const stepsValidation = parseMarkerValidation(logData);
        const reason = clarifyingReason(logData.date, dateResolution, undefined, stepsValidation.status)
          ?? (stepsDraft.unresolved.length > 0 ? "Step count is required" : null);
        const candidate: ParsedCandidate = {
          actionType: "recovery",
          description: `Steps ${count != null ? count : "value needed"}`,
          payload: stepsPayload,
          resolvedDate: exposedResolvedDate,
          provenance: "ai_extracted",
          validation: stepsValidation,
          reason: reason ?? undefined,
          question: logData.question,
          ordinal: parsedCandidates.length,
        };
        parsedCandidates.push(candidate);
        if (reason) {
          pendingCandidates.push({ ...candidate, reason });
          logOutcomes.push({ type: "steps", name: "steps", ok: false, error: reason, errorCode: "CLARIFICATION_NEEDED" });
          continue;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logOutcomes.push({ type: "steps", name: "steps", ok: false, error: message });
        console.error("Failed to log steps from AI:", err);
      }
    }

    let confirmation: {
      groupId: string;
      items: Array<{
        actionType: string;
        description: string;
        resolvedDate?: string;
        confidence?: number;
        provenance: string;
        validation: { status: "valid" | "warning" | "error"; messages: string[] };
        ordinal: number;
      }>;
    } | undefined;
    let confirmationRequested = false;

    async function writeCandidate(candidate: ParsedCandidate): Promise<void> {
      const member = markerMember(
        chatGroupKey,
        candidate.actionType,
        candidate.payload,
        candidate.ordinal,
        candidate.confidence,
        candidate.validation,
        candidate.resolvedDate,
      );
      member.resolvedTime = candidate.resolvedTime;
      let rowId: string;
      let previous: unknown;
      if (candidate.actionType === "meal") {
        rowId = String(await ctx.runMutation((internal as any).actions_writer.writeMealAction, { group: chatGroup, member }));
      } else if (candidate.actionType === "workout") {
        rowId = String(await ctx.runMutation((internal as any).actions_writer.writeWorkoutAction, { group: chatGroup, member }));
      } else {
        const result = await ctx.runMutation((internal as any).actions_writer.writeRecoveryAction, { group: chatGroup, member });
        rowId = String(result?.id ?? result);
        previous = result?.previous;
      }
      const table = candidate.actionType === "meal"
        ? "meals"
        : candidate.actionType === "workout"
          ? "workouts"
          : `${candidate.payload.kind}_logs`;
      const actionMetadata = await committedActionMetadata(ctx, userId, table, rowId);
      const type = candidate.actionType === "recovery" ? candidate.payload.kind : candidate.actionType;
      loggedItems.push({
        type,
        data: {
          _id: rowId,
          ...candidate.payload,
          previous,
          provenance: candidate.provenance,
          confidence: candidate.confidence,
          validation: candidate.validation,
          ...actionMetadata,
        },
      });
      if (actionMetadata.actionId) {
        memoryApprovals.push(...await pendingMemoryApprovalsForAction(ctx, userId, actionMetadata.actionId));
      }
      logOutcomes.push({ type, name: candidate.description, ok: true, ...actionMetadata });
    }

    if (parsedCandidates.length > AUTO_WRITE_MAX_ACTIONS) {
      confirmationRequested = true;
      confirmation = { groupId: "", items: [] };
    }
    const readyCandidates = parsedCandidates.filter((candidate) => !candidate.reason);
    const candidatesToStage = parsedCandidates;
    let stagedGroupId: string | undefined;
    const stagedMembersByKey = new Map<string, { _id: string }>();
    if (candidatesToStage.length > 0) {
      const stagedMembers = candidatesToStage.map((candidate) => ({
        ...markerMember(
          chatGroupKey,
          candidate.actionType,
          candidate.payload,
          candidate.ordinal,
          candidate.confidence,
          candidate.validation,
          candidate.resolvedDate,
        ),
        actionType: candidate.actionType,
        ordinal: candidate.ordinal,
      }));
      const staged: { groupId: string } = await ctx.runMutation(internal.ai.stageClarificationGroup, {
        userId,
        groupIdempotencyKey: chatGroupKey,
        sourceSurface: "chat",
        rawInput: submissionRawInput,
        model: parseModel,
        clientLocalDate: today,
        createdAt: Date.now(),
        members: stagedMembers,
      });
      stagedGroupId = staged.groupId;
      const stagedRows: any[] = await ctx.runQuery(internal.ai.getPendingMembersForClarification, { groupId: staged.groupId as any });
      for (const row of stagedRows) stagedMembersByKey.set(row.memberIdempotencyKey, row);
    }
    if (!confirmationRequested) {
      for (const candidate of readyCandidates) {
        try {
          await writeCandidate(candidate);
        } catch (err) {
          const error = getConvexErrorMessage(err) ?? (err instanceof Error ? err.message : String(err));
          const errorCode = getConvexErrorCode(err);
          logOutcomes.push({ type: candidate.actionType, name: candidate.description, ok: false, error, errorCode });
          const member = stagedMembersByKey.get(markerMember(
            chatGroupKey,
            candidate.actionType,
            candidate.payload,
            candidate.ordinal,
            candidate.confidence,
            candidate.validation,
            candidate.resolvedDate,
          ).memberIdempotencyKey);
          if (member) {
            await ctx.runMutation(internal.ai.recordConfirmationMemberFailure, { actionId: member._id as any, error });
          }
          console.error("Failed to log parsed AI action:", err);
        }
      }
      if (readyCandidates.length > 0) {
        const chatGroupRow = await ctx.runQuery(internal.ai.getActionGroupByKey, { userId, groupIdempotencyKey: chatGroupKey });
        if (chatGroupRow) await finalizeActionGroup(ctx, chatGroupRow._id);
      }
    }

    if (logOutcomes.length > 0 && !confirmationRequested) {
      const saved = logOutcomes.filter((outcome) => outcome.ok);
      const failed = logOutcomes.filter((outcome) => !outcome.ok);
      const statusParts: string[] = [];
      if (saved.length > 0) {
        statusParts.push(`Saved ${saved.map((outcome) => outcome.name).join(", ")}.`);
      }
      if (failed.length > 0) {
        const duplicate = failed.some((outcome) => outcome.errorCode === "NEAR_DUPLICATE");
        const otherFailures = failed.filter((outcome) => outcome.errorCode !== "NEAR_DUPLICATE");
        if (duplicate) {
          statusParts.push("I did not save the duplicate-looking log. Confirm or edit it if you want to log it anyway.");
        }
        if (otherFailures.length > 0) {
          const parseError = otherFailures.some((outcome) => outcome.errorCode === "PARSE_ERROR");
          statusParts.push(parseError
            ? `I couldn't parse ${otherFailures.map((outcome) => outcome.name).join(", ")} reliably, so I didn't save it. Please confirm or edit and try again.`
            : `I couldn't save ${otherFailures.map((outcome) => outcome.name).join(", ")}. Please confirm or edit and try again.`);
        }
      }
      cleanReply = [cleanReply, statusParts.join(" ")].filter(Boolean).join("\n\n");
    }

    let clarification: { groupId: string; items: any[]; question: string } | undefined;
    if (stagedGroupId) {
      if (confirmationRequested) {
        confirmation = {
          groupId: stagedGroupId,
          items: parsedCandidates.map((candidate) => ({
            actionType: candidate.actionType,
            description: candidate.description,
            resolvedDate: candidate.resolvedDate,
            confidence: candidate.confidence,
            provenance: candidate.provenance,
            validation: candidate.validation,
            ordinal: candidate.ordinal,
          })),
        };
        cleanReply = [cleanReply, `I found ${parsedCandidates.length} items. Review them before saving.`].filter(Boolean).join("\n\n");
      } else if (pendingCandidates.length > 0) {
        const questions = [...new Set(pendingCandidates.map((c) => c.question).filter((q): q is string => typeof q === "string" && q.length > 0))];
        clarification = {
          groupId: stagedGroupId,
          items: pendingCandidates.map((candidate) => ({
            actionType: candidate.actionType,
            description: candidate.description,
            reason: candidate.reason,
            resolvedDate: candidate.resolvedDate,
            confidence: candidate.confidence,
          })),
          question: questions.join(" ") || "Please confirm the details so I can save this.",
        };
      }
    }

    const loggedItem = loggedItems.length === 1 ? loggedItems[0] : loggedItems.length > 1 ? { type: "multiple", items: loggedItems } : null;

    // Save AI reply
    await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "ai", content: cleanReply });

    // Update session
    if (sessionId) {
      if (isFirstMessage) {
        try {
          const title = await callAI(
            [
              { role: "system", content: "Generate a short, descriptive title (max 6 words, 40 characters) for a fitness coaching conversation based on the user's first message. Return ONLY the title, no quotes, no punctuation." },
              { role: "user", content: message },
            ],
            40,
            parseModel,
            apiKey,
          );
          const cleanTitle = title.replace(/^["']|["']$/g, "").trim().slice(0, 60);
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { sessionId, title: cleanTitle || message.slice(0, 50) });
        } catch {
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { sessionId, title: message.slice(0, 50) });
        }
      } else {
        await ctx.runMutation(internal.chat.touchSession, { sessionId });
      }
    }

    return { reply: cleanReply, loggedItem, memoryApprovals, failedItems, coachType: detectedCoach, clarification, confirmation, restricted: restrictedGuidance };
  },
});

export const generateDailyInsights = action({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return runDailyInsights(ctx, identity.subject, date);
  },
});

export const generateDailyInsightsForUser = internalAction({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) => runDailyInsights(ctx, userId, date),
});

/** Cron: fan out daily insights to each active user via the scheduler. */
export const cronDailyInsights = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.runQuery(internal.behavior.listActiveUsers, { days: 3 })) as string[];
    for (const userId of users) {
      // Derive the user's local date from their stored timezone offset.
      const settings = (await ctx.runQuery(internal.profile.getSettingsForContext, { userId })) as any;
      const offsetMin: number = settings?.timezoneOffsetMinutes ?? 0;
      const localDate = new Date(Date.now() - offsetMin * 60_000).toISOString().slice(0, 10);
      await ctx.scheduler.runAfter(0, internal.ai.generateDailyInsightsForUser, { userId, date: localDate });
    }
    return { users: users.length };
  },
});

async function runDailyInsights(ctx: any, userId: string, date: string) {
    const [meals, workouts, goal, settings, profile] = await Promise.all([
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ctx.runQuery(internal.goals.getDailyGoalForContext, { userId, date }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    const totalCals = meals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = meals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalCarbs = meals.reduce((s: number, m: any) => s + (m.carbs ?? 0), 0);
    const totalFat = meals.reduce((s: number, m: any) => s + (m.fat ?? 0), 0);
    const totalBurned = workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);

    let userContext = "";
    if (profile?.goal) userContext += `User goal: ${profile.goal}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;
    if (profile?.trainingStyle) userContext += `Training style: ${profile.trainingStyle}. `;

    const mealsList = meals.length > 0 ? `\nMeals today: ${meals.map((m: any) => m.name).join(", ")}` : "";

    const prompt = `${userContext}Today's nutrition & workout data:
- Calories consumed: ${totalCals} (goal: ${goal?.calorieGoal || 2400})
- Calories burned: ${totalBurned}
- Net calories: ${totalCals - totalBurned}
- Protein: ${totalProtein}g (goal: ${goal?.proteinGoal || 180}g)
- Carbs: ${totalCarbs}g | Fat: ${totalFat}g
- Meals logged: ${meals.length}
- Workouts logged: ${workouts.length}${mealsList}

Give 3 short, punchy insights (one sentence each) about their day. Tailor advice to their goal (${profile?.goal || "general fitness"}). Be motivating but direct. Return ONLY a JSON array of 3 strings. Example: ["Protein intake on target. Stay locked in.", "Caloric deficit detected. Fuel up, soldier.", "Zero training logged. The iron doesn't lift itself."]`;

    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    let insights: string[] = [];
    try {
      const match = content.match(/\[[\s\S]*\]/);
      insights = JSON.parse(match ? match[0] : content) as string[];
      if (!Array.isArray(insights)) insights = [];
    } catch {
      insights = [content.slice(0, 100), "Keep pushing forward.", "Data logged successfully."];
    }

    await ctx.runMutation(internal.insights.saveInsights, { userId, date, insights });
    return { insights };
}

export const generateWeeklySummary = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return runWeeklySummary(ctx, identity.subject);
  },
});

export const generateWeeklySummaryForUser = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => runWeeklySummary(ctx, userId),
});

/** Cron: fan out weekly summaries to each active user via the scheduler. */
export const cronWeeklySummary = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.runQuery(internal.behavior.listActiveUsers, { days: 7 })) as string[];
    for (const userId of users) {
      await ctx.scheduler.runAfter(0, internal.ai.generateWeeklySummaryForUser, { userId });
    }
    return { users: users.length };
  },
});

async function runWeeklySummary(ctx: any, userId: string) {
    const _settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const offsetMin: number = _settings?.timezoneOffsetMinutes ?? 0;
    const localNow = new Date(Date.now() - offsetMin * 60_000);
    const day = localNow.getUTCDay();
    const monday = new Date(localNow);
    monday.setUTCDate(localNow.getUTCDate() - day + (day === 0 ? -6 : 1));
    const weekStart = monday.toISOString().slice(0, 10);

    const history = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const date = d.toISOString().split("T")[0];
      const [meals, workouts] = await Promise.all([
        ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
        ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ]);
      history.push({ date, calories: Math.round(meals.reduce((s: number, m: any) => s + m.calories, 0)), burned: Math.round(workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0)), workouts: workouts.length });
    }

    const avgCals = Math.round(history.reduce((s, d) => s + d.calories, 0) / 7);
    const avgBurned = Math.round(history.reduce((s, d) => s + d.burned, 0) / 7);
    const totalWorkouts = history.reduce((s, d) => s + d.workouts, 0);
    const dailyBreakdown = history.map((d) => `${d.date.split("-")[2]}: ${d.calories}cal/${d.burned}burned/${d.workouts}wkt`).join(", ");

    const [settings, profile] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    let userContext = "";
    if (profile?.goal) userContext += `User goal: ${profile.goal}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;
    if (profile?.trainingStyle) userContext += `Training: ${profile.trainingStyle}. `;
    if (profile?.calorieTarget) userContext += `Target: ${profile.calorieTarget}cal/day. `;

    const prompt = `${userContext}Weekly fitness summary:
- Average daily calories: ${avgCals}
- Average daily burned: ${avgBurned}
- Total workouts: ${totalWorkouts}/7 days
- Daily breakdown: ${dailyBreakdown}

Give a brief (2-3 sentences) weekly summary and recommendation tailored to their goal (${profile?.goal || "general fitness"}). Be direct and actionable.`;
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    await ctx.runMutation(internal.insights.saveWeeklySummary, { userId, weekStart, content });
    return { content };
}

export const suggestWorkout = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const [recentWorkouts, settings, profile, metabolicProfile] = await Promise.all([
      ctx.runQuery(internal.workouts.getRecentWorkoutsDetailed, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(api.calibration.getMetabolicProfileForContext, {}),
    ]);

    let userContext = "";
    if (profile?.goal) userContext += `Goal: ${profile.goal}. `;
    if (profile?.trainingStyle) userContext += `Training style: ${profile.trainingStyle}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;

    const recentSummary = (recentWorkouts as any[]).length > 0
      ? (recentWorkouts as any[]).map((w: any) => {
          const exNames = w.exercises?.map((e: any) => e.name).join(", ") || "";
          return `${w.date}: ${w.name}${exNames ? ` (${exNames})` : ""} — ${w.intensity}`;
        }).join("; ")
      : "no recent workouts";

    const prompt = `${userContext}Last 7 days of workouts: ${recentSummary}

Suggest a workout for today based on their recent training history. Consider muscle group rotation — if they trained chest yesterday, suggest back or legs today. If they had a rest day, suggest a balanced session.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "name": "session name (2-3 words)",
  "exercises": [
    {"name": "Exercise Name", "sets": [{"reps": "12", "weight": "80kg"}, {"reps": "10", "weight": "85kg"}, {"reps": "8", "weight": "90kg"}]},
    {"name": "Another Exercise", "sets": [{"reps": "15", "weight": "bodyweight"}, {"reps": "12", "weight": "bodyweight"}]}
  ],
  "duration": "45 min",
  "intensity": "HIGH",
  "rationale": "one sentence why this suits their goal and training history"
}
Include 3-6 exercises with 3-4 sets each. For cardio, use duration as reps field and omit weight. Be specific with exercise names. Do NOT include caloriesBurned — calories are calculated separately.`;
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 800, model, apiKey);
    const result = parseJSON<any>(content, {});

    // Deterministic calorie calculation
    const exercises = (result.exercises || []).map((ex: any) => ({
      name: ex.name || "Exercise",
      sets: Array.isArray(ex.sets) ? ex.sets.map((s: any) => ({ weight: String(s.weight || ""), reps: String(s.reps || "") })) : [],
    }));
    let calorieResult: any = null;
    if (profile?.weight && profile.weight > 0 && exercises.length > 0) {
      try {
        const durationMin = parseDurationMinutes(result.duration || "45 min");
        const engineIntensity = mapAIIntensity(result.intensity || "HIGH");
        const engineDensity = inferDensity(exercises, durationMin);
        const exerciseMetas = matchExercises(exercises);
        const compoundRatio = countCompoundRatio(exerciseMetas);
        const weightedMet = getWeightedMET(exercises);

        const profileWeight = profile.weight;
        const profileAge = profile.age;
        const profileSex = profile.sex;
        const hasCompleteProfile = typeof profileAge === "number" && profileAge > 0 && (profileSex === "male" || profileSex === "female");
        const calcResult = hasCompleteProfile
          ? calculateWorkoutCalories(
              { duration_min: durationMin, intensity: engineIntensity, density: engineDensity, compound_ratio: compoundRatio, exercises, weighted_met: weightedMet },
              {
                weight_kg: profileWeight as number,
                age: profileAge as number,
                sex: profileSex as "male" | "female",
                fitness_level: (metabolicProfile?.fitnessLevel as "beginner" | "intermediate" | "advanced") || "beginner",
                metabolic_factor: metabolicProfile?.metabolicFactor ?? 1.0,
              },
            )
          : calculateNonPersonalizedWorkoutCalories(
              { duration_min: durationMin, intensity: engineIntensity, density: engineDensity, compound_ratio: compoundRatio, weighted_met: weightedMet },
              profileWeight as number,
            );
        calorieResult = {
          total_kcal: calcResult.total_kcal,
          confidence: calcResult.confidence,
          range_low: calcResult.range_low,
          range_high: calcResult.range_high,
          breakdown: calcResult.breakdown,
        };
      } catch { /* ignore */ }
    }

    return {
      ...result,
      exercises,
      caloriesBurned: calorieResult?.total_kcal ?? 0,
      calorieResult,
    };
  },
});

export const parseNutritionImage = action({
  args: {
    imageDataUrl: v.string(),
    userDescription: v.optional(v.string()),
  },
  handler: async (ctx, { imageDataUrl, userDescription }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const visionModel = model && VISION_MODELS.has(model) ? model : DEFAULT_MODEL;

    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");

    const portionClause = userDescription
      ? ` The user says they have: "${userDescription}". If possible, estimate userPortionGrams for this description.`
      : "";

    const prompt = `This is a nutrition label image.${portionClause}

${NUTRITION_ACCURACY_RULES}

Extract nutritional values per 100g. If the label is per serving, convert using the serving size; if serving size is unclear, keep servingSize null and avoid guessing userPortionGrams. Return ONLY a JSON object, no markdown:
{"name":"product name","caloriesPer100g":number,"proteinPer100g":number,"carbsPer100g":number,"fatPer100g":number,"servingSize":number_or_null,"servingUnit":"g","userPortionGrams":number_or_null}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: visionModel,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          }],
          max_tokens: 400,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Vision API error ${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty vision response");
      const result = parseJSON<any>(content, null);
      if (!result) throw new Error("Could not parse nutrition from image");
      return {
        name: result.name || "Scanned Product",
        caloriesPer100g: Number(result.caloriesPer100g) || 0,
        proteinPer100g: Number(result.proteinPer100g) || 0,
        carbsPer100g: Number(result.carbsPer100g) || 0,
        fatPer100g: Number(result.fatPer100g) || 0,
        servingSize: result.servingSize ? Number(result.servingSize) : undefined,
        servingUnit: result.servingUnit || "g",
        userPortionGrams: result.userPortionGrams ? Number(result.userPortionGrams) : undefined,
        source: "scan" as const,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("Vision request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
});

export const estimatePortion = action({
  args: {
    baseName: v.string(),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatPer100g: v.number(),
    servingSize: v.optional(v.number()),
    servingUnit: v.optional(v.string()),
    portionDescription: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const servingClause = args.servingSize
      ? `Serving size: ${args.servingSize}${args.servingUnit || "g"}.`
      : "";

    const prompt = `Product: ${args.baseName}
Nutrition per 100g: ${args.caloriesPer100g} cal, ${args.proteinPer100g}g protein, ${args.carbsPer100g}g carbs, ${args.fatPer100g}g fat.
${servingClause}
User portion description: "${args.portionDescription}"

Estimate the total grams the user consumed based on their description, then calculate exact macros from the per-100g data. Return ONLY a JSON object (no markdown, no explanation):
{"grams":number,"calories":number,"protein":number,"carbs":number,"fat":number}`;

    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    const result = parseJSON<any>(content, {});
    const ratio = (result.grams || 0) / 100;
    return {
      grams: result.grams || 0,
      calories: result.calories || Math.round(args.caloriesPer100g * ratio),
      protein: result.protein || Math.round(args.proteinPer100g * ratio * 10) / 10,
      carbs: result.carbs || Math.round(args.carbsPer100g * ratio * 10) / 10,
      fat: result.fat || Math.round(args.fatPer100g * ratio * 10) / 10,
    };
  },
});

export const calculateProfileMacros = action({
  args: {
    weight: v.number(),
    height: v.number(),
    age: v.number(),
    activityLevel: v.optional(v.string()),
  },
  handler: async (ctx, { weight, height, age, activityLevel }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const prompt = `Calculate optimal daily macronutrient targets for:
- Weight: ${weight}kg
- Height: ${height}cm
- Age: ${age}
- Activity Level: ${activityLevel || "moderate"}

Return ONLY a JSON object with these keys (numbers only, no text):
- calories: daily calorie target
- protein: grams of protein
- carbs: grams of carbs
- fat: grams of fat
- explanation: one sentence explaining the reasoning (max 15 words)`;

    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    const result = parseJSON<any>(content, {});
    if (!result.calories) {
      const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, intense: 1.9 };
      const tdee = Math.round(bmr * (multipliers[activityLevel || "moderate"] || 1.55));
      return { calories: tdee, protein: Math.round(weight * 2), carbs: Math.round((tdee * 0.45) / 4), fat: Math.round((tdee * 0.25) / 9), explanation: "Calculated using Mifflin-St Jeor equation." };
    }
    return { calories: result.calories || 2000, protein: result.protein || Math.round(weight * 2), carbs: result.carbs || 250, fat: result.fat || 65, explanation: result.explanation || "" };
  },
});

export const regenerateSuggestion = action({
  args: {
    mealName: v.string(),
    mealComponents: v.optional(v.string()),
    mealCalories: v.number(),
    mealProtein: v.number(),
    mealCarbs: v.number(),
    mealFat: v.number(),
    remainingCalories: v.optional(v.number()),
    remainingProtein: v.optional(v.number()),
    remainingCarbs: v.optional(v.number()),
    remainingFat: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required to use AI features.");
    }
    const userId = identity.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const budgetContext = args.remainingCalories != null
      ? `\nDaily remaining: ${args.remainingCalories} kcal, ${args.remainingProtein}g protein, ${args.remainingCarbs}g carbs, ${args.remainingFat}g fat.`
      : "";

    const prompt = `You are a professional nutritionist. Give ONE forward-looking sentence about what the user should focus on in their NEXT meal (not criticism of this meal).

Meal: "${args.mealName}"
Components: ${args.mealComponents || "unknown"}
Macros: ${args.mealCalories} kcal, ${args.mealProtein}g protein, ${args.mealCarbs}g carbs, ${args.mealFat}g fat${budgetContext}

Return ONLY a short JSON object: {"suggestion":"one forward-looking next-meal tip (max 25 words)"}`;

    const content = await callAI([{ role: "user", content: prompt }], 400, model, apiKey);
    const result = parseJSON<any>(content, { suggestion: "" });
    return { suggestion: result.suggestion || "" };
  },
});

export const getCoaches = query({
  args: {},
  handler: async () => {
    const list = Object.values(COACHES).map(({ id, name, tagline }) => ({ id, name, tagline }));
    return [{ id: "auto", name: "Auto", tagline: "Automatically route to the right coach" }, ...list];
  },
});

export const transcribe = action({
  args: { audio: v.string(), mimeType: v.optional(v.string()) },
  handler: async (_ctx, { audio, mimeType }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in Convex environment");

    const mime = mimeType || "audio/webm";
    const ext = mime === "audio/mp4" ? "mp4" : mime === "audio/wav" ? "wav" : "webm";

    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    formData.append("model", "whisper-large-v3-turbo");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") throw new Error("Groq transcription timed out after 30s");
      throw err;
    }
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Groq transcription error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { text?: string; error?: { message?: string } };
    if (data.error) throw new Error(`Groq error: ${data.error.message}`);
    if (!data.text) throw new Error("Groq returned empty transcription");
    return { transcript: data.text.trim() };
  },
});


/**
 * Homepage quick-input action.
 *
 * Uses the LLM to extract ALL loggable items from a single message.
 * Returns an array of drafts (meal, workout, sleep, water, mood, steps)
 * plus a tier-1 summary and tier-2 detail for the UI.
 *
 * Example: "Had chicken salad and drank 1L of water" → [meal draft, water draft]
 * Example: "Slept 6.5h last night, woke up at 7" → [sleep draft]
 */
/**
 * Heuristic: detect whether a free-text message looks like a log report
 * vs. a question. Used as a pre-check AND as a sanity check on the LLM's
 * intent classification — fixes the "coin flip" where the LLM occasionally
 * mis-classifies a meal log as a question and skips the confirm modal.
 */
// Intent helpers (looksLikeLog, looksLikeFoodEstimate, extractUserMacros,
// applyUserMacros) and their regexes → ./ai/intent

export const homepageInput = action({
  args: {
    message: v.string(),
    image: v.optional(v.string()),
    today: v.optional(v.string()),
    sessionId: v.optional(v.id("chat_sessions")),
  },
  handler: async (ctx, { message, image, today: todayArg, sessionId }): Promise<{
    drafts: any[];
    tier1Summary: string;
    tier2Detail: string;
    isQuestion: boolean;
    actions?: any[];
    reply?: string;
    coachType?: CoachType;
    sessionId?: any;
    restricted?: boolean;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = todayArg ?? new Date().toISOString().split("T")[0];
    const restrictedGuidance = hasRestrictedRecoverySignal(message);

    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const settingsModel = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const visionModel = settingsModel && VISION_MODELS.has(settingsModel) ? settingsModel : DEFAULT_MODEL;
    const intentModel = image ? visionModel : settingsModel;

    // Make sure we have a homepage session to persist into
    const activeSessionId = sessionId
      ?? (await ctx.runMutation(internal.chat.getOrCreateHomepageSession, { userId, date: today }));

    // Save user message immediately
    await ctx.runMutation(internal.chat.addMessage, {
      userId,
      sessionId: activeSessionId,
      role: "user",
      content: message,
    });

    // Phase 5: MemoryAgent — fire-and-forget fact extraction (does not block response)
    ctx.runAction(internal.agents.runMemoryAgentAction, {
      userId, message, today,
      model: settings?.openRouterModel ?? undefined,
      apiKey: settings?.openRouterKey ?? undefined,
    }).catch(() => {});

    // Heuristic pre-check
    const estimateMode = looksLikeFoodEstimate(message);
    const userMacros = extractUserMacros(message);
    const hasUserMacros = Object.values(userMacros).some((v) => v != null);
    const homepageIntent = classifyHomepageIntent(message);
    const heuristicSaysLog = !!image || homepageIntent === "log_report" || looksLikeLog(message) || estimateMode;

    // Step 1: Extract ALL loggable items from the message in one LLM call.
    const yesterdayStr = new Date(new Date(today).getTime() - 86400000).toISOString().split("T")[0];
    const twoDaysAgoStr = new Date(new Date(today).getTime() - 2 * 86400000).toISOString().split("T")[0];
    const extractSystem = `You are a wellness tracking assistant. Extract ALL loggable items from the user's message.

Today's date is ${today}.

Return a JSON object:
{
  "isQuestion": boolean,
  "items": [
    {
      "type": "meal" | "workout" | "sleep" | "water" | "mood" | "steps",
      "description": "what the user said about this item (verbatim chunk)",
      "date": "YYYY-MM-DD"
    }
  ]
}

CRITICAL CLASSIFICATION RULES:
- "isQuestion" is TRUE only when the user is asking a question, requesting advice, or chatting WITHOUT mentioning anything they did/ate/drank/slept.
- ANY mention of food/drink consumed, exercise performed, sleep, mood, or steps is a LOG report — set isQuestion=false and add an item.
- NEGATIONS are NOT logs: "I haven't worked out today", "didn't eat lunch", "no steps yet", "skipped breakfast" → isQuestion=false, items=[].
- If the user reports activities AND asks a question, set isQuestion=false and still add the items (we'll handle the question separately).
- "I had X" / "I ate X" / "just had X" / "had X for breakfast" / "X for lunch/dinner/snack" → meal log, isQuestion=false
- "I drank X" / "X glasses of water" / "Xml of water" / "had Xl of water" → water log, isQuestion=false
- "Did/ran/walked/biked/lifted X" / "30 min run" / "5km run" / "leg day" → workout log, isQuestion=false
- A list of exercises (e.g. "declined press: ..., incline press: ..., pec fly: ...") = ONE workout item, not multiple. Combine all into a single workout description.
- "Slept X" / "went to bed at X" / "woke up at Y" → sleep log, isQuestion=false
- "Feeling X/Y" / "mood is X" / "X out of 5" → mood log, isQuestion=false
- "X steps" / "walked X steps" → steps log, isQuestion=false
- Pure questions ("how am I doing?", "what should I eat?", "explain X") → isQuestion=true, items=[]
- Food estimate questions ("how many calories is X?", "can I have X?", "would X fit?") → isQuestion=false and add a meal item, but the app may ask before logging.

Date inference rules:
- "yesterday" → ${yesterdayStr}
- "2 days ago" → ${twoDaysAgoStr}
- "last night" for SLEEP → ${today} (the wake-up day)
- "last night" for MEAL/WORKOUT → ${yesterdayStr}
- "this morning", "today", no day mentioned → ${today}
- For SLEEP entries: the date is the wake-up day, so "slept 6h last night" → ${today}

Examples (assume today=${today}):
- USER: "I had chicken salad for lunch"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "chicken salad for lunch", "date": "${today}"}]}
- USER: "had pizza"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "pizza", "date": "${today}"}]}
- USER: "Yesterday I had pizza for dinner"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "pizza for dinner", "date": "${yesterdayStr}"}]}
- USER: "Did a 30 min run and drank a litre of water"
  → {"isQuestion": false, "items": [{"type": "workout", "description": "30 min run", "date": "${today}"},{"type": "water", "description": "1 litre of water", "date": "${today}"}]}
- USER: "Slept 7h last night"
  → {"isQuestion": false, "items": [{"type": "sleep", "description": "slept 7h", "date": "${today}"}]}
- USER: "How am I doing today?"
  → {"isQuestion": true, "items": []}
- USER: "I haven't worked out today"
  → {"isQuestion": false, "items": []}
- USER: "Can I have 200ml milk, 3 biscuits, and whey? How many calories?"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "200ml milk, 3 biscuits, and whey", "date": "${today}"}]}

Sleep descriptions like "slept X hours", "went to bed at X", "woke up at Y" are type="sleep", NOT "workout".
Return ONLY valid JSON, no markdown.`;

    const extractMessages: AIMessage[] = [
      { role: "system", content: extractSystem },
      image
        ? { role: "user", content: [{ type: "text", text: message || "What do you see?" }, { type: "image_url", image_url: { url: image } }] }
        : { role: "user", content: message },
    ];

    const extractRaw = await callAI(extractMessages, 400, intentModel, apiKey);
    let extracted = parseJSON<{ isQuestion: boolean; items: { type: string; description: string; date?: string }[] }>(
      extractRaw,
      { isQuestion: true, items: [] },
    );

    // Sanity check: if our heuristic strongly suggests this is a log but the LLM
    // returned isQuestion=true with no items, force a second extraction pass.
    if (heuristicSaysLog && (extracted.isQuestion || (extracted.items?.length ?? 0) === 0)) {
      const forcePrompt = `The user message below IS a log report (food, drink, workout, sleep, mood, or steps).
Today's date is ${today}.
Extract every item as JSON. NEVER return isQuestion=true here.

USER MESSAGE:
"""
${message}
"""

Return ONLY:
{"isQuestion": false, "items": [{"type":"meal|workout|sleep|water|mood|steps","description":"...","date":"YYYY-MM-DD"}]}`;
      const forcedRaw = await callAI([{ role: "user", content: forcePrompt }], 300, intentModel, apiKey).catch(() => "");
      if (forcedRaw) {
        const forced = parseJSON<{ isQuestion: boolean; items: { type: string; description: string; date?: string }[] }>(
          forcedRaw,
          { isQuestion: true, items: [] },
        );
        if (forced.items && forced.items.length > 0) {
          extracted = { isQuestion: false, items: forced.items };
        }
      }
    }

    // Validate date strings — fall back to today if invalid
    const isValidDate = (d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const allowedTypes = new Set(["meal", "workout", "sleep", "water", "mood", "steps"]);
    extracted.items = (extracted.items ?? [])
      .filter((it) => allowedTypes.has(it.type))
      .filter((it) => !isNegatedLogItem(message, it));
    for (const item of extracted.items) {
      if (!isValidDate(item.date)) item.date = today;
    }

    // If it's a question, route to chat coach (with chat history)
    const shouldFallbackToEstimate = estimateMode
      && homepageIntent !== "negation"
      && !isNegatedLogItem(message, { type: "meal", description: message });
    if (shouldFallbackToEstimate && (extracted.isQuestion || extracted.items.length === 0)) {
      extracted = { isQuestion: false, items: [{ type: "meal", description: message, date: today }] };
    }

    if (extracted.isQuestion || extracted.items.length === 0) {
      const coachType: CoachType = classifyCoachType(message);
      const coach = getCoach(coachType);
      const [todayMealsList, todayWorkoutsList, profile, history, topMemories, lastSleepQ, patternsQ, topRecipesQ, topWkMemQ, behaviorQ, settingsQ, userIngredientsQ, checkInAnswersQ] = await Promise.all([
        ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
        ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
        ctx.runQuery(internal.profile.getProfileForContext, { userId }),
        ctx.runQuery(internal.chat.getMessagesForContext, { userId, sessionId: activeSessionId }),
        ctx.runQuery(internal.food_memory.getTopForContext, { userId, limit: 6 }),
        ctx.runQuery(internal.wellness.getLastSleepForContext, { userId }),
        ctx.runQuery(internal.patterns.getPatternsForContext, { userId }),
        ctx.runQuery(internal.recipes.getTopRecipesForContext, { userId, limit: 5 }),
        ctx.runQuery(internal.workout_memory.getTopForContext, { userId, limit: 4 }),
        ctx.runQuery(internal.behavior.getBehaviorProfileForContext, { userId }),
        ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
        ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
        ctx.runQuery(internal.checkins.getAnswerContextForContext, { userId, date: today }),
      ]);
      const userName = identity.name ?? "Athlete";
      let context = `USER: ${userName}\n`;
      if (profile?.calorieTarget) context += `Calorie target: ${profile.calorieTarget}\n`;
      if (profile?.proteinTarget) context += `Protein target: ${profile.proteinTarget}g\n`;
      if (profile?.dietaryPreference && profile.dietaryPreference !== "none") {
        context += `Diet: ${profile.dietaryPreference}\n`;
      }
      context += `Today: ${todayMealsList.length} meals, ${todayWorkoutsList.length} workouts logged.\n`;
      if (Array.isArray(topMemories) && topMemories.length > 0) {
        context += `Known foods: ${(topMemories as any[]).map((m: any) => `${m.name} (~${m.kcal} kcal)`).join(", ")}\n`;
      }
      if (Array.isArray(topRecipesQ) && topRecipesQ.length > 0) {
        context += `Saved recipes: ${(topRecipesQ as any[]).map((r: any) => `${r.name} (${r.kcalPerServing} kcal/srv)`).join(", ")}\n`;
      }
      if (Array.isArray(topWkMemQ) && topWkMemQ.length > 0) {
        context += `Known workouts: ${(topWkMemQ as any[]).map((w: any) => `${w.name}`).join(", ")}\n`;
      }
      if (Array.isArray(userIngredientsQ) && userIngredientsQ.length > 0) {
        context += `Personal ingredients: ${(userIngredientsQ as any[]).map((i: any) => {
          const k = i.caloriesPer100g != null ? `${i.caloriesPer100g} kcal/100g` : "custom";
          return `${i.name} (${k})`;
        }).join(", ")}\n`;
      }
      if (lastSleepQ) {
        const sleepValue = (lastSleepQ as any).hours != null ? `${(lastSleepQ as any).hours}h` : (lastSleepQ as any).band ?? "unknown duration";
        context += `Last sleep: ${sleepValue}, ${(lastSleepQ as any).quality ?? "unknown"}\n`;
      }
      if (checkInAnswersQ) {
        context += `Today's check-in answers: ${checkInAnswersQ}\n`;
      }
      if (Array.isArray(patternsQ) && patternsQ.length > 0) {
        context += `Patterns: ${(patternsQ as string[]).join(" | ")}\n`;
      }

      const toneOpts = {
        sleepHours: lastSleepQ && (lastSleepQ as any).hours != null ? (lastSleepQ as any).hours : undefined,
        sleepQuality: lastSleepQ ? (lastSleepQ as any).quality : undefined,
        acceptRate: (behaviorQ as any)?.acceptRate ?? undefined,
      };
      const tone = toneInstruction(settingsQ?.coachingStyle, toneOpts);

      // Drop the trailing user message (we already saved it) when injecting history
      const trimmedHistory = (history as { role: string; content: string }[])
        .slice(0, -1)
        .slice(-12) // keep only last ~12 turns to stay within context
        .map((m) => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content }));

      const systemContent = `${coach.systemPrompt}${tone ? `\n\n${tone}` : ""}\n\n${context}\n\nKeep your reply concise — under 60 words unless the user asks for detail.${restrictedGuidance ? `\n\n${RESTRICTED_GUIDANCE}` : ""}`;
      const replyMessages: AIMessage[] = [
        { role: "system", content: systemContent },
        ...trimmedHistory,
        image
          ? { role: "user", content: [{ type: "text", text: message }, { type: "image_url", image_url: { url: image } }] }
          : { role: "user", content: message },
      ];
      // Upgraded chat reply (CHAT_MODEL) for text; image stays on the vision model.
      // Parsing/extraction elsewhere in this action stays on the cheap settingsModel/DEFAULT.
      const reply = await callAI(replyMessages, 250, image ? visionModel : (settingsModel ?? CHAT_MODEL), apiKey);

      // Persist AI reply
      await ctx.runMutation(internal.chat.addMessage, {
        userId,
        sessionId: activeSessionId,
        role: "ai",
        content: reply,
      });

      return { drafts: [], tier1Summary: "", tier2Detail: "", isQuestion: true, reply, coachType, sessionId: activeSessionId, restricted: restrictedGuidance };
    }

    // Step 2: Parse each item in parallel
    const [profile, metabolicProfile, userIngredients] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(api.calibration.getMetabolicProfileForContext, {}),
      ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
    ]);
    const userPhysique: UserPhysique | undefined = profile ? {
      weight: profile.weight, height: profile.height, age: profile.age, sex: profile.sex,
      fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
      metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
    } : undefined;

    const drafts: any[] = [];
    const summaryParts: string[] = [];

    for (const item of extracted.items) {
      try {
        if (item.type === "meal") {
          let desc = item.description;
          if (image && !desc.trim()) {
            const d = await callAI([{ role: "user", content: [{ type: "text", text: "Describe this food briefly." }, { type: "image_url", image_url: { url: image } }] }], 150, visionModel, apiKey);
            desc = d;
          }

          // Food memory is resolved through the same canonical draft path as every other meal source.
          const memoryDraft = await buildMealDraftFromParsed(ctx, {
            name: desc,
            description: desc,
            date: item.date,
            time: new Date().toTimeString().slice(0, 5),
            mealType: "unspecified",
          }, { userId, useMemory: true });
          if (memoryDraft.foodMemoryId) {
            const draft = {
              kind: "meal",
              date: memoryDraft.date,
              description: memoryDraft.name,
              name: memoryDraft.name,
              kcal: memoryDraft.calories,
              protein: Math.round(memoryDraft.protein),
              carbs: Math.round(memoryDraft.carbs),
              fat: Math.round(memoryDraft.fat),
              items: memoryDraft.ingredients.map((ingredient) => ingredient.foodText),
              components: memoryDraft.ingredients.map((ingredient) => ingredient.foodText).join(", "),
              mealType: memoryDraft.mealType,
              time: memoryDraft.time,
              confidence: memoryDraft.confidence,
              nutritionSource: memoryDraft.nutritionSource,
              autoApplied: false,
              memoryNote: `Using your usual ${memoryDraft.name}`,
              foodMemoryId: memoryDraft.foodMemoryId,
              ingredientBreakdown: memoryDraft,
            };
            drafts.push(draft);
            summaryParts.push(`${memoryDraft.name} (~${draft.kcal} kcal, from memory)`);
            continue;
          }
          // ── End memory match — fall through to LLM parse ──────────────────

          const parsed = await parseMealDescription(desc, "unspecified", "", settingsModel, apiKey, userIngredients as any[]);
          const nutrition = nutritionFromDraft(await buildMealDraftFromParsed(ctx, { ...parsed, date: item.date, description: desc }, { userId, useMemory: true }));
          const canonicalDraft = nutrition.ingredientBreakdown as MealDraft;
          const baseDraft = {
            kind: "meal",
            date: item.date,
            description: parsed.name || desc,
            name: parsed.name,
            kcal: nutrition.calories,
            protein: Math.round(nutrition.protein),
            carbs: Math.round(nutrition.carbs),
            fat: Math.round(nutrition.fat),
            items: canonicalDraft.ingredients.map((ingredient) => ingredient.foodText),
            components: parsed.components,
            mealType: parsed.mealType ?? "unspecified",
            time: parsed.time,
            aiSuggestion: parsed.aiSuggestion,
            confidence: nutrition.confidence,
            nutritionSource: nutrition.nutritionSource,
            ingredientBreakdown: canonicalDraft,
            reportedCalories: nutrition.reportedCalories,
            estimatedCalories: nutrition.estimatedCalories,
            calorieSource: nutrition.calorieSource,
            parseError: parsed.parseError,
          };
          const macroDecision = hasUserMacros ? applyUserMacros(baseDraft, userMacros) : { draft: baseDraft, conflict: false, reason: "" };
          drafts.push(macroDecision.draft);
          summaryParts.push(`${parsed.name || "Meal"} (~${macroDecision.draft.kcal} kcal)`);

        } else if (item.type === "workout") {
          const parsed = await parseWorkoutDescription(item.description, undefined, undefined, settingsModel, apiKey, userPhysique);
          if (parsed.parseError) {
            summaryParts.push("Workout needs details before it can be logged");
            continue;
          }
          // Extract user-stated calories from description (e.g. "75 kcal burned", "75cal")
          const statedKcal = extractStatedWorkoutCalories(item.description);
          const finalKcal = statedKcal ?? parsed.caloriesBurned ?? 0;
          drafts.push({
            kind: "workout",
            date: item.date,
            description: parsed.name,
            name: parsed.name,
            type: parsed.name,
            duration: parseDurationMinutes(parsed.duration ?? "30 min") || 30,
            kcal: finalKcal,
            intensity: (parsed.intensity?.toLowerCase() === "high" ? "high" : parsed.intensity?.toLowerCase() === "low" ? "light" : "medium"),
            sets: parsed.sets,
            rationale: parsed.rationale,
            exercises: parsed.exercises,
            calorieResult: parsed.calorieResult,
            parseError: parsed.parseError,
          });
          const range = statedKcal != null
            ? `~${statedKcal} kcal burned`
            : parsed.calorieResult
            ? `~${parsed.calorieResult.range_low}-${parsed.calorieResult.range_high} kcal, rough`
            : `~${finalKcal} kcal burned`;
          summaryParts.push(`${parsed.name} (${range})`);

        } else if (item.type === "sleep") {
          // Parse sleep: extract hours and quality from description
          const sleepParsePrompt = `Extract sleep data from: "${item.description}"
Return JSON: {"hours": number, "quality": "poor"|"ok"|"good"|"great"}
Examples: "slept 6.5 hours" → {"hours":6.5,"quality":"ok"}, "slept 8h, felt great" → {"hours":8,"quality":"great"}
If hours can't be determined from a time range, calculate: e.g. "12:30am to 7am" = 6.5 hours.
Return ONLY JSON.`;
          const sleepRaw = await callAI([{ role: "user", content: sleepParsePrompt }], 80, settingsModel, apiKey);
          const sleepData = parseJSON<{ hours?: number; band?: string; quality?: string }>(sleepRaw, {});
          const hours = typeof sleepData.hours === "number" && Number.isFinite(sleepData.hours) ? sleepData.hours : undefined;
          const band = ["under_6", "six_to_eight", "eight_plus"].includes(sleepData.band ?? "") ? sleepData.band : undefined;
          const quality = ["poor", "ok", "good", "great"].includes(sleepData.quality ?? "") ? sleepData.quality : undefined;
          const sleepDraft = buildRecoveryDraft({ kind: "sleep", date: item.date ?? today, hours, band, quality, source: "ai_extracted" });
          drafts.push({ ...recoveryPayloadFromDraft(sleepDraft), description: item.description });
          summaryParts.push(hours != null ? `Sleep: ${hours.toFixed(1)}h${quality ? ` (${quality})` : ""}` : band ? `Sleep: ${band}` : "Sleep: value needed");

        } else if (item.type === "water") {
          // Parse water: extract ml from description
          const waterParsePrompt = `Extract water amount in ml from: "${item.description}"
Common conversions: 1 glass = 250ml, 1L = 1000ml, 1 bottle = 500ml.
Return ONLY a number (ml). Examples: "1L" → 1000, "2 glasses" → 500, "500ml" → 500`;
          const mlRaw = await callAI([{ role: "user", content: waterParsePrompt }], 20, settingsModel, apiKey);
          const parsedMl = parseInt(mlRaw.replace(/[^0-9]/g, ""), 10);
          const ml = Number.isFinite(parsedMl) ? parsedMl : undefined;
          const waterDraft = buildRecoveryDraft({ kind: "water", date: item.date ?? today, ml, source: "ai_extracted" });
          drafts.push({ ...recoveryPayloadFromDraft(waterDraft), description: item.description });
          summaryParts.push(ml != null ? `Water: ${ml >= 1000 ? (ml / 1000).toFixed(1) + "L" : ml + "ml"}` : "Water: value needed");

        } else if (item.type === "mood") {
          const moodParsePrompt = `Extract mood rating 1-5 from: "${item.description}"
1=very bad, 2=bad, 3=ok, 4=good, 5=great. Return ONLY a number 1-5.`;
          const ratingRaw = await callAI([{ role: "user", content: moodParsePrompt }], 10, settingsModel, apiKey);
          const parsedRating = parseInt(ratingRaw.replace(/[^0-9]/g, ""), 10);
          const rating = Number.isFinite(parsedRating) ? parsedRating : undefined;
          const moodDraft = buildRecoveryDraft({ kind: "mood", date: item.date ?? today, rating, source: "ai_extracted" });
          drafts.push({ ...recoveryPayloadFromDraft(moodDraft), description: item.description });
          summaryParts.push(rating != null ? `Mood: ${rating}/5` : "Mood: value needed");

        } else if (item.type === "steps") {
          const stepsParsePrompt = `Extract step count from: "${item.description}". Return ONLY a number.`;
          const stepsRaw = await callAI([{ role: "user", content: stepsParsePrompt }], 15, settingsModel, apiKey);
          const parsedCount = parseInt(stepsRaw.replace(/[^0-9]/g, ""), 10);
          const count = Number.isFinite(parsedCount) ? parsedCount : undefined;
          const stepsDraft = buildRecoveryDraft({ kind: "steps", date: item.date ?? today, count, source: "ai_extracted" });
          drafts.push({ ...recoveryPayloadFromDraft(stepsDraft), description: item.description });
          summaryParts.push(count != null ? `Steps: ${count.toLocaleString()}` : "Steps: value needed");
        }
      } catch { /* skip failed items */ }
    }

    if (drafts.length === 0) {
      // Fallback to question path
      const reply = "I couldn't parse that. Could you be more specific?";
      await ctx.runMutation(internal.chat.addMessage, {
        userId, sessionId: activeSessionId, role: "ai", content: reply,
      });
      return { drafts: [], tier1Summary: "", tier2Detail: "", isQuestion: true, reply, coachType: "overall", sessionId: activeSessionId, restricted: restrictedGuidance };
    }

    // If any draft has a date != today, mention it in the summary
    const nonTodayDates = [...new Set(drafts.map((d) => d.date).filter((d) => d && d !== today))];
    const dateNote = nonTodayDates.length > 0 ? ` (for ${nonTodayDates.join(", ")})` : "";
    const tier1Summary = summaryParts.join(" · ") + dateNote + ". Confirm to log.";

    // Tier 2: brief analysis of the combined log
    const tier2Prompt = `Give a brief, encouraging analysis (2-3 sentences) of what the user just logged: ${summaryParts.join(", ")}. Be specific and actionable.`;
    const tier2Detail = await callAI([{ role: "user", content: tier2Prompt }], 150, settingsModel, apiKey).catch(() => "");

    // Persist the assistant's response (tier1 + tier2) so the chat thread stays meaningful
    const persistedReply = tier2Detail ? `${tier1Summary}\n\n${tier2Detail}` : tier1Summary;
    await ctx.runMutation(internal.chat.addMessage, {
      userId, sessionId: activeSessionId, role: "ai", content: persistedReply,
    });

    const actions: any[] = [];

    // Always show a log_draft card for every draft — deterministic confirm flow
    for (const draft of drafts) {
      if (draft.kind === "meal") {
        const rangeLow = Math.max(0, Math.round(draft.kcal * 0.88));
        const rangeHigh = Math.round(draft.kcal * 1.12);
        const isMacroConflict = draft.nutritionSource === "macro_conflict";
        if (isMacroConflict) {
          actions.push({
            type: "macro_conflict",
            title: "Macro check",
            body: `${draft.engineEstimate ? `My estimate is ~${draft.engineEstimate.kcal} kcal. ` : ""}Your numbers differ significantly — which should I use?`,
            draft,
            buttons: [
              { label: "Use my numbers", value: "use_user_macros" },
              { label: "Use estimate", value: "use_engine_estimate" },
            ],
          });
        } else {
          actions.push({
            type: "log_draft",
            source: hasUserMacros ? "user_macros" : draft.nutritionSource ?? "estimate",
            draft,
            title: draft.description ?? "Log this meal?",
            body: estimateMode
              ? `${rangeLow}–${rangeHigh} kcal depending on portions.`
              : draft.parseError,
          });
        }
      } else {
        // workout, sleep, water, mood, steps — always confirm
        actions.push({
          type: "log_draft",
          source: draft.kind,
          draft,
          title: draft.description ?? `Log ${draft.kind}?`,
          body: draft.kind === "workout" && draft.calorieResult
            ? `~${draft.calorieResult.range_low}-${draft.calorieResult.range_high} kcal, rough. Refine duration or intensity if needed.`
            : draft.parseError,
        });
      }
    }

    return { drafts, tier1Summary, tier2Detail, isQuestion: false, actions, sessionId: activeSessionId, restricted: restrictedGuidance };
  },
});

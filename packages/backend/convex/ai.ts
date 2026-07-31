import { action, mutation, query, internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
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
import { assertValidDate, assertValidTime, stableHash } from "./validation";
import { finalizeActionGroup as finalizeActionGroupInMutation } from "./actions_group";
import type { ChatTurnCard, ChatTurnOutcome, ConfirmationMacroData, ResultCardItem } from "../../shared/src/chat-turn";

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
  DEFAULT_MODEL, CHAT_MODEL, VISION_MODELS,
} from "./ai/llm";
import {
  AI_INPUT_LIMITS,
  assertAudioBase64,
  assertHistoryEntries,
  assertImageDataUrl,
  assertIngredients,
  assertMaxChars,
  estimateTranscriptionCostUsd,
} from "./ai_guard";
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

function finiteNonNegativeNumber(field: string, value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return numeric;
}

function optionalFiniteNonNegativeNumber(field: string, value: unknown): number | undefined {
  return value == null ? undefined : finiteNonNegativeNumber(field, value);
}

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
  | { kind: "workout"; code: string; description: string; retryArgs: WorkoutRetryArgs }
  | {
      kind: "meal" | "workout" | "sleep" | "water" | "mood" | "steps";
      code: "PARSE_FAILED";
      description: string;
      reason: string;
    };

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
  handler: async (ctx, args): Promise<{ groupId: Id<"actionGroups"> }> => {
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

export const recordFailedTurnGroup = internalMutation({
  args: {
    userId: v.string(),
    groupIdempotencyKey: v.string(),
    rawInput: v.string(),
    model: v.optional(v.string()),
    clientLocalDate: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ groupId: Id<"actionGroups"> }> => {
    const result = await ensureGroup(ctx, {
      userId: args.userId,
      groupIdempotencyKey: args.groupIdempotencyKey,
      sourceSurface: "chat",
      rawInput: args.rawInput,
      model: args.model,
      clientLocalDate: args.clientLocalDate,
      createdAt: args.createdAt,
      status: "failed",
      submissionFingerprint: deriveSubmissionFingerprint({
        userId: args.userId,
        sourceSurface: "chat",
        rawInput: args.rawInput,
        clientLocalDate: args.clientLocalDate,
      }),
    });
    if (result.group.status === "pending" && result.members.length === 0) {
      assertGroupTransition("pending", "failed");
      await ctx.db.patch(result.group._id, { status: "failed", resolvedAt: Date.now() });
    }
    return { groupId: result.group._id };
  },
});

type ResolveClarificationResult = { groupId: string; loggedItems: any[]; memoryApprovals?: any[]; errors?: string[] };

async function executeClarificationResolution(ctx: any, userId: string, groupId: string, date: string): Promise<ResolveClarificationResult> {
  const group = await ctx.runQuery(internal.ai.getActionGroupForClarification, { groupId: groupId as any });
  if (!group) throw new Error("Clarification group not found");
  if (group.userId !== userId) throw new Error("Not authorized");
  if (["pending", "partial", "failed"].includes(group.status) && Date.now() - group.createdAt > CONFIRMATION_TTL_MS) {
    await ctx.runMutation(internal.ai.expireActionGroup, { groupId: groupId as any });
    throw new Error("This confirmation has expired");
  }
  if (group.status === "expired") throw new Error("This confirmation has expired");
  if (!["pending", "partial", "failed"].includes(group.status)) throw new Error("Group is not pending clarification");
  const settings = (await ctx.runQuery(internal.profile.getSettingsForContext, { userId })) as any;
  const dateCheck = resolveChatActionDate({ explicitDate: date, actionKind: "actual" }, settings?.timezoneOffsetMinutes ?? 0);
  if (dateCheck.status !== "resolved") {
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

type LogAnywayForActionResult = {
  actionId: Id<"actions">;
  actionGroupId: Id<"actionGroups">;
  status: "committed";
  record: { table: string; id: string };
  turn: {
    content: string;
    turnContractVersion: 1;
    turnOutcome: "committed";
    turnCards: ChatTurnCard[];
    actionGroupId: Id<"actionGroups">;
    actionIds: Id<"actions">[];
  };
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
  const macroEdits = isRecord(edits.macros) ? edits.macros : undefined;
  if (macroEdits) {
    for (const field of ["calories", "protein", "carbs", "fat"]) {
      if (macroEdits[field] !== undefined) {
        if (typeof macroEdits[field] !== "number" || !Number.isFinite(macroEdits[field]) || macroEdits[field] < 0) {
          throw new Error(`Invalid meal macro: ${field}`);
        }
        payload[field] = macroEdits[field];
      }
    }
  }
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

function confirmationMacros(payload: any): ConfirmationMacroData | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const values = [payload.calories, payload.protein, payload.carbs, payload.fat];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  return {
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fat: payload.fat,
  };
}

function confirmationOrdinal(member: any): number {
  if (typeof member.payload?._confirmationOrdinal === "number") return member.payload._confirmationOrdinal;
  return typeof member.originalPayload?._confirmationOrdinal === "number"
    ? member.originalPayload._confirmationOrdinal
    : -1;
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

function resultCardItemsForActions(actions: Doc<"actions">[]): ResultCardItem[] {
  const items: ResultCardItem[] = [];
  for (const action of actions) {
    const base = {
      ordinal: confirmationOrdinal(action),
      actionType: action.actionType as "meal" | "workout" | "recovery",
      title: confirmationDescription(action),
      description: confirmationDescription(action),
      date: action.resolvedDate,
      time: action.resolvedTime,
    };
    if (action.status === "committed" && action.committedRowRef) {
      items.push({
        ...base,
        status: "committed",
        actionId: String(action._id),
        record: action.committedRowRef,
      });
    } else if (action.status === "failed") {
      items.push({
        ...base,
        status: "failed",
        actionId: String(action._id),
        reason: action.validation.messages.at(-1) ?? "The item could not be saved",
        retriable: true,
      });
    }
  }
  return items;
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
    const currentMembers: Doc<"actions">[] = await ctx.runQuery(aiInternal.getPendingMembersForClarification, { groupId });
    const resultCardItems = resultCardItemsForActions(currentMembers);
    const committedCardItems = resultCardItems.filter(
      (item): item is Extract<ResultCardItem, { status: "committed" }> => item.status === "committed",
    );
    const failedCardItems = resultCardItems.filter(
      (item): item is Extract<ResultCardItem, { status: "failed" }> => item.status === "failed",
    );
    const pendingMembers = currentMembers.filter((member) => member.status === "pending");
    const cards: ChatTurnCard[] = [];
    if (pendingMembers.length > 0) {
      cards.push({
        version: 1,
        kind: "confirmation",
        data: {
          groupId: String(groupId),
          expiresAt: group.createdAt + CONFIRMATION_TTL_MS,
          items: pendingMembers.map((member) => ({
            ordinal: confirmationOrdinal(member),
            actionType: member.actionType as "meal" | "workout" | "recovery",
            title: confirmationDescription(member),
            description: confirmationDescription(member),
            date: member.resolvedDate,
            time: member.resolvedTime,
            ...(member.actionType === "meal" && confirmationMacros(member.payload)
              ? { macros: confirmationMacros(member.payload) }
              : {}),
            actionId: String(member._id),
            confidence: member.confidence,
            validationMessages: member.validation.messages,
          })),
        },
      });
    }
    if (committedCardItems.length > 0) {
      cards.push({
        version: 1,
        kind: "result",
        data: { groupId: String(groupId), items: resultCardItems },
      });
      cards.push({
        version: 1,
        kind: "undo",
        data: {
          groupId: String(groupId),
          items: committedCardItems.map(({ status: _status, ...item }) => ({ ...item, state: "available" as const })),
        },
      });
    } else if (resultCardItems.length > 0) {
      cards.push({
        version: 1,
        kind: "failure",
        data: {
          groupId: String(groupId),
          code: "CONFIRMATION_FAILED",
          message: "No items were saved.",
          retriable: true,
          items: failedCardItems.map(({ status: _status, retriable: _retriable, ...item }) => item),
        },
      });
    }
    const turnOutcome: ChatTurnOutcome = pendingMembers.length > 0
      ? "confirmation_required"
      : committedCardItems.length > 0
        ? "committed"
        : "failed";
    const content = turnOutcome === "confirmation_required"
      ? `${pendingMembers.length} item${pendingMembers.length === 1 ? "" : "s"} still need review.`
      : turnOutcome === "committed"
        ? `Saved ${committedCardItems.map((item) => item.title).join(", ")}.${resultCardItems.some((item) => item.status === "failed") ? " Some items could not be saved." : ""}`
        : "I couldn't save that. Please try again.";
    await ctx.runMutation(internal.chat.updateAssistantOutcomeForGroup, {
      userId,
      actionGroupId: groupId,
      content,
      turnOutcome,
      turnCards: cards,
      actionIds: currentMembers.map((member) => member._id),
    });
    return { groupId, status, results, loggedItems, unresolvedItems, memoryApprovals };
  },
});

/** Commit one action that a persisted duplicate card previously blocked. */
export const logAnywayForAction = action({
  args: {
    actionId: v.id("actions"),
  },
  handler: async (ctx, { actionId }): Promise<LogAnywayForActionResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const aiInternal = (internal as any).ai;
    const member: Doc<"actions"> | null = await ctx.runQuery(aiInternal.getActionMember, { actionId });
    if (!member || member.userId !== userId) throw new Error("Not found");
    const group: Doc<"actionGroups"> | null = await ctx.runQuery(aiInternal.getActionGroupForClarification, {
      groupId: member.groupId,
    });
    if (!group || group.userId !== userId) throw new Error("Not found");
    const message: Doc<"chat_messages"> = await ctx.runQuery((internal as any).chat.getAssistantOutcomeForGroup, {
      userId,
      actionGroupId: group._id,
    });
    if (!message || message.userId !== userId) throw new Error("Not found");

    const duplicateCard = Array.isArray(message.turnCards)
      ? (message.turnCards as ChatTurnCard[]).find((card) =>
          card.kind === "duplicate"
          && card.data.items.some((item) => item.actionId === String(actionId)),
        )
      : undefined;
    if (member.status !== "committed" && !duplicateCard) {
      throw new Error("Action is not duplicate-blocked");
    }
    if (member.status !== "failed" && member.status !== "committed") {
      throw new Error("Action is not duplicate-blocked");
    }
    if (member.actionType !== "meal" && member.actionType !== "workout" && member.actionType !== "recovery") {
      throw new Error("Unsupported duplicate action type");
    }

    const groupInput = {
      userId,
      groupIdempotencyKey: group.groupIdempotencyKey,
      sourceSurface: group.sourceSurface,
      rawInput: group.rawInput,
      model: group.model,
      clientLocalDate: group.clientLocalDate,
      clientLocalTime: group.clientLocalTime,
      clientTimeZone: group.clientTimeZone,
      createdAt: group.createdAt,
    };
    const payload = {
      ...(member.payload as Record<string, unknown>),
      ...(member.actionType === "recovery" ? { mode: "allow_duplicate" } : { allowDuplicate: true }),
    };
    const memberInput = {
      memberIdempotencyKey: member.memberIdempotencyKey,
      payload,
      provenance: member.provenance,
      confidence: member.confidence,
      validation: member.validation,
      reversible: member.reversible,
      resolvedDate: member.resolvedDate,
      resolvedTime: member.resolvedTime,
    };

    if (member.actionType === "meal") {
      await ctx.runMutation((internal as any).actions_writer.writeMealAction, { group: groupInput, member: memberInput });
    } else if (member.actionType === "workout") {
      await ctx.runMutation((internal as any).actions_writer.writeWorkoutAction, { group: groupInput, member: memberInput });
    } else {
      await ctx.runMutation((internal as any).actions_writer.writeRecoveryAction, { group: groupInput, member: memberInput });
    }
    await finalizeActionGroup(ctx, String(group._id));

    const currentMembers: Doc<"actions">[] = await ctx.runQuery(aiInternal.getPendingMembersForClarification, {
      groupId: group._id,
    });
    const committed = currentMembers.find((candidate) => candidate._id === actionId);
    if (!committed || committed.userId !== userId || committed.status !== "committed" || !committed.committedRowRef) {
      throw new Error("Action was not committed");
    }
    const resultItems = resultCardItemsForActions(currentMembers);
    const committedItems = resultItems.filter(
      (item): item is Extract<ResultCardItem, { status: "committed" }> => item.status === "committed",
    );
    const preservedCards: ChatTurnCard[] = [];
    for (const card of (message.turnCards ?? []) as ChatTurnCard[]) {
      if (card.kind === "result" || card.kind === "undo") continue;
      if (card.kind === "duplicate") {
        const items = card.data.items.filter((item) => item.actionId !== String(actionId));
        if (items.length > 0) preservedCards.push({ ...card, data: { ...card.data, items } });
        continue;
      }
      if (card.kind === "failure") {
        const items = card.data.items.filter((item) => item.actionId !== String(actionId));
        if (items.length > 0) preservedCards.push({ ...card, data: { ...card.data, items } });
        continue;
      }
      preservedCards.push(card);
    }
    const turnCards: ChatTurnCard[] = [
      ...preservedCards,
      {
        version: 1,
        kind: "result",
        data: { groupId: String(group._id), items: resultItems },
      },
      {
        version: 1,
        kind: "undo",
        data: {
          groupId: String(group._id),
          items: committedItems.map(({ status: _status, ...item }) => ({ ...item, state: "available" as const })),
        },
      },
    ];
    const content = `Saved ${confirmationDescription(committed)}.`;
    const actionIds = currentMembers.map((candidate) => candidate._id);
    await ctx.runMutation(internal.chat.updateAssistantOutcomeForGroup, {
      userId,
      actionGroupId: group._id,
      content,
      turnOutcome: "committed",
      turnCards,
      actionIds,
    });

    return {
      actionId,
      actionGroupId: group._id,
      status: "committed",
      record: committed.committedRowRef,
      turn: {
        content,
        turnContractVersion: 1,
        turnOutcome: "committed",
        turnCards,
        actionGroupId: group._id,
        actionIds,
      },
    };
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

/** Commit a Home confirmation card through the canonical action envelope. */
export const commitHomeDraft = mutation({
  args: {
    draft: v.any(),
    clientSubmissionId: v.string(),
  },
  handler: async (ctx, { draft: rawDraft, clientSubmissionId }): Promise<{ id: string; actionId: Id<"actions">; groupId: Id<"actionGroups"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    if (!clientSubmissionId.trim()) throw new Error("clientSubmissionId is required");
    if (!rawDraft || typeof rawDraft !== "object" || Array.isArray(rawDraft)) {
      throw new Error("A log draft is required");
    }

    const draft = rawDraft as Record<string, any>;
    const kind = draft.kind;
    const actionType = kind === "workout" ? "workout" : ["sleep", "water", "mood", "steps"].includes(kind) ? "recovery" : null;
    if (!actionType) throw new Error("Unsupported Home log draft");

    const date = assertValidDate(String(draft.date ?? new Date().toISOString().slice(0, 10)));
    const time = assertValidTime(typeof draft.time === "string"
      ? draft.time
      : typeof draft.timestamp === "string"
        ? draft.timestamp
        : new Date().toISOString().slice(11, 16));
    const groupIdempotencyKey = deriveGroupKey({
      userId: identity.subject,
      sourceSurface: "chat",
      rawInput: `home-confirm:${clientSubmissionId}`,
      clientSubmissionId,
    });
    const group = {
      userId: identity.subject,
      groupIdempotencyKey,
      sourceSurface: "chat" as const,
      rawInput: `home-confirm:${clientSubmissionId}`,
      clientLocalDate: date,
      clientLocalTime: time,
      createdAt: Date.now(),
    };
    const reportedCalories = kind === "workout" && typeof draft.reportedCalories === "number"
      ? draft.reportedCalories
      : kind === "workout" && draft.calorieSource === "reported" && typeof draft.kcal === "number"
        ? draft.kcal
        : undefined;
    const estimatedCalories = kind === "workout" && typeof draft.estimatedCalories === "number"
      ? draft.estimatedCalories
      : kind === "workout" && reportedCalories == null && typeof draft.kcal === "number"
        ? draft.kcal
        : undefined;
    const payload = kind === "workout"
      ? {
          name: String(draft.description ?? draft.name ?? "Workout"),
          sets: String(draft.sets ?? "1"),
          duration: String(draft.duration ?? ""),
          intensity: String(draft.intensity ?? "MEDIUM").toUpperCase(),
          date,
          timestamp: time,
          exercises: draft.exercises ?? undefined,
          rationale: draft.rationale ?? undefined,
          caloriesBurned: typeof draft.kcal === "number" && draft.kcal > 0 ? draft.kcal : undefined,
          reportedCalories,
          estimatedCalories,
          calorieSource: reportedCalories != null ? "reported" as const : estimatedCalories != null ? "estimated" as const : undefined,
          calorieConfidence: draft.calorieResult?.confidence,
          calorieRangeLow: draft.calorieResult?.range_low,
          calorieRangeHigh: draft.calorieResult?.range_high,
          calorieEstimateRough: draft.calorieResult?.rough,
          calorieBreakdown: draft.calorieResult?.breakdown ? JSON.stringify(draft.calorieResult.breakdown) : undefined,
          calculationVersion: draft.calorieResult ? 1 : undefined,
          structuredSets: draft.exercises ? JSON.stringify(draft.exercises) : undefined,
          logSource: "home",
          allowDuplicate: draft.allowDuplicate,
        }
      : {
          kind,
          date,
          time,
          source: "home",
          note: draft.description,
          ...(kind === "sleep" ? { hours: draft.hours, quality: draft.quality } : {}),
          ...(kind === "water" ? { ml: draft.ml } : {}),
          ...(kind === "mood" ? { rating: draft.rating } : {}),
          ...(kind === "steps" ? { count: draft.count } : {}),
        };
    const memberIdempotencyKey = deriveMemberKey({
      groupKey: groupIdempotencyKey,
      actionType,
      payloadFingerprint: clientSubmissionId,
      ordinal: 0,
    });
    const member = {
      memberIdempotencyKey,
      payload,
      provenance: kind === "workout" && reportedCalories != null ? "user_reported" as const : "ai_extracted" as const,
      validation: { status: draft.parseError ? "error" as const : "valid" as const, messages: draft.parseError ? [String(draft.parseError)] : [] },
      reversible: true,
      resolvedDate: date,
      resolvedTime: time,
    };
    const result: any = actionType === "workout"
      ? await ctx.runMutation((internal as any).actions_writer.writeWorkoutAction, { group, member })
      : await ctx.runMutation((internal as any).actions_writer.writeRecoveryAction, { group, member });
    const action = await ctx.db
      .query("actions")
      .withIndex("by_member_idempotency_key", (q) => q.eq("userId", identity.subject).eq("memberIdempotencyKey", memberIdempotencyKey))
      .first();
    if (!action) throw new Error("Canonical action envelope was not created");
    await finalizeActionGroupInMutation(ctx, action.groupId);
    return {
      id: actionType === "recovery" ? String((result as any)?.id ?? result) : String(result),
      actionId: action._id,
      groupId: action.groupId,
    };
  },
});

export const parseOnboarding = action({
  args: { field: v.string(), text: v.string() },
  handler: async (ctx, { field, text }): Promise<Record<string, unknown>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertMaxChars(text, AI_INPUT_LIMITS.textChars, "onboarding text");
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
      ctx,
      identity.subject,
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
    assertMaxChars(name, AI_INPUT_LIMITS.textChars, "recipe name");
    assertIngredients(ingredients);
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `You are a friendly nutrition coach. In 1-2 short sentences, give one specific, encouraging insight about this recipe — name a nutritional strength and (optionally) one small tweak. No preamble.\nRecipe: ${name}\nPer serving: ${perServing.kcal} kcal, ${perServing.p}g protein, ${perServing.c}g carbs, ${perServing.f}g fat\nIngredients: ${ingredients.join(", ")}`;
    return callAI(
      ctx,
      identity.subject,
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
    assertMaxChars(text, AI_INPUT_LIMITS.textChars, "ingredient text");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `You are a nutrition database. Parse this ingredient list (natural language, any units or portions) into structured JSON. For EACH ingredient: estimate the realistic edible weight in grams of the stated portion (e.g. "1 large banana"≈120, "1 tbsp olive oil"≈14, "2 eggs"≈100, "a handful of almonds"≈30, "1 cup cooked rice"≈195), and give standard per-100g macros. Return ONLY a JSON array, no prose:\n[{"name": string, "grams": number, "caloriesPer100g": number, "proteinPer100g": number, "carbsPer100g": number, "fatPer100g": number}]\n\nIngredients: "${text}"`;
    const content = await callAI(
      ctx,
      identity.subject,
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
          grams: finiteNonNegativeNumber("ingredient grams", r.grams),
          caloriesPer100g: finiteNonNegativeNumber("ingredient caloriesPer100g", r.caloriesPer100g),
          proteinPer100g: finiteNonNegativeNumber("ingredient proteinPer100g", r.proteinPer100g),
          carbsPer100g: finiteNonNegativeNumber("ingredient carbsPer100g", r.carbsPer100g),
          fatPer100g: finiteNonNegativeNumber("ingredient fatPer100g", r.fatPer100g),
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
    assertMaxChars(text, AI_INPUT_LIMITS.textChars, "cooking method");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `Turn this cooking method into clear, concise, ordered recipe steps. One action per step, imperative voice, no numbering or prose. Return ONLY a JSON array of strings.\n\nMethod: "${text}"`;
    const content = await callAI(
      ctx,
      identity.subject,
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
    if (!identity) throw new Error("Unauthenticated");
    assertMaxChars(mealName, AI_INPUT_LIMITS.textChars, "meal name");
    const userId = identity.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    model = settings?.openRouterModel ?? undefined;
    apiKey = settings?.openRouterKey ?? undefined;
    const prompt = `Estimate the nutritional values for this meal: "${mealName}".

${NUTRITION_ACCURACY_RULES}

Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 200, model, apiKey);
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
    if (!identity) throw new Error("Unauthenticated");
    assertMaxChars(description, AI_INPUT_LIMITS.textChars, "meal description");
    const userId = identity.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    model = settings?.openRouterModel ?? undefined;
    apiKey = settings?.openRouterKey ?? undefined;
    const parsedMeal = await parseMealDescription(description, mealType || "unspecified", time || "", ctx, userId, model, apiKey);

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
    if (!identity) throw new Error("Unauthenticated");
    assertMaxChars(description, AI_INPUT_LIMITS.textChars, "workout description");
    const userId = identity.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    let userPhysique: UserPhysique | undefined;
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
    const result = await parseWorkoutDescription(description, ctx, userId, duration, intensity, model, apiKey, userPhysique);
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
      parsedMeal = await parseMealDescription(description, mealType || "unspecified", time || "", ctx, userId, model, apiKey);
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
      const parsed = await parseWorkoutDescription(description, ctx, userId, duration, intensity, model, apiKey, userPhysique);
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
  handler: async (ctx, { message, sessionId, coachType, today: todayArg, image, clarificationGroupId, clientSubmissionId }): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertMaxChars(message, AI_INPUT_LIMITS.messageChars, "chat message");
    if (image) assertImageDataUrl(image, "chat image");
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

    const loggingPrompt = `\n\nLOGGING STATUS:
The app extracts and saves reported activities through a separate structured pipeline.
Respond conversationally only. Never claim that anything was logged, saved, recorded, or added; the app will append a truthful status after persistence.`;

    // Load session history
    let history: { role: string; content: string }[] = [];
    let isFirstMessage = false;
    if (sessionId) {
      const [msgs, count] = await Promise.all([
        ctx.runQuery(internal.chat.getMessagesForContext, { userId, sessionId }),
        ctx.runQuery(internal.chat.getMessageCount, { userId, sessionId }),
      ]);
      history = msgs;
      isFirstMessage = count === 0;
      assertHistoryEntries(history);
    }

    // Save user message
    await ctx.runMutation(internal.chat.addMessage, {
      userId,
      sessionId,
      role: "user",
      content: message,
      clientSubmissionId,
    });

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
        const actionRows: Doc<"actions">[] = await ctx.runQuery(internal.ai.getPendingMembersForClarification, {
          groupId: clarificationGroupId,
        });
        const resultItems = resultCardItemsForActions(actionRows);
        const committedItems = resultItems.filter(
          (item): item is Extract<ResultCardItem, { status: "committed" }> => item.status === "committed",
        );
        const outcome: ChatTurnOutcome = committedItems.length > 0 ? "committed" : "failed";
        const cards: ChatTurnCard[] = [{
          version: 1,
          kind: "result",
          data: { groupId: String(clarificationGroupId), items: resultItems },
        }];
        if (committedItems.length > 0) {
          cards.push({
            version: 1,
            kind: "undo",
            data: {
              groupId: String(clarificationGroupId),
              items: committedItems.map(({ status: _status, ...item }) => ({ ...item, state: "available" as const })),
            },
          });
        }
        const resolvedReply = outcome === "committed"
          ? `Saved ${committedItems.map((item) => item.title).join(", ")} for ${answerDate}.`
          : "I couldn't save that. Please try again.";
        await ctx.runMutation(internal.chat.addMessage, {
          userId,
          sessionId,
          role: "ai",
          content: resolvedReply,
          clientSubmissionId,
          turnContractVersion: 1,
          turnOutcome: outcome,
          turnCards: cards,
          actionGroupId: clarificationGroupId,
          actionIds: actionRows.map((action) => action._id),
        });
        if (sessionId) {
          await ctx.runMutation(internal.chat.touchSession, { userId, sessionId });
        }
        const loggedItem = resolved.loggedItems.length === 1
          ? resolved.loggedItems[0]
          : resolved.loggedItems.length > 1
            ? { type: "multiple", items: resolved.loggedItems }
            : null;
        return {
          reply: resolvedReply,
          loggedItem,
          memoryApprovals: resolved.memoryApprovals ?? [],
          failedItems: [],
          coachType: toLegacyPersona(coachType),
          restricted: restrictedGuidance,
          outcome,
          cards,
        };
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
    const reply = await callAI(ctx, userId, messages, 800, replyModel, apiKey);

    const extractionHistory: HomepageHistoryMessage[] = history.flatMap((entry) => {
      const role = entry.role === "ai" ? "assistant" : entry.role;
      return role === "user" || role === "assistant"
        ? [{ role, content: entry.content } as HomepageHistoryMessage]
        : [];
    });
    const extraction = await extractStructuredLogItems({
      ctx,
      userId,
      message,
      image,
      today,
      history: extractionHistory,
      model: parseModel,
      visionModel: settingsModel && VISION_MODELS.has(settingsModel) ? settingsModel : DEFAULT_MODEL,
      apiKey,
    });
    const parsedTurn = extraction.failure
      ? { drafts: [], summaryParts: [], failedItems: [] as FailedLogItem[] }
      : await parseStructuredLogItems({
          ctx,
          userId,
          items: extraction.items,
          image,
          today,
          settingsModel: parseModel,
          visionModel: settingsModel && VISION_MODELS.has(settingsModel) ? settingsModel : DEFAULT_MODEL,
          apiKey,
          userMacros: extractUserMacros(message),
        });
    const candidates = parsedTurn.drafts.map(turnCandidateFromDraft);
    const submissionRawInput = image ? `${message}\n[image:${stableHash(image)}]` : message;
    const turnResult = await executeTurnPolicy({
      ctx,
      userId,
      rawInput: submissionRawInput,
      clientSubmissionId,
      today,
      model: parseModel,
      candidates,
      parseFailures: parsedTurn.failedItems,
      turnFailure: extraction.failure,
      forceConfirmation: false,
    });
    const statusText = turnOutcomeText(turnResult);
    // Report turns use only the persisted outcome as user-facing status text.
    // Unconstrained model prose is safe only for genuine no_action turns.
    const conversationalReply = turnResult.outcome === "no_action" ? sanitizeConversationalReply(reply) : "";
    const cleanReply = [conversationalReply, statusText].filter(Boolean).join("\n\n")
      || (turnResult.outcome === "no_action" ? "How can I help with that?" : "I couldn't save that. Please try again.");
    const loggedItem = turnResult.loggedItems.length === 1
      ? turnResult.loggedItems[0]
      : turnResult.loggedItems.length > 1
        ? { type: "multiple", items: turnResult.loggedItems }
        : null;
    const memoryApprovals = turnResult.memoryApprovals;
    const failedItems = parsedTurn.failedItems;
    const clarification = turnResult.clarification;
    const confirmation = turnResult.confirmation;

    // Save AI reply
    const messageId = await ctx.runMutation(internal.chat.addMessage, {
      userId,
      sessionId,
      role: "ai",
      content: cleanReply,
      clientSubmissionId,
      turnContractVersion: 1,
      turnOutcome: turnResult.outcome,
      turnCards: turnResult.cards,
      actionGroupId: turnResult.groupId,
      actionIds: turnResult.actionIds,
    });

    // Update session
    if (sessionId) {
      if (isFirstMessage) {
        try {
          const title = await callAI(
            ctx,
            userId,
            [
              { role: "system", content: "Generate a short, descriptive title (max 6 words, 40 characters) for a fitness coaching conversation based on the user's first message. Return ONLY the title, no quotes, no punctuation." },
              { role: "user", content: message },
            ],
            40,
            parseModel,
            apiKey,
          );
          const cleanTitle = title.replace(/^["']|["']$/g, "").trim().slice(0, 60);
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { userId, sessionId, title: cleanTitle || message.slice(0, 50) });
        } catch {
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { userId, sessionId, title: message.slice(0, 50) });
        }
      } else {
        await ctx.runMutation(internal.chat.touchSession, { userId, sessionId });
      }
    }

    return {
      reply: cleanReply,
      loggedItem,
      memoryApprovals,
      failedItems,
      coachType: detectedCoach,
      clarification,
      confirmation,
      restricted: restrictedGuidance,
      outcome: turnResult.outcome,
      cards: turnResult.cards,
      messageId,
    };
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
  handler: async (ctx, { userId, date }) => {
    if (process.env.AI_CRONS_ENABLED !== "true") {
      console.log(JSON.stringify({ event: "ai_cron_worker_skipped", cron: "daily_insights", userId, reason: "AI_CRONS_ENABLED_not_true" }));
      return { skipped: true };
    }
    return runDailyInsights(ctx, userId, date);
  },
});

const AI_CRON_BATCH_SIZE = 25;
const AI_CRON_BATCH_DELAY_MS = 60_000;

// TODO(beta P1): replace this delayed fan-out with a bounded, cursor-driven dispatcher
// before enabling AI_CRONS_ENABLED. See plans/005-beta-release.md, P1 priority.
/** Cron: fan out daily insights to each active user via the scheduler. */
export const cronDailyInsights = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.AI_CRONS_ENABLED !== "true") {
      console.log(JSON.stringify({ event: "ai_cron_skipped", cron: "daily_insights", reason: "AI_CRONS_ENABLED_not_true" }));
      return { users: 0 };
    }

    const users = (await ctx.runQuery(internal.behavior.listActiveUsers, { days: 3 })) as string[];
    for (let batchStart = 0; batchStart < users.length; batchStart += AI_CRON_BATCH_SIZE) {
      const batch = users.slice(batchStart, batchStart + AI_CRON_BATCH_SIZE);
      const delayMs = (batchStart / AI_CRON_BATCH_SIZE) * AI_CRON_BATCH_DELAY_MS;
      for (const userId of batch) {
        // Derive the user's local date from their stored timezone offset.
        const settings = (await ctx.runQuery(internal.profile.getSettingsForContext, { userId })) as any;
        const offsetMin: number = settings?.timezoneOffsetMinutes ?? 0;
        const localDate = new Date(Date.now() - offsetMin * 60_000).toISOString().slice(0, 10);
        await ctx.scheduler.runAfter(delayMs, internal.ai.generateDailyInsightsForUser, { userId, date: localDate });
      }
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
    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 300, model, apiKey);
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
  handler: async (ctx, { userId }) => {
    if (process.env.AI_CRONS_ENABLED !== "true") {
      console.log(JSON.stringify({ event: "ai_cron_worker_skipped", cron: "weekly_summary", userId, reason: "AI_CRONS_ENABLED_not_true" }));
      return { skipped: true };
    }
    return runWeeklySummary(ctx, userId);
  },
});

/** Cron: fan out weekly summaries to each active user via the scheduler. */
export const cronWeeklySummary = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.AI_CRONS_ENABLED !== "true") {
      console.log(JSON.stringify({ event: "ai_cron_skipped", cron: "weekly_summary", reason: "AI_CRONS_ENABLED_not_true" }));
      return { users: 0 };
    }

    const users = (await ctx.runQuery(internal.behavior.listActiveUsers, { days: 7 })) as string[];
    for (let batchStart = 0; batchStart < users.length; batchStart += AI_CRON_BATCH_SIZE) {
      const batch = users.slice(batchStart, batchStart + AI_CRON_BATCH_SIZE);
      const delayMs = (batchStart / AI_CRON_BATCH_SIZE) * AI_CRON_BATCH_DELAY_MS;
      for (const userId of batch) {
        await ctx.scheduler.runAfter(delayMs, internal.ai.generateWeeklySummaryForUser, { userId });
      }
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
    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 300, model, apiKey);
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
    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 800, model, apiKey);
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
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    assertImageDataUrl(imageDataUrl, "image data URL");
    if (userDescription) assertMaxChars(userDescription, AI_INPUT_LIMITS.textChars, "image description");
    let model: string | undefined;
    let apiKey: string | undefined;
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    model = settings?.openRouterModel ?? undefined;
    apiKey = settings?.openRouterKey ?? undefined;
    const visionModel = model && VISION_MODELS.has(model) ? model : DEFAULT_MODEL;

    const portionClause = userDescription
      ? ` The user says they have: "${userDescription}". If possible, estimate userPortionGrams for this description.`
      : "";

    const prompt = `This is a nutrition label image.${portionClause}

${NUTRITION_ACCURACY_RULES}

Extract nutritional values per 100g. If the label is per serving, convert using the serving size; if serving size is unclear, keep servingSize null and avoid guessing userPortionGrams. Return ONLY a JSON object, no markdown:
{"name":"product name","caloriesPer100g":number,"proteinPer100g":number,"carbsPer100g":number,"fatPer100g":number,"servingSize":number_or_null,"servingUnit":"g","userPortionGrams":number_or_null}`;

    const content = await callAI(ctx, userId, [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    }], 400, visionModel, apiKey);
    const result = parseJSON<any>(content, null);
    if (!result) throw new Error("Could not parse nutrition from image");
    return {
      name: result.name || "Scanned Product",
      caloriesPer100g: finiteNonNegativeNumber("caloriesPer100g", result.caloriesPer100g),
      proteinPer100g: finiteNonNegativeNumber("proteinPer100g", result.proteinPer100g),
      carbsPer100g: finiteNonNegativeNumber("carbsPer100g", result.carbsPer100g),
      fatPer100g: finiteNonNegativeNumber("fatPer100g", result.fatPer100g),
      servingSize: optionalFiniteNonNegativeNumber("servingSize", result.servingSize),
      servingUnit: result.servingUnit || "g",
      userPortionGrams: optionalFiniteNonNegativeNumber("userPortionGrams", result.userPortionGrams),
      source: "scan" as const,
    };
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
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    assertMaxChars(args.baseName, AI_INPUT_LIMITS.textChars, "food name");
    assertMaxChars(args.portionDescription, AI_INPUT_LIMITS.textChars, "portion description");
    let model: string | undefined;
    let apiKey: string | undefined;
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    model = settings?.openRouterModel ?? undefined;
    apiKey = settings?.openRouterKey ?? undefined;

    const servingClause = args.servingSize
      ? `Serving size: ${args.servingSize}${args.servingUnit || "g"}.`
      : "";

    const prompt = `Product: ${args.baseName}
Nutrition per 100g: ${args.caloriesPer100g} cal, ${args.proteinPer100g}g protein, ${args.carbsPer100g}g carbs, ${args.fatPer100g}g fat.
${servingClause}
User portion description: "${args.portionDescription}"

Estimate the total grams the user consumed based on their description, then calculate exact macros from the per-100g data. Return ONLY a JSON object (no markdown, no explanation):
{"grams":number,"calories":number,"protein":number,"carbs":number,"fat":number}`;

    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 300, model, apiKey);
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
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    model = settings?.openRouterModel ?? undefined;
    apiKey = settings?.openRouterKey ?? undefined;

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

    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 300, model, apiKey);
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
    assertMaxChars(args.mealName, AI_INPUT_LIMITS.textChars, "meal name");
    if (args.mealComponents) assertMaxChars(args.mealComponents, AI_INPUT_LIMITS.textChars, "meal components");
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

    const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 400, model, apiKey);
    const result = parseJSON<any>(content, { suggestion: "" });
    return { suggestion: result.suggestion || "" };
  },
});

// Deliberately public: this read-only static coach catalog is safe to expose.
export const getCoaches = query({
  args: {},
  handler: async () => {
    const list = Object.values(COACHES).map(({ id, name, tagline }) => ({ id, name, tagline }));
    return [{ id: "auto", name: "Auto", tagline: "Automatically route to the right coach" }, ...list];
  },
});

export const transcribe = action({
  args: { audio: v.string(), mimeType: v.optional(v.string()) },
  handler: async (ctx, { audio, mimeType }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    assertAudioBase64(audio);
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in Convex environment");

    const mime = mimeType || "audio/webm";
    const ext = mime === "audio/mp4" ? "mp4" : mime === "audio/wav" ? "wav" : "webm";

    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const transcriptionCostUsd = estimateTranscriptionCostUsd(bytes.byteLength);
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    formData.append("model", "whisper-large-v3-turbo");

    const reservation = await ctx.runMutation(internal.ai_guard.checkAndReserve, {
      userId,
      model: "groq/whisper-large-v3-turbo",
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedCostUsd: transcriptionCostUsd,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Groq transcription error ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as { text?: string; error?: { message?: string } };
      if (data.error || !data.text) {
        throw new Error(data.error ? `Groq error: ${data.error.message}` : "Groq returned empty transcription");
      }
      await ctx.runMutation(internal.ai_guard.settleUsage, {
        reservationId: reservation.reservationId,
        inputTokens: 0,
        outputTokens: 0,
        actualCostUsd: transcriptionCostUsd,
      });
      return { transcript: data.text.trim() };
    } catch (err) {
      if ((err as Error).name === "AbortError") throw new Error("Groq transcription timed out after 30s");
      throw err;
    } finally {
      clearTimeout(timeout);
      // Fetch may have reached Groq even when its response or settlement failed; retain the reserve.
    }
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

const EXTRACTION_MAX_TOKENS = 1_600;
const EXTRACTION_HISTORY_TURNS = 12;

type HomepageHistoryEntry = { role: string; content: string };
type HomepageHistoryMessage = { role: "user" | "assistant"; content: string };
type StructuredLogItem = {
  type: "meal" | "workout" | "sleep" | "water" | "mood" | "steps";
  description: string;
  date: string;
  dateUnresolved?: boolean;
  question?: string;
  confidence?: number;
  validation?: { status: "valid" | "warning" | "error"; messages: string[] };
};
type StructuredExtraction = {
  isQuestion: boolean;
  items: StructuredLogItem[];
  failure?: {
    code: "EXTRACTION_FAILED" | "TRUNCATED_RESPONSE";
    message: string;
    retriable: boolean;
  };
};

export function trimHomepageHistory(history: HomepageHistoryEntry[]): HomepageHistoryMessage[] {
  return history
    .slice(0, -1) // The current user message is persisted before history is loaded.
    .slice(-EXTRACTION_HISTORY_TURNS)
    .flatMap((entry): HomepageHistoryMessage[] => {
      const role = entry.role === "ai" ? "assistant" : entry.role;
      if (role !== "user" && role !== "assistant") return [];
      return [{ role, content: entry.content }];
    });
}

function validateStructuredExtraction(value: unknown, today: string): { isQuestion: boolean; items: StructuredLogItem[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.isQuestion !== "boolean" || !Array.isArray(candidate.items)) return null;
  const allowedTypes = new Set<StructuredLogItem["type"]>(["meal", "workout", "sleep", "water", "mood", "steps"]);
  const items: StructuredLogItem[] = [];
  for (const rawItem of candidate.items) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return null;
    const item = rawItem as Record<string, unknown>;
    if (!allowedTypes.has(item.type as StructuredLogItem["type"])) return null;
    if (typeof item.description !== "string" || !item.description.trim()) return null;
    const dateUnresolved = item.date === "UNKNOWN_VAGUE";
    const date = !dateUnresolved && typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
      ? item.date
      : today;
    const question = typeof item.question === "string" && item.question.trim() ? item.question.trim() : undefined;
    const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence))
      : undefined;
    const rawValidation = item.validation && typeof item.validation === "object" && !Array.isArray(item.validation)
      ? item.validation as Record<string, unknown>
      : undefined;
    const validationStatus = rawValidation?.status;
    if (validationStatus !== undefined && validationStatus !== "valid" && validationStatus !== "warning" && validationStatus !== "error") {
      return null;
    }
    const validationMessages = rawValidation?.messages;
    if (validationMessages !== undefined && (!Array.isArray(validationMessages) || !validationMessages.every((message) => typeof message === "string"))) {
      return null;
    }
    items.push({
      type: item.type as StructuredLogItem["type"],
      description: item.description.trim(),
      date,
      ...(dateUnresolved ? { dateUnresolved: true } : {}),
      ...(question ? { question } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(validationStatus ? {
        validation: {
          status: validationStatus,
          messages: (validationMessages as string[] | undefined) ?? [],
        },
      } : {}),
    });
  }
  return { isQuestion: candidate.isQuestion, items };
}

function structuredExtractionPrompt(today: string): string {
  const yesterday = new Date(new Date(today).getTime() - 86_400_000).toISOString().split("T")[0];
  const twoDaysAgo = new Date(new Date(today).getTime() - 2 * 86_400_000).toISOString().split("T")[0];
  return `You are a wellness tracking assistant. Extract ALL loggable items from the user's message.

Today's date is ${today}.

Return ONLY this JSON shape:
{
  "isQuestion": boolean,
  "items": [
    {
      "type": "meal" | "workout" | "sleep" | "water" | "mood" | "steps",
      "description": "the specific user-reported item",
      "date": "YYYY-MM-DD" | "UNKNOWN_VAGUE",
      "question": "optional clarification question",
      "confidence": "optional number from 0 to 1",
      "validation": {"status":"valid"|"warning"|"error","messages":[]}
    }
  ]
}

Rules:
- A report of food, drink, exercise, sleep, mood, or steps is not a pure question.
- Extract every reported item, including reports that also contain a question.
- Negated activities are not items.
- A list of exercises in one session is one workout item.
- Resolve explicit references from recent USER messages only. Never invent placeholders.
- "yesterday" is ${yesterday}; "2 days ago" is ${twoDaysAgo}.
- "last night" sleep uses ${today}; other "last night" reports use ${yesterday}.
- Missing dates use ${today}.
- Vague dates that cannot be resolved use "UNKNOWN_VAGUE" and include a question.
- Pure advice/conversation returns {"isQuestion":true,"items":[]}.`;
}

async function extractStructuredLogItems(input: {
  ctx: ActionCtx;
  userId: string;
  message: string;
  image?: string;
  today: string;
  history: HomepageHistoryMessage[];
  model?: string;
  visionModel: string;
  apiKey?: string;
}): Promise<StructuredExtraction> {
  const {
    ctx, userId, message, image, today, history, model, visionModel, apiKey,
  } = input;
  const estimateMode = looksLikeFoodEstimate(message);
  const homepageIntent = classifyHomepageIntent(message);
  const heuristicSaysLog = !!image || homepageIntent === "log_report" || looksLikeLog(message) || estimateMode;
  const prompt = structuredExtractionPrompt(today);
  const messages: AIMessage[] = [
    { role: "system", content: prompt },
    ...history,
    image
      ? { role: "user", content: [{ type: "text", text: message || "What do you see?" }, { type: "image_url", image_url: { url: image } }] }
      : { role: "user", content: message },
  ];
  const selectedModel = image ? visionModel : model;

  let firstError: unknown;
  let parsed: { isQuestion: boolean; items: StructuredLogItem[] } | null = null;
  try {
    const raw = await callAI(ctx, userId, messages, EXTRACTION_MAX_TOKENS, selectedModel, apiKey);
    parsed = validateStructuredExtraction(parseJSON<unknown>(raw, null), today);
  } catch (error) {
    firstError = error;
  }

  const suspicious = !parsed || (heuristicSaysLog && (parsed.isQuestion || parsed.items.length === 0));
  if (suspicious) {
    try {
      const raw = await callAI(ctx, userId, [
        { role: "system", content: `${prompt}\n\nRETRY: Return complete valid JSON. The current message ${heuristicSaysLog ? "is a log report; do not omit its items" : "must be re-evaluated without inventing items"}.` },
        ...history,
        image
          ? { role: "user", content: [{ type: "text", text: message || "What do you see?" }, { type: "image_url", image_url: { url: image } }] }
          : { role: "user", content: message },
      ], EXTRACTION_MAX_TOKENS, selectedModel, apiKey);
      const retried = validateStructuredExtraction(parseJSON<unknown>(raw, null), today);
      if (retried) parsed = retried;
    } catch (error) {
      firstError ??= error;
    }
  }

  if (!parsed || (heuristicSaysLog && (parsed.isQuestion || parsed.items.length === 0))) {
    if (!heuristicSaysLog && parsed) return { ...parsed, items: [] };
    const messageText = firstError instanceof Error ? firstError.message : "The model did not return a valid structured extraction";
    const truncated = /finish_reason:\s*(?:length|content_filter)|incomplete response|truncat/i.test(messageText);
    return {
      isQuestion: false,
      items: [],
      failure: {
        code: truncated ? "TRUNCATED_RESPONSE" : "EXTRACTION_FAILED",
        message: messageText,
        retriable: true,
      },
    };
  }

  return {
    isQuestion: parsed.isQuestion,
    items: parsed.items.filter((item) => !isNegatedLogItem(message, item)),
  };
}

export function isUnusablePlaceholderMeal(description: string, parsed: {
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  parseError?: unknown;
}): boolean {
  const normalized = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const genericPlaceholder = normalized.length === 0
    || /^(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) )?(?:meal|food|dish|breakfast|lunch|dinner|snack)(?: \d+)?$/.test(normalized);
  const allZero = [parsed.calories, parsed.protein, parsed.carbs, parsed.fat]
    .every((value) => Number(value) === 0);
  return genericPlaceholder && typeof parsed.parseError === "string" && allZero;
}

export function disambiguateCardTitles(titles: string[]): string[] {
  const normalized = titles.map((title) => title.trim().toLowerCase());
  const counts = new Map<string, number>();
  for (const title of normalized) counts.set(title, (counts.get(title) ?? 0) + 1);

  const seen = new Map<string, number>();
  return titles.map((title, index) => {
    const key = normalized[index];
    if ((counts.get(key) ?? 0) < 2) return title;
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    return `${title} (${ordinal})`;
  });
}

async function parseStructuredLogItems(input: {
  ctx: ActionCtx;
  userId: string;
  items: StructuredLogItem[];
  image?: string;
  today: string;
  settingsModel?: string;
  visionModel: string;
  apiKey?: string;
  userMacros: ReturnType<typeof extractUserMacros>;
}): Promise<{
  drafts: any[];
  summaryParts: string[];
  failedItems: FailedLogItem[];
}> {
  const {
    ctx, userId, items, image, today, settingsModel, visionModel, apiKey, userMacros,
  } = input;
  const hasUserMacros = Object.values(userMacros).some((value) => value != null);
  const withTurnMetadata = (draft: any, item: StructuredLogItem) => ({
    ...draft,
    _turnDescription: item.description,
    _turnDateUnresolved: item.dateUnresolved,
    _turnQuestion: item.question,
    _turnConfidence: item.confidence,
    _turnValidation: item.validation,
  });
  const [profile, metabolicProfile, userIngredients] = await Promise.all([
    ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ctx.runQuery(api.calibration.getMetabolicProfileForContext, {}),
    ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
  ]);
  const userPhysique: UserPhysique | undefined = profile ? {
    weight: profile.weight,
    height: profile.height,
    age: profile.age,
    sex: profile.sex,
    fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
    metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
  } : undefined;
  const drafts: any[] = [];
  const summaryParts: string[] = [];
  const failedItems: FailedLogItem[] = [];

  for (const item of items) {
    try {
      assertMaxChars(item.description, AI_INPUT_LIMITS.textChars, "log item description");
      if (item.type === "meal") {
        let description = item.description;
        if (image && !description.trim()) {
          description = await callAI(ctx, userId, [{
            role: "user",
            content: [{ type: "text", text: "Describe this food briefly." }, { type: "image_url", image_url: { url: image } }],
          }], 150, visionModel, apiKey);
        }

        const memoryDraft = await buildMealDraftFromParsed(ctx, {
          name: description,
          description,
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
          drafts.push(withTurnMetadata(draft, item));
          summaryParts.push(`${memoryDraft.name} (~${draft.kcal} kcal, from memory)`);
          continue;
        }

        const parsed = await parseMealDescription(description, "unspecified", "", ctx, userId, settingsModel, apiKey, userIngredients as any[]);
        if (isUnusablePlaceholderMeal(description, parsed)) {
          failedItems.push({
            kind: "meal",
            code: "PARSE_FAILED",
            description,
            reason: parsed.parseError || "The meal description did not contain usable food details",
          });
          continue;
        }
        const nutrition = nutritionFromDraft(await buildMealDraftFromParsed(
          ctx,
          { ...parsed, date: item.date, description },
          { userId, useMemory: true },
        ));
        const canonicalDraft = nutrition.ingredientBreakdown as MealDraft;
        const baseDraft = {
          kind: "meal",
          date: item.date,
          description: parsed.name || description,
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
        const macroDecision = hasUserMacros
          ? applyUserMacros(baseDraft, userMacros)
          : { draft: baseDraft, conflict: false, reason: "" };
        drafts.push(withTurnMetadata(macroDecision.draft, item));
        summaryParts.push(`${parsed.name || "Meal"} (~${macroDecision.draft.kcal} kcal)`);
      } else if (item.type === "workout") {
        const parsed = await parseWorkoutDescription(item.description, ctx, userId, undefined, undefined, settingsModel, apiKey, userPhysique);
        if (parsed.parseError) {
          failedItems.push({
            kind: "workout",
            code: "PARSE_FAILED",
            description: item.description,
            reason: parsed.parseError,
          });
          continue;
        }
        const statedKcal = extractStatedWorkoutCalories(item.description);
        const finalKcal = statedKcal ?? parsed.caloriesBurned ?? 0;
        drafts.push(withTurnMetadata({
          kind: "workout",
          date: item.date,
          description: parsed.name,
          name: parsed.name,
          type: parsed.name,
          duration: parseDurationMinutes(parsed.duration ?? "30 min") || 30,
          kcal: finalKcal,
          reportedCalories: statedKcal,
          estimatedCalories: statedKcal == null ? parsed.calorieResult?.total_kcal : undefined,
          calorieSource: statedKcal != null ? "reported" : parsed.calorieResult?.total_kcal != null ? "estimated" : undefined,
          intensity: parsed.intensity?.toLowerCase() === "high"
            ? "high"
            : parsed.intensity?.toLowerCase() === "low"
              ? "light"
              : "medium",
          sets: parsed.sets,
          rationale: parsed.rationale,
          exercises: parsed.exercises,
          calorieResult: parsed.calorieResult,
          parseError: parsed.parseError,
          confidence: parsed.calorieResult?.confidence,
          time: new Date().toTimeString().slice(0, 5),
        }, item));
        const range = statedKcal != null
          ? `~${statedKcal} kcal burned`
          : parsed.calorieResult
            ? `~${parsed.calorieResult.range_low}-${parsed.calorieResult.range_high} kcal, rough`
            : `~${finalKcal} kcal burned`;
        summaryParts.push(`${parsed.name} (${range})`);
      } else if (item.type === "sleep") {
        const raw = await callAI(ctx, userId, [{
          role: "user",
          content: `Extract sleep data from: "${item.description}"
Return ONLY JSON: {"hours": number, "quality": "poor"|"ok"|"good"|"great"}.`,
        }], 80, settingsModel, apiKey);
        const data = parseJSON<{ hours?: number; band?: string; quality?: string }>(raw, {});
        const hours = typeof data.hours === "number" && Number.isFinite(data.hours) ? data.hours : undefined;
        const band = ["under_6", "six_to_eight", "eight_plus"].includes(data.band ?? "") ? data.band : undefined;
        const quality = ["poor", "ok", "good", "great"].includes(data.quality ?? "") ? data.quality : undefined;
        const draft = buildRecoveryDraft({ kind: "sleep", date: item.date ?? today, hours, band, quality, source: "ai_extracted" });
        drafts.push(withTurnMetadata({ ...recoveryPayloadFromDraft(draft), description: item.description }, item));
        summaryParts.push(hours != null ? `Sleep: ${hours.toFixed(1)}h${quality ? ` (${quality})` : ""}` : band ? `Sleep: ${band}` : "Sleep: value needed");
      } else if (item.type === "water") {
        const raw = await callAI(ctx, userId, [{
          role: "user",
          content: `Extract water amount in ml from: "${item.description}"
Common conversions: 1 glass = 250ml, 1L = 1000ml, 1 bottle = 500ml.
Return ONLY a number (ml).`,
        }], 20, settingsModel, apiKey);
        const parsedMl = parseInt(raw.replace(/[^0-9]/g, ""), 10);
        const ml = Number.isFinite(parsedMl) ? parsedMl : undefined;
        const draft = buildRecoveryDraft({ kind: "water", date: item.date ?? today, ml, source: "ai_extracted" });
        drafts.push(withTurnMetadata({ ...recoveryPayloadFromDraft(draft), description: item.description }, item));
        summaryParts.push(ml != null ? `Water: ${ml >= 1000 ? `${(ml / 1000).toFixed(1)}L` : `${ml}ml`}` : "Water: value needed");
      } else if (item.type === "mood") {
        const raw = await callAI(ctx, userId, [{
          role: "user",
          content: `Extract mood rating 1-5 from: "${item.description}"
1=very bad, 2=bad, 3=ok, 4=good, 5=great. Return ONLY a number 1-5.`,
        }], 10, settingsModel, apiKey);
        const parsedRating = parseInt(raw.replace(/[^0-9]/g, ""), 10);
        const rating = Number.isFinite(parsedRating) ? parsedRating : undefined;
        const draft = buildRecoveryDraft({ kind: "mood", date: item.date ?? today, rating, source: "ai_extracted" });
        drafts.push(withTurnMetadata({ ...recoveryPayloadFromDraft(draft), description: item.description }, item));
        summaryParts.push(rating != null ? `Mood: ${rating}/5` : "Mood: value needed");
      } else {
        const raw = await callAI(ctx, userId, [{
          role: "user",
          content: `Extract step count from: "${item.description}". Return ONLY a number.`,
        }], 15, settingsModel, apiKey);
        const parsedCount = parseInt(raw.replace(/[^0-9]/g, ""), 10);
        const count = Number.isFinite(parsedCount) ? parsedCount : undefined;
        const draft = buildRecoveryDraft({ kind: "steps", date: item.date ?? today, count, source: "ai_extracted" });
        drafts.push(withTurnMetadata({ ...recoveryPayloadFromDraft(draft), description: item.description }, item));
        summaryParts.push(count != null ? `Steps: ${count.toLocaleString()}` : "Steps: value needed");
      }
    } catch (error) {
      failedItems.push({
        kind: item.type,
        code: "PARSE_FAILED",
        description: item.description,
        reason: getConvexErrorMessage(error) ?? (error instanceof Error ? error.message : String(error)),
      });
    }
  }

  return { drafts, summaryParts, failedItems };
}

type TurnCandidate = {
  actionType: "meal" | "workout" | "recovery";
  description: string;
  payload: any;
  confidence?: number;
  resolvedDate?: string;
  resolvedTime?: string;
  provenance: "user_reported" | "ai_extracted" | "ai_estimated" | "database_match";
  validation: { status: "valid" | "warning" | "error"; messages: string[] };
  macros?: ConfirmationMacroData;
  reason?: string;
  ordinal: number;
};

function turnCandidateFromDraft(draft: any, ordinal: number): TurnCandidate {
  if (draft.kind === "meal") {
    const canonicalDraft = draft.ingredientBreakdown as MealDraft;
    const messages = [
      ...(canonicalDraft?.unresolved ?? []).map((name) => `Ambiguous food: ${name}`),
      ...(draft.parseError ? [String(draft.parseError)] : []),
      ...(draft._turnValidation?.messages ?? []),
    ];
    const validation = {
      status: draft._turnValidation?.status === "error"
        ? "error" as const
        : messages.length > 0 || draft._turnValidation?.status === "warning"
          ? "warning" as const
          : "valid" as const,
      messages,
    };
    const confidence = typeof draft._turnConfidence === "number"
      ? draft._turnConfidence
      : typeof draft.confidence === "number"
        ? draft.confidence
        : canonicalDraft?.confidence;
    const canonicalPayload = mealPayloadFromDraft(canonicalDraft, {
      aiSuggestion: draft.aiSuggestion,
      mealType: draft.mealType,
      components: draft.components,
      logSource: "chat",
    });
    const payload = {
      ...canonicalPayload,
      name: String(draft.description ?? draft.name ?? canonicalPayload.name ?? "Meal"),
      calories: typeof draft.kcal === "number" ? draft.kcal : canonicalPayload.calories,
      protein: typeof draft.protein === "number" ? draft.protein : canonicalPayload.protein,
      carbs: typeof draft.carbs === "number" ? draft.carbs : canonicalPayload.carbs,
      fat: typeof draft.fat === "number" ? draft.fat : canonicalPayload.fat,
      nutritionSource: draft.nutritionSource ?? canonicalPayload.nutritionSource,
    };
    const macros = [payload.calories, payload.protein, payload.carbs, payload.fat].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
      ? {
          calories: payload.calories,
          protein: payload.protein,
          carbs: payload.carbs,
          fat: payload.fat,
          ...(draft.nutritionSource === "macro_conflict"
            ? {
                reported: {
                  calories: payload.calories,
                  protein: payload.protein,
                  carbs: payload.carbs,
                  fat: payload.fat,
                },
              }
            : {}),
          ...(draft.engineEstimate
            ? {
                estimate: {
                  calories: draft.engineEstimate.kcal,
                  protein: draft.engineEstimate.protein,
                  carbs: draft.engineEstimate.carbs,
                  fat: draft.engineEstimate.fat,
                },
              }
            : {}),
          ...(draft.nutritionSource === "macro_conflict" ? { conflict: true } : {}),
        }
      : undefined;
    return {
      actionType: "meal",
      description: String(draft._turnDescription ?? draft.description ?? draft.name ?? "Meal"),
      payload,
      confidence,
      resolvedDate: draft.date,
      resolvedTime: draft.time,
      provenance: draft.nutritionSource === "database" || draft.nutritionSource === "memory"
        ? "database_match"
        : "ai_extracted",
      validation,
      macros,
      reason: draft._turnDateUnresolved
        ? draft._turnQuestion ?? "Which exact date should I use?"
        : validation.status !== "valid"
        ? "The meal needs confirmation before saving"
        : isConfidenceLow(confidence)
          ? `Confidence (${confidence!.toFixed(2)}) is below the auto-write threshold`
          : undefined,
      ordinal,
    };
  }

  if (draft.kind === "workout") {
    const reportedCalories = typeof draft.reportedCalories === "number"
      ? draft.reportedCalories
      : draft.calorieSource === "reported" && typeof draft.kcal === "number"
        ? draft.kcal
        : undefined;
    const estimatedCalories = typeof draft.estimatedCalories === "number"
      ? draft.estimatedCalories
      : reportedCalories == null && typeof draft.kcal === "number" && draft.kcal > 0
        ? draft.kcal
        : undefined;
    const time = typeof draft.time === "string" ? draft.time : new Date().toTimeString().slice(0, 5);
    const validationMessages = [
      ...(draft.parseError ? [String(draft.parseError)] : []),
      ...(draft._turnValidation?.messages ?? []),
    ];
    const validation = {
      status: draft._turnValidation?.status === "error"
        ? "error" as const
        : validationMessages.length > 0 || draft._turnValidation?.status === "warning"
          ? "warning" as const
          : "valid" as const,
      messages: validationMessages,
    };
    const confidence = typeof draft._turnConfidence === "number"
      ? draft._turnConfidence
      : typeof draft.confidence === "number"
        ? draft.confidence
        : draft.calorieResult?.confidence;
    return {
      actionType: "workout",
      description: String(draft._turnDescription ?? draft.description ?? draft.name ?? "Workout"),
      payload: {
        name: String(draft.description ?? draft.name ?? "Workout"),
        sets: String(draft.sets ?? "1"),
        duration: String(draft.duration ?? ""),
        intensity: String(draft.intensity ?? "MEDIUM").toUpperCase(),
        date: draft.date,
        timestamp: time,
        exercises: draft.exercises,
        rationale: draft.rationale,
        caloriesBurned: typeof draft.kcal === "number" && draft.kcal > 0 ? draft.kcal : undefined,
        reportedCalories,
        estimatedCalories,
        calorieSource: reportedCalories != null ? "reported" : estimatedCalories != null ? "estimated" : undefined,
        calorieConfidence: draft.calorieResult?.confidence,
        calorieRangeLow: draft.calorieResult?.range_low,
        calorieRangeHigh: draft.calorieResult?.range_high,
        calorieEstimateRough: draft.calorieResult?.rough,
        calorieBreakdown: draft.calorieResult?.breakdown ? JSON.stringify(draft.calorieResult.breakdown) : undefined,
        calculationVersion: draft.calorieResult ? 1 : undefined,
        structuredSets: draft.exercises ? JSON.stringify(draft.exercises) : undefined,
        logSource: "chat",
      },
      confidence,
      resolvedDate: draft.date,
      resolvedTime: time,
      provenance: reportedCalories != null ? "user_reported" : "ai_extracted",
      validation,
      reason: draft._turnDateUnresolved
        ? draft._turnQuestion ?? "Which exact date should I use?"
        : validation.status !== "valid"
        ? "Please confirm the workout details before saving"
        : isConfidenceLow(confidence)
          ? `Confidence (${confidence!.toFixed(2)}) is below the auto-write threshold`
          : undefined,
      ordinal,
    };
  }

  const recoveryDraft = buildRecoveryDraft({ ...draft, source: "ai_extracted" });
  const payload = recoveryPayloadFromDraft(recoveryDraft);
  const validationMessages = [
    ...recoveryDraft.unresolved.map((field) => `${field} needs clarification`),
    ...(draft._turnValidation?.messages ?? []),
  ];
  const validation = {
    status: draft._turnValidation?.status === "error"
      ? "error" as const
      : validationMessages.length > 0 || draft._turnValidation?.status === "warning"
        ? "warning" as const
        : "valid" as const,
    messages: validationMessages,
  };
  return {
    actionType: "recovery",
    description: String(draft._turnDescription ?? draft.description ?? `${draft.kind} entry`),
    payload,
    confidence: typeof draft._turnConfidence === "number" ? draft._turnConfidence : recoveryDraft.confidence,
    resolvedDate: recoveryDraft.date,
    resolvedTime: recoveryDraft.time,
    provenance: "ai_extracted",
    validation,
    reason: draft._turnDateUnresolved
      ? draft._turnQuestion ?? "Which exact date should I use?"
      : validation.status !== "valid"
        ? "Please clarify the missing details before saving"
        : undefined,
    ordinal,
  };
}

type TurnPolicyResult = {
  outcome: ChatTurnOutcome;
  cards: ChatTurnCard[];
  groupId?: Id<"actionGroups">;
  actionIds: Id<"actions">[];
  loggedItems: any[];
  memoryApprovals: any[];
  confirmation?: {
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
  };
  clarification?: { groupId: string; items: any[]; question: string };
};

function turnMember(
  groupKey: string,
  candidate: TurnCandidate,
) {
  return {
    ...markerMember(
      groupKey,
      candidate.actionType,
      candidate.payload,
      candidate.ordinal,
      candidate.confidence,
      candidate.validation,
      candidate.resolvedDate,
    ),
    resolvedTime: candidate.resolvedTime,
  };
}

async function executeTurnPolicy(input: {
  ctx: ActionCtx;
  userId: string;
  rawInput: string;
  clientSubmissionId?: string;
  today: string;
  model?: string;
  candidates: TurnCandidate[];
  parseFailures: FailedLogItem[];
  turnFailure?: StructuredExtraction["failure"];
  forceConfirmation: boolean;
}): Promise<TurnPolicyResult> {
  const {
    ctx, userId, rawInput, clientSubmissionId, today, model, candidates, parseFailures, turnFailure, forceConfirmation,
  } = input;
  const groupKey = deriveGroupKey({ userId, sourceSurface: "chat", rawInput, clientSubmissionId });
  const groupInput = {
    userId,
    groupIdempotencyKey: groupKey,
    clientSubmissionId,
    sourceSurface: "chat" as const,
    rawInput,
    model,
    clientLocalDate: today,
  };
  const loggedItems: any[] = [];
  const memoryApprovals: any[] = [];
  const writeErrors = new Map<number, { message: string; code?: string }>();

  let groupId: Id<"actionGroups"> | undefined;
  if (candidates.length > 0) {
    const staged: { groupId: Id<"actionGroups"> } = await ctx.runMutation(internal.ai.stageClarificationGroup, {
      userId,
      groupIdempotencyKey: groupKey,
      sourceSurface: "chat",
      rawInput,
      model,
      clientLocalDate: today,
      createdAt: Date.now(),
      members: candidates.map((candidate) => ({
        ...turnMember(groupKey, candidate),
        actionType: candidate.actionType,
        ordinal: candidate.ordinal,
      })),
    });
    groupId = staged.groupId;
  } else if (parseFailures.length > 0 || turnFailure) {
    const failedGroup: { groupId: Id<"actionGroups"> } = await ctx.runMutation(internal.ai.recordFailedTurnGroup, {
      userId,
      groupIdempotencyKey: groupKey,
      rawInput,
      model,
      clientLocalDate: today,
      createdAt: Date.now(),
    });
    groupId = failedGroup.groupId;
  }

  const confirmAll = forceConfirmation || candidates.length > AUTO_WRITE_MAX_ACTIONS;
  if (groupId && !confirmAll) {
    for (const candidate of candidates.filter((item) => !item.reason)) {
      const member = turnMember(groupKey, candidate);
      try {
        let rowId: string;
        let previous: unknown;
        if (candidate.actionType === "meal") {
          rowId = String(await ctx.runMutation((internal as any).actions_writer.writeMealAction, { group: groupInput, member }));
        } else if (candidate.actionType === "workout") {
          rowId = String(await ctx.runMutation((internal as any).actions_writer.writeWorkoutAction, { group: groupInput, member }));
        } else {
          const result = await ctx.runMutation((internal as any).actions_writer.writeRecoveryAction, { group: groupInput, member });
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
      } catch (error) {
        const message = getConvexErrorMessage(error) ?? (error instanceof Error ? error.message : String(error));
        const code = getConvexErrorCode(error);
        writeErrors.set(candidate.ordinal, { message, code });
        const members: any[] = await ctx.runQuery(internal.ai.getPendingMembersForClarification, { groupId });
        const action = members.find((item) => confirmationOrdinal(item) === candidate.ordinal);
        if (action) {
          await ctx.runMutation(internal.ai.recordConfirmationMemberFailure, { actionId: action._id, error: message });
        }
      }
    }
    await finalizeActionGroup(ctx, String(groupId));
  }

  const actions: Doc<"actions">[] = groupId
    ? await ctx.runQuery(internal.ai.getPendingMembersForClarification, { groupId })
    : [];
  const actionsByOrdinal = new Map(actions.map((action) => [confirmationOrdinal(action), action]));
  const actionIds = actions.map((action) => action._id);
  const committedItems = candidates.flatMap((candidate) => {
    const action = actionsByOrdinal.get(candidate.ordinal);
    if (!action || action.status !== "committed" || !action.committedRowRef) return [];
    return [{
      ordinal: candidate.ordinal,
      actionType: candidate.actionType,
      title: candidate.description,
      description: candidate.description,
      date: candidate.resolvedDate,
      time: candidate.resolvedTime,
      status: "committed" as const,
      actionId: String(action._id),
      record: action.committedRowRef,
    }];
  });
  const failedResultItems = [
    ...candidates.flatMap((candidate) => {
      const action = actionsByOrdinal.get(candidate.ordinal);
      const error = writeErrors.get(candidate.ordinal);
      if (!error && action?.status !== "failed") return [];
      return [{
        ordinal: candidate.ordinal,
        actionType: candidate.actionType,
        title: candidate.description,
        description: candidate.description,
        date: candidate.resolvedDate,
        time: candidate.resolvedTime,
        status: "failed" as const,
        ...(action ? { actionId: String(action._id) } : {}),
        reason: error?.message ?? action?.validation.messages.at(-1) ?? "The item could not be saved",
        retriable: true,
      }];
    }),
    ...parseFailures.map((failure, index) => ({
      ordinal: candidates.length + index,
      actionType: failure.kind === "meal" || failure.kind === "workout" ? failure.kind : "recovery" as const,
      title: failure.description,
      description: failure.description,
      status: "failed" as const,
      reason: "reason" in failure ? failure.reason : failure.code,
      retriable: true,
    })),
  ];
  const pendingCandidates = candidates.filter((candidate) => {
    const action = actionsByOrdinal.get(candidate.ordinal);
    return action?.status === "pending";
  });
  const cards: ChatTurnCard[] = [];
  let confirmation: TurnPolicyResult["confirmation"];
  let clarification: TurnPolicyResult["clarification"];

  if (groupId && pendingCandidates.length > 0) {
    if (confirmAll) {
      cards.push({
        version: 1,
        kind: "confirmation",
        data: {
          groupId: String(groupId),
          expiresAt: Date.now() + CONFIRMATION_TTL_MS,
          items: pendingCandidates.map((candidate) => ({
            ordinal: candidate.ordinal,
            actionType: candidate.actionType,
            title: candidate.description,
            description: candidate.description,
            date: candidate.resolvedDate,
            time: candidate.resolvedTime,
            ...(candidate.macros ? { macros: candidate.macros } : {}),
            actionId: String(actionsByOrdinal.get(candidate.ordinal)!._id),
            confidence: candidate.confidence,
            validationMessages: candidate.validation.messages,
          })),
        },
      });
      confirmation = {
        groupId: String(groupId),
        items: pendingCandidates.map((candidate) => ({
          actionType: candidate.actionType,
          description: candidate.description,
          resolvedDate: candidate.resolvedDate,
          confidence: candidate.confidence,
          provenance: candidate.provenance,
          validation: candidate.validation,
          ordinal: candidate.ordinal,
        })),
      };
    } else {
      const prompt = [...new Set(pendingCandidates.map((candidate) => candidate.reason).filter(Boolean))].join(" ")
        || "Please confirm or clarify the highlighted details so I can save them.";
      cards.push({
        version: 1,
        kind: "clarification",
        data: {
          groupId: String(groupId),
          prompt,
          items: pendingCandidates.map((candidate) => ({
            ordinal: candidate.ordinal,
            actionType: candidate.actionType,
            title: candidate.description,
            description: candidate.description,
            date: candidate.resolvedDate,
            time: candidate.resolvedTime,
            actionId: String(actionsByOrdinal.get(candidate.ordinal)!._id),
            reason: candidate.reason ?? "Confirmation is required",
          })),
        },
      });
      clarification = {
        groupId: String(groupId),
        items: pendingCandidates.map((candidate) => ({
          actionType: candidate.actionType,
          description: candidate.description,
          reason: candidate.reason ?? "Confirmation is required",
          resolvedDate: candidate.resolvedDate,
          confidence: candidate.confidence,
        })),
        question: prompt,
      };
    }
  }

  const duplicateItems = candidates.flatMap((candidate) => {
    const error = writeErrors.get(candidate.ordinal);
    const action = actionsByOrdinal.get(candidate.ordinal);
    if (error?.code !== "NEAR_DUPLICATE" || !action) return [];
    return [{
      ordinal: candidate.ordinal,
      actionType: candidate.actionType,
      title: candidate.description,
      description: candidate.description,
      date: candidate.resolvedDate,
      time: candidate.resolvedTime,
      actionId: String(action._id),
      reason: error.message,
    }];
  });
  if (groupId && duplicateItems.length > 0) {
    cards.push({ version: 1, kind: "duplicate", data: { groupId: String(groupId), items: duplicateItems } });
  }
  if (groupId && committedItems.length > 0) {
    cards.push({
      version: 1,
      kind: "result",
      data: { groupId: String(groupId), items: [...committedItems, ...failedResultItems] },
    });
  } else if (failedResultItems.length > 0) {
    cards.push({
      version: 1,
      kind: "failure",
      data: {
        ...(groupId ? { groupId: String(groupId) } : {}),
        code: "TURN_FAILED",
        message: "No items were saved.",
        retriable: true,
        items: failedResultItems.map(({ status: _status, retriable: _retriable, ...item }) => item),
      },
    });
  }
  if (turnFailure) {
    cards.push({
      version: 1,
      kind: "failure",
      data: {
        ...(groupId ? { groupId: String(groupId) } : {}),
        code: turnFailure.code,
        message: turnFailure.message,
        retriable: turnFailure.retriable,
        items: [],
      },
    });
  }
  if (groupId && committedItems.length > 0) {
    cards.push({
      version: 1,
      kind: "undo",
      data: {
        groupId: String(groupId),
        items: committedItems.map(({ status: _status, ...item }) => ({ ...item, state: "available" as const })),
      },
    });
  }

  const outcome: ChatTurnOutcome = pendingCandidates.length > 0
    ? "confirmation_required"
    : committedItems.length > 0
      ? "committed"
      : failedResultItems.length > 0 || turnFailure
        ? "failed"
        : "no_action";
  return {
    outcome,
    cards,
    groupId,
    actionIds,
    loggedItems,
    memoryApprovals,
    confirmation,
    clarification,
  };
}

function sanitizeConversationalReply(reply: string): string {
  return reply
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !(
      /\b(?:i(?:'ve|\s+have)?\s+)?(?:logged|saved|recorded|added)\b/i.test(sentence)
      || /\b(?:done|all set|taken care of)\b/i.test(sentence)
      || /\b(?:in|into)\s+(?:your|the)\s+(?:diary|log|tracker|records?)\b/i.test(sentence)
      || /\b(?:put|got|entered)\s+(?:it|that|this|those|them)?\s*(?:in|into|down)\b/i.test(sentence)
      || /\bupdated\s+(?:your|the)\s+(?:diary|log|tracker|records?)\b/i.test(sentence)
    ))
    .join(" ")
    .trim();
}

function turnOutcomeText(result: TurnPolicyResult): string {
  const resultCard = result.cards.find((card) => card.kind === "result");
  const committed = resultCard?.kind === "result"
    ? resultCard.data.items.filter((item) => item.status === "committed")
    : [];
  const failed = resultCard?.kind === "result"
    ? resultCard.data.items.filter((item) => item.status === "failed")
    : [];
  if (result.outcome === "confirmation_required") {
    return result.confirmation
      ? `I found ${result.confirmation.items.length} item${result.confirmation.items.length === 1 ? "" : "s"}. Review before saving.`
      : result.clarification?.question ?? "Please confirm the details before I save this.";
  }
  if (result.outcome === "committed") {
    const savedText = `Saved ${committed.map((item) => item.title).join(", ")}.`;
    return failed.length > 0
      ? `${savedText} I couldn't save ${failed.map((item) => item.title).join(", ")}.`
      : savedText;
  }
  if (result.outcome === "failed") return "I couldn't save that. Please try again.";
  return "";
}

export const homepageInput = action({
  args: {
    message: v.string(),
    image: v.optional(v.string()),
    today: v.optional(v.string()),
    sessionId: v.optional(v.id("chat_sessions")),
    clientSubmissionId: v.optional(v.string()),
  },
  handler: async (ctx, { message, image, today: todayArg, sessionId, clientSubmissionId }): Promise<{
    drafts: any[];
    tier1Summary: string;
    tier2Detail: string;
    isQuestion: boolean;
    actions?: any[];
    reply?: string;
    coachType?: CoachType;
    sessionId?: any;
    messageId?: string;
    restricted?: boolean;
    failedItems: FailedLogItem[];
    outcome?: ChatTurnOutcome;
    cards?: ChatTurnCard[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertMaxChars(message, AI_INPUT_LIMITS.messageChars, "homepage message");
    if (image) assertImageDataUrl(image, "homepage image");
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
      clientSubmissionId,
    });

    // Phase 5: MemoryAgent — fire-and-forget fact extraction (does not block response)
    ctx.runAction(internal.agents.runMemoryAgentAction, {
      userId, message, today,
      model: settings?.openRouterModel ?? undefined,
      apiKey: settings?.openRouterKey ?? undefined,
    }).catch(() => {});

    const history = await ctx.runQuery(internal.chat.getMessagesForContext, {
      userId,
      sessionId: activeSessionId,
    }) as HomepageHistoryEntry[];
    const trimmedHistory = trimHomepageHistory(history);
    assertHistoryEntries(trimmedHistory);

    // Heuristic pre-check
    const estimateMode = looksLikeFoodEstimate(message);
    const userMacros = extractUserMacros(message);
    const homepageIntent = classifyHomepageIntent(message);
    const heuristicSaysLog = !!image || homepageIntent === "log_report" || looksLikeLog(message) || estimateMode;

    const extraction = await extractStructuredLogItems({
      ctx,
      userId,
      message,
      image,
      today,
      history: trimmedHistory,
      model: intentModel,
      visionModel,
      apiKey,
    });
    let extracted = {
      isQuestion: extraction.isQuestion,
      items: extraction.items,
    };
    const submissionRawInput = image ? `${message}\n[image:${stableHash(image)}]` : message;

    if (extraction.failure) {
      const turnResult = await executeTurnPolicy({
        ctx,
        userId,
        rawInput: submissionRawInput,
        clientSubmissionId,
        today,
        model: intentModel,
        candidates: [],
        parseFailures: [],
        turnFailure: extraction.failure,
        forceConfirmation: false,
      });
      const reply = turnOutcomeText(turnResult);
      const messageId = await ctx.runMutation(internal.chat.addMessage, {
        userId,
        sessionId: activeSessionId,
        role: "ai",
        content: reply,
        clientSubmissionId,
        turnContractVersion: 1,
        turnOutcome: turnResult.outcome,
        turnCards: turnResult.cards,
        actionGroupId: turnResult.groupId,
        actionIds: turnResult.actionIds,
      });
      return {
        drafts: [],
        tier1Summary: "",
        tier2Detail: "",
        isQuestion: false,
        reply,
        coachType: "overall",
        sessionId: activeSessionId,
        messageId,
        restricted: restrictedGuidance,
        failedItems: [],
        outcome: turnResult.outcome,
        cards: turnResult.cards,
      };
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
      const [todayMealsList, todayWorkoutsList, profile, topMemories, lastSleepQ, patternsQ, topRecipesQ, topWkMemQ, behaviorQ, settingsQ, userIngredientsQ, checkInAnswersQ] = await Promise.all([
        ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
        ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
        ctx.runQuery(internal.profile.getProfileForContext, { userId }),
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
      const rawReply = await callAI(ctx, userId, replyMessages, 250, image ? visionModel : (settingsModel ?? CHAT_MODEL), apiKey);
      const reply = sanitizeConversationalReply(rawReply) || "How can I help with that?";

      // Persist AI reply
      const messageId = await ctx.runMutation(internal.chat.addMessage, {
        userId,
        sessionId: activeSessionId,
        role: "ai",
        content: reply,
        clientSubmissionId,
        turnContractVersion: 1,
        turnOutcome: "no_action",
        turnCards: [],
        actionIds: [],
      });

      return {
        drafts: [],
        tier1Summary: "",
        tier2Detail: "",
        isQuestion: true,
        reply,
        coachType,
        sessionId: activeSessionId,
        messageId,
        restricted: restrictedGuidance,
        failedItems: [],
        outcome: "no_action",
        cards: [],
      };
    }

    const parsedTurn = await parseStructuredLogItems({
      ctx,
      userId,
      items: extracted.items,
      image,
      today,
      settingsModel,
      visionModel,
      apiKey,
      userMacros,
    });
    const { drafts, summaryParts, failedItems } = parsedTurn;
    const skippedPlaceholderMeals = failedItems.filter((item) => item.kind === "meal").length;

    if (drafts.length === 0) {
      const turnResult = await executeTurnPolicy({
        ctx,
        userId,
        rawInput: submissionRawInput,
        clientSubmissionId,
        today,
        model: settingsModel,
        candidates: [],
        parseFailures: failedItems,
        forceConfirmation: false,
      });
      const reply = turnResult.outcome === "failed"
        ? turnOutcomeText(turnResult)
        : skippedPlaceholderMeals > 0
          ? `I couldn't catch the details for ${skippedPlaceholderMeals === 1 ? "that meal" : `${skippedPlaceholderMeals} of those meals`}. Could you describe ${skippedPlaceholderMeals === 1 ? "it" : "them"} again?`
          : "I couldn't parse that. Could you be more specific?";
      const messageId = await ctx.runMutation(internal.chat.addMessage, {
        userId,
        sessionId: activeSessionId,
        role: "ai",
        content: reply,
        clientSubmissionId,
        turnContractVersion: 1,
        turnOutcome: turnResult.outcome,
        turnCards: turnResult.cards,
        actionGroupId: turnResult.groupId,
        actionIds: turnResult.actionIds,
      });
      return {
        drafts: [],
        tier1Summary: "",
        tier2Detail: "",
        isQuestion: turnResult.outcome === "no_action",
        reply,
        coachType: "overall",
        sessionId: activeSessionId,
        messageId,
        restricted: restrictedGuidance,
        failedItems,
        outcome: turnResult.outcome,
        cards: turnResult.cards,
      };
    }

    // If any draft has a date != today, mention it in the summary
    const nonTodayDates = [...new Set(drafts.map((d) => d.date).filter((d) => d && d !== today))];
    const dateNote = nonTodayDates.length > 0 ? ` (for ${nonTodayDates.join(", ")})` : "";
    const skippedNote = skippedPlaceholderMeals > 0
      ? ` I couldn't catch the details for ${skippedPlaceholderMeals === 1 ? "1 meal" : `${skippedPlaceholderMeals} meals`}; please describe ${skippedPlaceholderMeals === 1 ? "it" : "them"} again.`
      : "";
    const candidates = drafts.map(turnCandidateFromDraft);
    const homeAutoCommitEnabled = process.env.HOME_CHAT_AUTO_COMMIT === "true";
    const turnResult = await executeTurnPolicy({
      ctx,
      userId,
      rawInput: submissionRawInput,
      clientSubmissionId,
      today,
      model: settingsModel,
      candidates,
      parseFailures: failedItems,
      forceConfirmation: !homeAutoCommitEnabled,
    });
    const tier1Summary = `${summaryParts.join(" · ")}${dateNote}. ${turnOutcomeText(turnResult)}${skippedNote}`.trim();

    // Report turns persist only deterministic text derived from the outcome.
    // Model prose is intentionally not mixed into this status-bearing reply.
    const tier2Detail = "";
    const persistedReply = tier1Summary;
    const messageId = await ctx.runMutation(internal.chat.addMessage, {
      userId,
      sessionId: activeSessionId,
      role: "ai",
      content: persistedReply,
      clientSubmissionId,
      turnContractVersion: 1,
      turnOutcome: turnResult.outcome,
      turnCards: turnResult.cards,
      actionGroupId: turnResult.groupId,
      actionIds: turnResult.actionIds,
    });

    return {
      drafts,
      tier1Summary,
      tier2Detail,
      isQuestion: false,
      sessionId: activeSessionId,
      messageId,
      restricted: restrictedGuidance,
      failedItems,
      outcome: turnResult.outcome,
      cards: turnResult.cards,
    };
  },
});

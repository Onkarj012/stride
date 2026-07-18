import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  actionProvenanceValidator,
  actionSourceSurfaceValidator,
  actionValidationValidator,
  buildActionMembers,
  assertTransition,
  assertValidActionEnvelope,
  type ActionType,
} from "./actions_envelope";
import {
  deriveGroupKey,
  deriveMemberKey,
  deriveSubmissionFingerprint,
  ensureGroup,
  ensureMember,
} from "./actions_idempotency";
import {
  assertInRange,
  assertValidDate,
  PROFILE_WEIGHT_KG_MAX,
  PROFILE_WEIGHT_KG_MIN,
  stableHash,
} from "./validation";
import { writeMealDomain } from "./meals";
import { writeWorkoutDomain } from "./workouts";
import { writeRecoveryDomain, writeWeightDomain } from "./wellness";
import { buildRecoveryDraft, recoveryPayloadFromDraft } from "./recovery_draft";
import { recomputeForAction } from "./derived_state";
import { insertActionTelemetry } from "./telemetry";

const groupValidator = v.object({
  userId: v.string(),
  groupIdempotencyKey: v.optional(v.string()),
  clientSubmissionId: v.optional(v.string()),
  sourceSurface: actionSourceSurfaceValidator,
  rawInput: v.string(),
  model: v.optional(v.string()),
  clientLocalDate: v.optional(v.string()),
  clientLocalTime: v.optional(v.string()),
  clientTimeZone: v.optional(v.string()),
  createdAt: v.optional(v.number()),
});

const memberValidator = v.object({
  memberIdempotencyKey: v.optional(v.string()),
  payload: v.any(),
  provenance: actionProvenanceValidator,
  confidence: v.optional(v.number()),
  validation: actionValidationValidator,
  reversible: v.boolean(),
  resolvedDate: v.optional(v.string()),
  resolvedTime: v.optional(v.string()),
});

type WriterArgs = {
  group: {
    userId: string;
    groupIdempotencyKey?: string;
    clientSubmissionId?: string;
    sourceSurface: "chat" | "quick_log" | "barcode" | "recipe" | "checkin" | "direct_ui" | "mobile";
    rawInput: string;
    model?: string;
    clientLocalDate?: string;
    clientLocalTime?: string;
    clientTimeZone?: string;
    createdAt?: number;
  };
  member: {
    memberIdempotencyKey?: string;
    payload: any;
    provenance: "user_reported" | "ai_extracted" | "ai_estimated" | "database_match";
    confidence?: number;
    validation: { status: "valid" | "warning" | "error"; messages: string[] };
    reversible: boolean;
    resolvedDate?: string;
    resolvedTime?: string;
  };
};

async function prepareMember(ctx: MutationCtx, actionType: ActionType, args: WriterArgs) {
  const groupIdempotencyKey = args.group.groupIdempotencyKey ?? deriveGroupKey({
    userId: args.group.userId,
    sourceSurface: args.group.sourceSurface,
    rawInput: args.group.rawInput,
    clientSubmissionId: args.group.clientSubmissionId,
  });
  const groupResult = await ensureGroup(ctx, {
    userId: args.group.userId,
    groupIdempotencyKey,
    sourceSurface: args.group.sourceSurface,
    rawInput: args.group.rawInput,
    model: args.group.model,
    clientLocalDate: args.group.clientLocalDate,
    clientLocalTime: args.group.clientLocalTime,
    clientTimeZone: args.group.clientTimeZone,
    createdAt: args.group.createdAt ?? Date.now(),
    submissionFingerprint: deriveSubmissionFingerprint({
      userId: args.group.userId,
      sourceSurface: args.group.sourceSurface,
      rawInput: args.group.rawInput,
      clientLocalDate: args.group.clientLocalDate,
      clientLocalTime: args.group.clientLocalTime,
      clientTimeZone: args.group.clientTimeZone,
    }),
  });
  const memberIdempotencyKey = args.member.memberIdempotencyKey ?? deriveMemberKey({
    groupKey: groupIdempotencyKey,
    actionType,
    payloadFingerprint: stableHash(JSON.stringify(args.member.payload)),
    ordinal: 0,
  });
  const member = buildActionMembers({
    groupId: groupResult.group._id,
    userId: args.group.userId,
    candidates: [{
      actionType,
      memberIdempotencyKey,
      payload: args.member.payload,
      provenance: args.member.provenance,
      confidence: args.member.confidence,
      validation: args.member.validation,
      reversible: args.member.reversible,
      resolvedDate: args.member.resolvedDate,
      resolvedTime: args.member.resolvedTime,
    }],
  })[0];
  assertValidActionEnvelope(member);
  if (["committed", "discarded", "expired"].includes(groupResult.group.status)) {
    const existingMember = groupResult.members.find((candidate) => candidate.memberIdempotencyKey === member.memberIdempotencyKey);
    if (!existingMember) throw new Error("Cannot add an action member to a terminal action group");
  }
  const ensured = await ensureMember(ctx, member);
  if (!ensured.shouldExecute) {
    if (ensured.state === "already_committed" || ensured.state === "already_terminal") {
      await ctx.db.patch(ensured.member._id, { retryCount: ((ensured.member as any).retryCount ?? 0) + 1 });
      const retried = await ctx.db.get(ensured.member._id);
      return { group: groupResult.group, member: retried ?? ensured.member, shouldExecute: false, state: ensured.state, rowId: ensured.member.committedRowRef?.id };
    }
    return { group: groupResult.group, member: ensured.member, shouldExecute: false, state: ensured.state, rowId: ensured.member.committedRowRef?.id };
  }
  if (ensured.state === "reexecute") {
    if (ensured.member.status === "failed") assertTransition(ensured.member.status, "pending");
    await ctx.db.patch(ensured.member._id, {
      ...member,
      status: "pending",
      retryCount: ((ensured.member as any).retryCount ?? 0) + 1,
      // Confirmation edits change the executable payload, but never the
      // original extraction that is needed for audit and correction review.
      originalPayload: (ensured.member as any).originalPayload ?? ensured.member.payload,
    });
  }
  const committedMember = await ctx.db.get(ensured.member._id);
  if (!committedMember) throw new Error("Action member was not found after ensure");
  return { group: groupResult.group, member: committedMember, shouldExecute: true, state: ensured.state, rowId: undefined };
}

async function recordWriterTelemetry(ctx: MutationCtx, prepared: any, event: "committed" | "already_committed" | "failed", mutationResult: { ok: boolean; error?: string; code?: string }, derivedStateVersion?: number) {
  await insertActionTelemetry(ctx, {
    actionId: String(prepared.member._id),
    groupId: String(prepared.group._id),
    userId: prepared.group.userId,
    actionType: prepared.member.actionType,
    event,
    sourceSurface: prepared.group.sourceSurface,
    model: prepared.group.model,
    retryCount: prepared.member.retryCount ?? 0,
    validationStatus: prepared.member.validation?.status,
    confidence: prepared.member.confidence,
    provenance: prepared.member.provenance,
    mutationResult,
    derivedStateVersion,
  });
}

async function commitMember(ctx: MutationCtx, prepared: any, table: string, id: any, undoMetadata?: Record<string, unknown>) {
  assertTransition(prepared.member.status, "committed");
  const userPayload = prepared.member.payload && typeof prepared.member.payload === "object"
    ? Object.fromEntries(Object.entries(prepared.member.payload).filter(([key]) => key !== "previous"))
    : prepared.member.payload;
  await ctx.db.patch(prepared.member._id, {
    status: "committed",
    committedRowRef: { table, id: String(id) },
    committedRowTable: table,
    committedRowId: String(id),
    originalPayload: prepared.member.originalPayload ?? prepared.member.payload,
    ...(undoMetadata ? { payload: { ...userPayload, ...undoMetadata } } : { payload: userPayload }),
  });
  // Member writers commit only the member. Group aggregate status is finalized
  // by the caller (chat, clarification, or confirmation) after all members.
  return id;
}

export const writeMealAction = internalMutation({
  args: { group: groupValidator, member: memberValidator },
  handler: async (ctx, args) => {
    const prepared = await prepareMember(ctx, "meal", args as WriterArgs);
    if (!prepared.shouldExecute) {
      if (prepared.state === "already_committed") await recordWriterTelemetry(ctx, prepared, "already_committed", { ok: true });
      return prepared.rowId;
    }
    const payload = prepared.member.payload as Record<string, any>;
    const id = await writeMealDomain(ctx, { ...payload, userId: prepared.group.userId }, {
      emitBehavior: true,
      emitGamification: true,
      recomputeDerived: false,
      sourceActionId: String(prepared.member._id),
    });
    const committedId = await commitMember(ctx, prepared, "meals", id);
    const derived = await recomputeForAction(ctx, { userId: prepared.group.userId, actionType: "meal", date: payload.date ?? prepared.member.resolvedDate });
    await recordWriterTelemetry(ctx, prepared, "committed", { ok: true }, derived.derivedStateVersion);
    return committedId;
  },
});

export const writeWorkoutAction = internalMutation({
  args: { group: groupValidator, member: memberValidator },
  handler: async (ctx, args) => {
    const prepared = await prepareMember(ctx, "workout", args as WriterArgs);
    if (!prepared.shouldExecute) {
      if (prepared.state === "already_committed") await recordWriterTelemetry(ctx, prepared, "already_committed", { ok: true });
      return prepared.rowId;
    }
    const payload = prepared.member.payload as Record<string, any>;
    const id = await writeWorkoutDomain(ctx, { ...payload, userId: prepared.group.userId }, {
      emitBehavior: true,
      emitGamification: true,
      recomputeDerived: false,
      sourceActionId: String(prepared.member._id),
    });
    const committedId = await commitMember(ctx, prepared, "workouts", id);
    const derived = await recomputeForAction(ctx, { userId: prepared.group.userId, actionType: "workout", date: payload.date ?? prepared.member.resolvedDate });
    await recordWriterTelemetry(ctx, prepared, "committed", { ok: true }, derived.derivedStateVersion);
    return committedId;
  },
});

export const writeRecoveryAction = internalMutation({
  args: { group: groupValidator, member: memberValidator },
  handler: async (ctx, args) => {
    const prepared = await prepareMember(ctx, "recovery", args as WriterArgs);
    if (!prepared.shouldExecute) {
      if (prepared.state === "already_committed") await recordWriterTelemetry(ctx, prepared, "already_committed", { ok: true });
      return prepared.rowId ? { id: prepared.rowId } : prepared.rowId;
    }
    const payload = prepared.member.payload as Record<string, any>;
    if (payload.kind === "weight") {
      const dateValue = payload.date ?? prepared.member.resolvedDate;
      if (typeof dateValue !== "string") throw new Error("weight date is required");
      const date = assertValidDate(dateValue);
      const weightKg = assertInRange("weightKg", payload.weightKg, PROFILE_WEIGHT_KG_MIN, PROFILE_WEIGHT_KG_MAX);
      const result = await writeWeightDomain(ctx, {
        userId: prepared.group.userId,
        date,
        weightKg,
        source: payload.source ?? "check_in",
        sourceActionId: String(prepared.member._id),
      });
      const committedId = await commitMember(ctx, prepared, "weight_logs", result.id, {
        ...(result.previous ? { previous: result.previous } : {}),
        previousProfile: result.previousProfile ?? null,
        weightKg,
      });
      const derived = await recomputeForAction(ctx, {
        userId: prepared.group.userId,
        actionType: "recovery",
        date,
      });
      await recordWriterTelemetry(ctx, prepared, "committed", { ok: true }, derived.derivedStateVersion);
      return { id: committedId, previous: result.previous };
    }
    const draft = buildRecoveryDraft({
      ...payload,
      date: payload.date ?? prepared.member.resolvedDate,
      source: payload.source ?? prepared.member.provenance,
      entryKind: payload.entryKind ?? payload.kind,
    });
    const canonicalPayload = {
      ...recoveryPayloadFromDraft(draft),
      ...(payload.mode ? { mode: payload.mode } : {}),
    };
    const result = await writeRecoveryDomain(ctx, {
      ...canonicalPayload,
      userId: prepared.group.userId,
      sourceActionId: String(prepared.member._id),
    }, {
      emitBehavior: true,
      recomputeDerived: false,
    });
    const table = draft.entryKind === "state" || draft.entryKind === "wellness" ? "sleep_logs" : `${draft.entryKind}_logs`;
    const undoMetadata: Record<string, unknown> = {};
    if (result.previous) undoMetadata.previous = result.previous;
    await commitMember(
      ctx,
      prepared,
      table,
      result.id,
      undoMetadata,
    );
    const derived = await recomputeForAction(ctx, {
      userId: prepared.group.userId,
      actionType: draft.entryKind === "state" ? "rest" : "recovery",
      date: draft.date,
    });
    await recordWriterTelemetry(ctx, prepared, "committed", { ok: true }, derived.derivedStateVersion);
    return result;
  },
});

export function writerGroupFor(input: Omit<WriterArgs["group"], "groupIdempotencyKey"> & { groupIdempotencyKey?: string }) {
  return input;
}

export type WriterGroupId = Id<"actionGroups">;

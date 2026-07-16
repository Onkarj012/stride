import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  actionProvenanceValidator,
  actionSourceSurfaceValidator,
  actionValidationValidator,
  buildActionMembers,
  assertValidActionEnvelope,
  type ActionType,
} from "./actions_envelope";
import {
  deriveGroupKey,
  deriveMemberKey,
  ensureGroup,
  ensureMember,
} from "./actions_idempotency";
import { stableHash } from "./validation";
import { writeMealDomain } from "./meals";
import { writeWorkoutDomain } from "./workouts";
import { writeRecoveryDomain } from "./wellness";
import { buildRecoveryDraft, recoveryPayloadFromDraft } from "./recovery_draft";

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

async function prepareMember(ctx: any, actionType: ActionType, args: WriterArgs) {
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
  const ensured = await ensureMember(ctx, member);
  if (!ensured.shouldExecute) {
    return { group: groupResult.group, member: ensured.member, shouldExecute: false, rowId: ensured.member.committedRowRef?.id };
  }
  if (ensured.state === "reexecute") await ctx.db.patch(ensured.member._id, member);
  const committedMember = await ctx.db.get(ensured.member._id);
  if (!committedMember) throw new Error("Action member was not found after ensure");
  return { group: groupResult.group, member: committedMember, shouldExecute: true, rowId: undefined };
}

async function commitMember(ctx: any, prepared: any, table: string, id: any, undoMetadata?: Record<string, unknown>) {
  await ctx.db.patch(prepared.member._id, {
    status: "committed",
    committedRowRef: { table, id: String(id) },
    ...(undoMetadata ? { payload: { ...prepared.member.payload, ...undoMetadata } } : {}),
  });
  await ctx.db.patch(prepared.group._id, { status: "committed", resolvedAt: Date.now() });
  return id;
}

export const writeMealAction = internalMutation({
  args: { group: groupValidator, member: memberValidator },
  handler: async (ctx, args) => {
    const prepared = await prepareMember(ctx, "meal", args as WriterArgs);
    if (!prepared.shouldExecute) return prepared.rowId;
    const payload = prepared.member.payload as Record<string, any>;
    const id = await writeMealDomain(ctx, { ...payload, userId: prepared.group.userId }, { emitBehavior: true, emitGamification: true });
    return commitMember(ctx, prepared, "meals", id);
  },
});

export const writeWorkoutAction = internalMutation({
  args: { group: groupValidator, member: memberValidator },
  handler: async (ctx, args) => {
    const prepared = await prepareMember(ctx, "workout", args as WriterArgs);
    if (!prepared.shouldExecute) return prepared.rowId;
    const payload = prepared.member.payload as Record<string, any>;
    const id = await writeWorkoutDomain(ctx, { ...payload, userId: prepared.group.userId }, { emitBehavior: true, emitGamification: true, emitCalibration: false });
    const committedId = await commitMember(ctx, prepared, "workouts", id);
    await ctx.runMutation(internal.calibration.incrementWorkoutCount, { userId: prepared.group.userId });
    return committedId;
  },
});

export const writeRecoveryAction = internalMutation({
  args: { group: groupValidator, member: memberValidator },
  handler: async (ctx, args) => {
    const prepared = await prepareMember(ctx, "recovery", args as WriterArgs);
    if (!prepared.shouldExecute) return prepared.rowId ? { id: prepared.rowId } : prepared.rowId;
    const payload = prepared.member.payload as Record<string, any>;
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
    const result = await writeRecoveryDomain(ctx, { ...canonicalPayload, userId: prepared.group.userId }, { emitBehavior: true });
    const table = draft.entryKind === "state" || draft.entryKind === "wellness" ? "sleep_logs" : `${draft.entryKind}_logs`;
    await commitMember(
      ctx,
      prepared,
      table,
      result.id,
      result.previous !== undefined ? { previous: result.previous } : undefined,
    );
    return result;
  },
});

export function writerGroupFor(input: Omit<WriterArgs["group"], "groupIdempotencyKey"> & { groupIdempotencyKey?: string }) {
  return input;
}

export type WriterGroupId = Id<"actionGroups">;

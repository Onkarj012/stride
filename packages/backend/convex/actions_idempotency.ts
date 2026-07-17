import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  buildActionGroup,
  assertTransition,
  type ActionEnvelope,
  type ActionGroup,
  type ActionGroupInput,
  type ActionGroupStatus,
  type ActionStatus,
} from "./actions_envelope";
import { stableHash } from "./validation";

export type ActionMemberInput = Omit<ActionEnvelope, "status"> & { status?: ActionStatus };

export type EnsureGroupResult = {
  state: "created" | "existing";
  group: Doc<"actionGroups">;
  members: Doc<"actions">[];
};

export type EnsureMemberResult = {
  state: "created" | "reexecute" | "already_committed" | "already_terminal";
  shouldExecute: boolean;
  member: Doc<"actions">;
};

function normalizedContent(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Immutable fingerprint of the group-level submission content. Used to detect
 * key collisions where the same client submission ID is reused with different
 * content.
 */
export function deriveSubmissionFingerprint(input: {
  userId: string;
  sourceSurface: ActionGroup["sourceSurface"];
  rawInput: string;
  clientLocalDate?: string;
  clientLocalTime?: string;
  clientTimeZone?: string;
}): string {
  return stableHash(
    JSON.stringify([
      input.userId.trim(),
      input.sourceSurface,
      input.rawInput,
      input.clientLocalDate ?? "",
      input.clientLocalTime ?? "",
      input.clientTimeZone ?? "",
    ]),
  );
}

/**
 * Client submission IDs are opaque retry identities; without one, the normalized input is the retry identity.
 */
export function deriveGroupKey(input: {
  userId: string;
  sourceSurface: ActionGroup["sourceSurface"];
  rawInput: string;
  clientSubmissionId?: string;
}): string {
  const clientSubmissionId = input.clientSubmissionId?.trim();
  const keyMaterial = clientSubmissionId
    ? ["client", input.userId.trim(), input.sourceSurface, clientSubmissionId]
    : ["content", input.userId.trim(), input.sourceSurface, normalizedContent(input.rawInput)];
  return `group_${stableHash(JSON.stringify(keyMaterial))}`;
}

/**
 * The legacy domain content hash belongs in payloadFingerprint; the member key owns retry identity within a group.
 */
export function deriveMemberKey(input: {
  groupKey: string;
  actionType: ActionEnvelope["actionType"];
  payloadFingerprint: string;
  ordinal: number;
}): string {
  return `member_${stableHash(JSON.stringify([
    input.groupKey,
    input.actionType,
    input.payloadFingerprint,
    input.ordinal,
  ]))}`;
}

async function membersForGroup(ctx: MutationCtx, groupId: Doc<"actionGroups">["_id"]): Promise<Doc<"actions">[]> {
  return ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
}

/**
 * Convex retries a conflicting mutation transaction, so the indexed lookup remains the single group creation gate.
 */
export async function ensureGroup(ctx: MutationCtx, groupFields: ActionGroupInput): Promise<EnsureGroupResult> {
  const submissionFingerprint = deriveSubmissionFingerprint(groupFields);
  if (groupFields.submissionFingerprint && groupFields.submissionFingerprint !== submissionFingerprint) {
    throw new Error("Submission fingerprint does not match the immutable group content");
  }
  const existing = await ctx.db
    .query("actionGroups")
    .withIndex("by_group_idempotency_key", (q) =>
      q.eq("userId", groupFields.userId).eq("groupIdempotencyKey", groupFields.groupIdempotencyKey),
    )
    .first();

  if (existing) {
    if (existing.userId !== groupFields.userId || existing.groupIdempotencyKey !== groupFields.groupIdempotencyKey) {
      throw new Error("Idempotency key collision: existing action group does not match expected user/group key");
    }
    const existingFingerprint = existing.submissionFingerprint ?? deriveSubmissionFingerprint(existing);
    if (existingFingerprint !== submissionFingerprint) {
      throw new Error("Idempotency key collision: existing action group does not match submission fingerprint");
    }
    if (!existing.submissionFingerprint) {
      await ctx.db.patch(existing._id, { submissionFingerprint });
    }
    return {
      state: "existing",
      group: { ...existing, submissionFingerprint },
      members: await membersForGroup(ctx, existing._id),
    };
  }

  const groupId = await ctx.db.insert("actionGroups", buildActionGroup({ ...groupFields, submissionFingerprint }));
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Action group was not found after insertion");
  return { state: "created", group, members: [] };
}

export async function ensureMember(ctx: MutationCtx, memberFields: ActionMemberInput): Promise<EnsureMemberResult> {
  const existing = await ctx.db
    .query("actions")
    .withIndex("by_member_idempotency_key", (q) =>
      q.eq("userId", memberFields.userId).eq("memberIdempotencyKey", memberFields.memberIdempotencyKey),
    )
    .first();

  if (existing) {
    if (
      existing.userId !== memberFields.userId ||
      existing.memberIdempotencyKey !== memberFields.memberIdempotencyKey ||
      existing.groupId !== memberFields.groupId ||
      existing.actionType !== memberFields.actionType
    ) {
      throw new Error("Idempotency key collision: existing action member does not match expected identity");
    }
    if (existing.status === "committed") {
      return { state: "already_committed", shouldExecute: false, member: existing };
    }
    if (existing.status === "pending" || existing.status === "failed") {
      // Validate the retry transition is allowed by the central rule.
      if (existing.status === "failed") assertTransition(existing.status, memberFields.status ?? "pending");
      return { state: "reexecute", shouldExecute: true, member: existing };
    }
    return { state: "already_terminal", shouldExecute: false, member: existing };
  }

  const memberId = await ctx.db.insert("actions", {
    ...memberFields,
    status: memberFields.status ?? "pending",
  });
  const member = await ctx.db.get(memberId);
  if (!member) throw new Error("Action member was not found after insertion");
  return { state: "created", shouldExecute: true, member };
}

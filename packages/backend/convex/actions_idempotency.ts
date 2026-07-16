import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  buildActionGroup,
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
  const existing = await ctx.db
    .query("actionGroups")
    .withIndex("by_group_idempotency_key", (q) => q.eq("groupIdempotencyKey", groupFields.groupIdempotencyKey))
    .first();

  if (existing) {
    return { state: "existing", group: existing, members: await membersForGroup(ctx, existing._id) };
  }

  const groupId = await ctx.db.insert("actionGroups", buildActionGroup(groupFields));
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Action group was not found after insertion");
  return { state: "created", group, members: [] };
}

export async function ensureMember(ctx: MutationCtx, memberFields: ActionMemberInput): Promise<EnsureMemberResult> {
  const existing = await ctx.db
    .query("actions")
    .withIndex("by_member_idempotency_key", (q) => q.eq("memberIdempotencyKey", memberFields.memberIdempotencyKey))
    .first();

  if (existing) {
    if (existing.status === "committed") {
      return { state: "already_committed", shouldExecute: false, member: existing };
    }
    if (existing.status === "pending" || existing.status === "failed") {
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

import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertGroupTransition, deriveActionGroupStatus } from "./actions_envelope";

export async function finalizeActionGroup(ctx: MutationCtx, groupId: Id<"actionGroups">) {
  const group = await ctx.db.get("actionGroups", groupId);
  if (!group) throw new Error("Action group not found");
  if (["committed", "discarded", "expired"].includes(group.status)) return group;
  const members = await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
  const status = deriveActionGroupStatus(members.map((member) => member.status));
  assertGroupTransition(group.status, status);
  await ctx.db.patch(groupId, { status, resolvedAt: status === "pending" ? undefined : Date.now() });
  return await ctx.db.get("actionGroups", groupId);
}

export async function finalizeActionGroupAfterWrite(ctx: MutationCtx, userId: string, groupIdempotencyKey: string) {
  const group = await ctx.db
    .query("actionGroups")
    .withIndex("by_group_idempotency_key", (q) => q.eq("userId", userId).eq("groupIdempotencyKey", groupIdempotencyKey))
    .first();
  if (!group) throw new Error("Action group not found after canonical write");
  return finalizeActionGroup(ctx, group._id);
}

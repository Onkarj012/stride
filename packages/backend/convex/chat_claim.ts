import type { MutationCtx } from "./_generated/server";

/**
 * A claim expiry only makes a submission eligible for takeover. It does not
 * revoke the current owner's write rights; the owner is fenced only when a
 * claimant atomically changes owner/version on the user message.
 */
export async function assertCurrentChatClaim(
  ctx: MutationCtx,
  userId: string,
  clientSubmissionId: string,
  claimOwner: string,
  claimVersion: number,
) {
  const userMessage = await ctx.db
    .query("chat_messages")
    .withIndex("by_user_submission_and_role", (q) =>
      q.eq("userId", userId).eq("clientSubmissionId", clientSubmissionId).eq("role", "user"),
    )
    .first();
  if (
    !userMessage
    || userMessage.processingLeaseOwner !== claimOwner
    || userMessage.processingLeaseVersion !== claimVersion
  ) {
    throw new Error("Chat submission lease is no longer current");
  }
}

/** Reports whether the caller passed any claim field, which means the full claim must be checked. */
export function hasCompleteChatClaim(args: {
  claimOwner?: string;
  claimVersion?: number;
  claimSubmissionId?: string;
}) {
  return args.claimOwner !== undefined || args.claimVersion !== undefined || args.claimSubmissionId !== undefined;
}

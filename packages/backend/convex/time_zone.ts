import { isLocalDate, isValidTimeZone, localDateTime, inferSlot, type MealSlot } from "@stride/core";
import { v } from "convex/values";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";

/** A user's local day for one instant, as decided by the D15 resolver. */
export interface LocalDay {
  timeZone: string;
  localDate: string;
  slot: MealSlot;
}

/** Caller's Clerk subject, the userId used across the ledger tables. Throws when signed out. */
export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

/** The user's stored IANA zone. Throws when unset, so no entry ever lands on a guessed day. */
export async function resolveTimeZone(ctx: QueryCtx | MutationCtx, userId: string): Promise<string> {
  const settings = await ctx.db
    .query("user_settings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const timeZone = settings?.timeZone;
  if (timeZone === undefined) throw new Error("Time zone not set. Call time_zone.setTimeZone first.");
  if (!isValidTimeZone(timeZone)) throw new Error(`Stored time zone is not valid: ${timeZone}`);
  return timeZone;
}

/** Local date and inferred slot of an instant in the user's zone. Every new ledger function goes through this. */
export async function resolveLocalDay(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  instantMs: number,
): Promise<LocalDay> {
  const timeZone = await resolveTimeZone(ctx, userId);
  const { date, hour, minute } = localDateTime(instantMs, timeZone);
  return { timeZone, localDate: date, slot: inferSlot(hour, minute) };
}

/** The given YYYY-MM-DD after validation, or the user's today when omitted. */
export async function localDateOrToday(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  localDate: string | undefined,
): Promise<string> {
  if (localDate === undefined) return (await resolveLocalDay(ctx, userId, Date.now())).localDate;
  if (!isLocalDate(localDate)) throw new Error(`Not a YYYY-MM-DD date: ${localDate}`);
  return localDate;
}

/** Stores or refreshes the caller's IANA zone. Clients call it at onboarding and on each session start. */
export const setTimeZone = mutation({
  args: { timeZone: v.string() },
  returns: v.null(),
  handler: async (ctx, { timeZone }) => {
    const userId = await requireUserId(ctx);
    if (!isValidTimeZone(timeZone)) throw new Error(`Unknown time zone: ${timeZone}`);
    const existing = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing === null) await ctx.db.insert("user_settings", { userId, timeZone });
    else if (existing.timeZone !== timeZone) await ctx.db.patch("user_settings", existing._id, { timeZone });
    return null;
  },
});

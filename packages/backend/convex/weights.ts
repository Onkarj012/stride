import { daysBetween, isLocalDate } from "@stride/core";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { localDateOrToday, requireUserId } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Plausible adult body weight bounds in kg. Outside them the input is a typo or wrong unit. */
export const WEIGHT_KG_RANGE = { min: 20, max: 400 } as const;
/** Longest range `weightsInRange` returns, in days inclusive. One weigh-in per day keeps the read bounded. */
export const MAX_WEIGHT_RANGE_DAYS = 366;

/** Records the caller's weight for a day (default today). A second weigh-in the same day replaces the first. */
export const logWeight = mutation({
  args: { kg: v.number(), localDate: v.optional(v.string()) },
  returns: v.id("weights"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    if (!Number.isFinite(args.kg) || args.kg < WEIGHT_KG_RANGE.min || args.kg > WEIGHT_KG_RANGE.max) {
      throw new Error(`kg must be within ${WEIGHT_KG_RANGE.min}-${WEIGHT_KG_RANGE.max}, got ${args.kg}`);
    }
    const localDate = await localDateOrToday(ctx, userId, args.localDate);
    const existing = await ctx.db
      .query("weights")
      .withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", localDate))
      .unique();
    const loggedAt = Date.now();
    if (existing !== null) {
      await ctx.db.patch("weights", existing._id, { kg: args.kg, loggedAt });
      return existing._id;
    }
    return await ctx.db.insert("weights", { userId, localDate, kg: args.kg, loggedAt });
  },
});

/** The caller's weigh-ins from `from` to `to` inclusive, oldest first. */
export const weightsInRange = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(v.object({ localDate: v.string(), kg: v.number() })),
  handler: async (ctx, { from, to }) => {
    const userId = await requireUserId(ctx);
    if (!isLocalDate(from) || !isLocalDate(to)) throw new Error("from and to must be YYYY-MM-DD dates");
    const span = daysBetween(from, to) + 1;
    if (span < 1 || span > MAX_WEIGHT_RANGE_DAYS) {
      throw new Error(`Range must cover 1-${MAX_WEIGHT_RANGE_DAYS} days, got ${span}`);
    }
    const rows = await ctx.db
      .query("weights")
      .withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).gte("localDate", from).lte("localDate", to))
      .take(MAX_WEIGHT_RANGE_DAYS);
    return rows.map((row) => ({ localDate: row.localDate, kg: row.kg }));
  },
});

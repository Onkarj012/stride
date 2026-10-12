import { daysBetween, isValidTimeZone, addDays, TDEE_MAX_WINDOW_DAYS } from "@stride/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { calorieTarget, tdeeInput, TARGET_UPDATE_DAYS } from "./progress_v2";
import { resolveLocalDay } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Users examined per cron transaction; per-user windows run in separate transactions. */
export const TDEE_USER_BATCH_SIZE = 50;

/** Paginates profiles and schedules only users with a weigh-in or intake log in their last 28 local days. */
export const recomputeDaily = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("user_settings").paginate({ numItems: TDEE_USER_BATCH_SIZE, cursor: cursor ?? null });
    for (const settings of page.page) {
      if (settings.timeZone === undefined || !isValidTimeZone(settings.timeZone)) continue;
      const clearing = await ctx.db.query("ledger_clears").withIndex("by_userId", (q) => q.eq("userId", settings.userId)).unique();
      if (clearing !== null) continue;
      const { localDate } = await resolveLocalDay(ctx, settings.userId, Date.now());
      const from = addDays(localDate, 1 - TDEE_MAX_WINDOW_DAYS);
      const weight = await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", settings.userId).gte("localDate", from).lte("localDate", localDate)).order("desc").first();
      const totals = await ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", settings.userId).gte("localDate", from).lte("localDate", localDate)).take(TDEE_MAX_WINDOW_DAYS);
      if (weight !== null || totals.some((row) => row.entryCount > 0)) {
        await ctx.scheduler.runAfter(0, internal.tdee_recompute.recomputeUser, { userId: settings.userId });
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.tdee_recompute.recomputeDaily, { cursor: page.continueCursor });
    return null;
  },
});

/** Upserts a ready local-day snapshot and applies goal targets at most once every seven local days. */
export const recomputeUser = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await assertLedgerWritable(ctx, userId);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings?.timeZone === undefined || !isValidTimeZone(settings.timeZone)) return null;
    const { localDate } = await resolveLocalDay(ctx, userId, Date.now());
    const { result, baseline } = await tdeeInput(ctx, userId, localDate);
    const existing = await ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", localDate)).unique();
    if (result.status === "ok") {
      const row = { userId, localDate, estimateKcal: result.tdeeKcal, trendKg: result.trendKg, windowDays: result.windowDays, confidence: result.loggedFraction };
      if (existing === null) await ctx.db.insert("tdee_snapshots", row);
      else await ctx.db.patch("tdee_snapshots", existing._id, row);
    } else if (existing !== null) await ctx.db.delete("tdee_snapshots", existing._id);
    if (settings.calorieTarget !== undefined && daysBetween(settings.calorieTarget.appliedLocalDate, localDate) < TARGET_UPDATE_DAYS) return null;
    const snapshot = await ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
    const target = calorieTarget({ ...settings, calorieTarget: undefined }, baseline, snapshot, localDate);
    if (target !== null) await ctx.db.patch("user_settings", settings._id, { calorieTarget: target });
    return null;
  },
});

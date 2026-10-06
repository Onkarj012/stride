import { applyDayAdjustment } from "./goals";
import { recomputeWorkoutCountForUser } from "./calibration";

export type DerivedActionType = "meal" | "workout" | "recovery" | "rest" | "memory";

export type RecomputeForActionArgs = {
  userId: string;
  actionType: DerivedActionType;
  date: string;
};

/**
 * Rebuild all durable state whose source set can be changed by a canonical
 * action. Query-derived patterns/readiness need no write: Convex invalidates
 * their source subscriptions.
 */
export async function recomputeForAction(ctx: any, args: RecomputeForActionArgs) {
  if (args.actionType === "workout") await applyDayAdjustment(ctx, args.userId, args.date);
  if (args.actionType === "workout") await recomputeWorkoutCountForUser(ctx, args.userId);

  // Versions are monotonic per user/date. A source mutation increments the
  // version after all dependent state has been rebuilt/invalidated; telemetry
  // records the primary action date's version for freshness debugging.
  const derivedStateVersion = await bumpDerivedStateVersion(ctx, args.userId, args.date);

  return {
    actionType: args.actionType,
    date: args.date,
    goalsRecomputed: args.actionType === "workout",
    calibrationRecomputed: args.actionType === "workout",
    patternsAndReadiness: "source-derived",
    derivedStateVersion,
  } as const;
}

async function bumpDerivedStateVersion(ctx: any, userId: string, date: string): Promise<number> {
  const current = await ctx.db
    .query("derived_state_versions")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .first();
  const version = (current?.version ?? 0) + 1;
  if (current) {
    await ctx.db.patch(current._id, { version, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("derived_state_versions", { userId, date, version, updatedAt: Date.now() });
  }
  return version;
}

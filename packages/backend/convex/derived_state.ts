import { applyDayAdjustment } from "./goals";
import { recomputeGamificationForUser } from "./gamification";
import { recomputeWorkoutCountForUser } from "./calibration";

export type DerivedActionType = "meal" | "workout" | "recovery" | "rest" | "memory";

export type RecomputeForActionArgs = {
  userId: string;
  actionType: DerivedActionType;
  date: string;
};

function nextDate(date: string): string {
  const timestamp = new Date(`${date}T00:00:00.000Z`).getTime() + 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Rebuild all durable state whose source set can be changed by a canonical
 * action. Query-derived patterns/readiness need no write: Convex invalidates
 * their source subscriptions, while insight rows are explicitly marked stale.
 */
export async function recomputeForAction(ctx: any, args: RecomputeForActionArgs) {
  const dates = new Set([args.date]);
  // Sleep and recovery observations can change the following day's readiness
  // and insight context as well as the source day.
  if (args.actionType === "recovery" || args.actionType === "rest") dates.add(nextDate(args.date));

  if (args.actionType === "workout") await applyDayAdjustment(ctx, args.userId, args.date);
  await recomputeGamificationForUser(ctx, args.userId);
  if (args.actionType === "workout") await recomputeWorkoutCountForUser(ctx, args.userId);

  let invalidated = 0;
  for (const date of dates) {
    const insight = await ctx.db
      .query("insights")
      .withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date))
      .first();
    if (insight && !insight.stale) {
      await ctx.db.patch(insight._id, { stale: true });
      invalidated++;
    }
  }

  return {
    actionType: args.actionType,
    date: args.date,
    goalsRecomputed: args.actionType === "workout",
    gamificationRecomputed: true,
    calibrationRecomputed: args.actionType === "workout",
    insightsInvalidated: invalidated,
    patternsAndReadiness: "source-derived",
  } as const;
}

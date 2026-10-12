import {
  adaptiveTdee, addDays, daysBetween, isLocalDate, leastSquaresSlope, mifflinStJeor,
  TDEE_CLAMP, TDEE_MAX_WINDOW_DAYS, TDEE_MIN_LOGGED_FRACTION, TDEE_MIN_WEIGH_INS,
  TDEE_MIN_WINDOW_DAYS, weightTrend, type TdeeDay,
} from "@stride/core";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { localDateOrToday, requireUserId, resolveLocalDay } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Fixed daily goal adjustments in kcal; the result is clamped to the formula maintenance baseline. */
export const GOAL_KCAL_OFFSETS = { lose: -500, maintain: 0, gain: 300 } as const;
/** Standard Mifflin maintenance multipliers for the profile's activity categories. */
export const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 } as const;
export const MAX_PROGRESS_RANGE_DAYS = 180;
export const TARGET_UPDATE_DAYS = 7;

/** Validated age on a local calendar date, with birthday handled without time-zone conversion. */
function ageOnDate(dob: string | undefined, localDate: string): number | null {
  if (dob === undefined || !isLocalDate(dob) || dob >= localDate) return null;
  const age = Number(localDate.slice(0, 4)) - Number(dob.slice(0, 4)) - (localDate.slice(5) < dob.slice(5) ? 1 : 0);
  return age > 0 && age < 130 ? age : null;
}

/** Formula maintenance using complete profile inputs and a measured body weight, with no defaults. */
export function formulaBaseline(settings: Doc<"user_settings"> | null, weightKg: number | null, localDate: string): number | null {
  if (settings === null || settings.activity === undefined) return null;
  const bmr = mifflinStJeor({ weightKg, heightCm: settings.heightCm, ageYears: ageOnDate(settings.dob, localDate), sex: settings.sex });
  if (bmr === null || !Number.isFinite(bmr) || bmr <= 0) return null;
  return bmr * ACTIVITY_FACTORS[settings.activity];
}

/** Builds the D11 input from the last 28 complete local days; older weigh-ins over the chart's range only warm up the EMA so it matches the chart. */
export async function tdeeInput(ctx: QueryCtx | MutationCtx, userId: string, localDate: string) {
  const end = addDays(localDate, -1);
  const from = addDays(end, 1 - TDEE_MAX_WINDOW_DAYS);
  const warmFrom = addDays(localDate, 1 - MAX_PROGRESS_RANGE_DAYS);
  const [settings, weights, totals, latestWeight] = await Promise.all([
    ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).gte("localDate", warmFrom).lte("localDate", end)).take(MAX_PROGRESS_RANGE_DAYS),
    ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).gte("localDate", from).lte("localDate", end)).take(TDEE_MAX_WINDOW_DAYS),
    ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first(),
  ]);
  const weightByDate = new Map(weights.filter((row) => row.localDate >= from).map((row) => [row.localDate, row.kg]));
  const warmupWeights = weights.filter((row) => row.localDate < from).map((row) => ({ date: row.localDate, weightKg: row.kg }));
  const intakeByDate = new Map(totals.filter((row) => row.entryCount > 0).map((row) => [row.localDate, row.kcal]));
  const first = [...weightByDate.keys(), ...intakeByDate.keys()].sort()[0];
  const days: TdeeDay[] = [];
  if (first !== undefined) {
    for (let date = first; date <= end; date = addDays(date, 1)) {
      days.push({ date, weightKg: weightByDate.get(date) ?? null, intakeKcal: intakeByDate.get(date) ?? null });
    }
  }
  const baseline = formulaBaseline(settings, latestWeight?.kg ?? null, localDate);
  return { settings, baseline, result: adaptiveTdee({ days, baselineTdeeKcal: baseline, warmupWeights }) };
}

/** The goal-adjusted target, or null until the profile and measured weight supply a formula baseline. */
export function calorieTarget(
  settings: Doc<"user_settings"> | null,
  baseline: number | null,
  snapshot: Doc<"tdee_snapshots"> | null,
  localDate: string,
): { kcal: number; source: "formula" | "adaptive"; appliedLocalDate: string } | null {
  if (settings?.goal === undefined || baseline === null) return null;
  if (settings.calorieTarget !== undefined) return settings.calorieTarget;
  const maintenance = snapshot?.estimateKcal ?? baseline;
  const kcal = Math.round(Math.max(baseline * TDEE_CLAMP.min, Math.min(baseline * TDEE_CLAMP.max, maintenance + GOAL_KCAL_OFFSETS[settings.goal])));
  return { kcal, source: snapshot === null ? "formula" : "adaptive", appliedLocalDate: localDate };
}

/** Freezes the first usable target when a weigh-in supplies the missing measured weight. */
export async function initializeCalorieTarget(ctx: MutationCtx, userId: string): Promise<void> {
  const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
  if (settings?.timeZone === undefined || settings.calorieTarget !== undefined) return;
  const { localDate } = await resolveLocalDay(ctx, userId, Date.now());
  const latestWeight = await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
  const baseline = formulaBaseline(settings, latestWeight?.kg ?? null, localDate);
  const snapshot = await ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
  const target = calorieTarget(settings, baseline, snapshot, localDate);
  if (target === null) return;
  await assertLedgerWritable(ctx, userId);
  await ctx.db.patch("user_settings", settings._id, { calorieTarget: target });
}

/** Signed-in weight trends, D11 gate progress, expenditure and the current weekly calorie target. */
export const summary = query({
  args: { rangeDays: v.number(), localDate: v.optional(v.string()) },
  returns: v.object({
    localDate: v.string(),
    weights: v.array(v.object({ localDate: v.string(), kg: v.number(), trendKg: v.number() })),
    latestTrendKg: v.union(v.number(), v.null()),
    weeklyRateKg: v.union(v.number(), v.null()),
    snapshot: v.union(v.null(), v.object({ localDate: v.string(), estimate: v.number(), trendKg: v.number(), windowDays: v.number(), confidence: v.number() })),
    gate: v.object({
      status: v.union(v.literal("ok"), v.literal("insufficient")),
      reasons: v.array(v.union(v.literal("too_few_days"), v.literal("too_few_weigh_ins"), v.literal("too_few_logged_days"), v.literal("missing_baseline"))),
      windowDays: v.number(), weighIns: v.number(), loggedFraction: v.number(), loggedDays: v.number(),
      minDays: v.number(), minWeighIns: v.number(), minLoggedFraction: v.number(),
    }),
    target: v.union(v.null(), v.object({ kcal: v.number(), source: v.union(v.literal("formula"), v.literal("adaptive")), appliedLocalDate: v.string() })),
  }),
  handler: async (ctx, { rangeDays, localDate: requestedDate }) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > MAX_PROGRESS_RANGE_DAYS) {
      throw new Error(`rangeDays must be an integer from 1 to ${MAX_PROGRESS_RANGE_DAYS}`);
    }
    const localDate = await localDateOrToday(ctx, userId, requestedDate);
    const from = addDays(localDate, 1 - MAX_PROGRESS_RANGE_DAYS);
    const [input, rows, latestSnapshot] = await Promise.all([
      tdeeInput(ctx, userId, localDate),
      ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).gte("localDate", from).lte("localDate", localDate)).take(MAX_PROGRESS_RANGE_DAYS),
      ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first(),
    ]);
    const trend = weightTrend(rows.map((row) => ({ date: row.localDate, weightKg: row.kg, intakeKcal: null })));
    const requestedFrom = addDays(localDate, 1 - rangeDays);
    const weights = rows.filter((row) => row.localDate >= requestedFrom).map((row) => ({ localDate: row.localDate, kg: row.kg, trendKg: trend.get(row.localDate) ?? row.kg }));
    const last = rows[rows.length - 1];
    const recent = rows.filter((row) => row.localDate >= addDays(localDate, -7));
    const weeklyRateKg = recent.length < 2 ? null : 7 * leastSquaresSlope(recent.map((row) => ({ x: daysBetween(recent[0]?.localDate ?? row.localDate, row.localDate), y: trend.get(row.localDate) ?? row.kg })));
    const { result } = input;
    const reasons = result.status === "insufficient" ? result.reasons : [];
    if (input.baseline === null && !reasons.includes("missing_baseline")) reasons.push("missing_baseline");
    return {
      localDate,
      weights,
      latestTrendKg: last === undefined ? null : trend.get(last.localDate) ?? null,
      weeklyRateKg,
      snapshot: latestSnapshot === null ? null : { localDate: latestSnapshot.localDate, estimate: latestSnapshot.estimateKcal, trendKg: latestSnapshot.trendKg, windowDays: latestSnapshot.windowDays, confidence: latestSnapshot.confidence },
      gate: { status: result.status, reasons, windowDays: result.windowDays, weighIns: result.weighIns, loggedFraction: result.loggedFraction, loggedDays: Math.round(result.loggedFraction * result.windowDays), minDays: TDEE_MIN_WINDOW_DAYS, minWeighIns: TDEE_MIN_WEIGH_INS, minLoggedFraction: TDEE_MIN_LOGGED_FRACTION },
      target: calorieTarget(input.settings, input.baseline, latestSnapshot, localDate),
    };
  },
});

/** Saves the profile inputs for the formula, then clears and re-freezes the weekly target. */
export const saveProfile = mutation({
  args: {
    goal: v.union(v.literal("lose"), v.literal("maintain"), v.literal("gain")),
    sex: v.union(v.literal("male"), v.literal("female")),
    heightCm: v.number(),
    dob: v.string(),
    activity: v.union(
      v.literal("sedentary"),
      v.literal("light"),
      v.literal("moderate"),
      v.literal("active"),
      v.literal("very_active"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isFinite(args.heightCm) || args.heightCm < 100 || args.heightCm > 250) {
      throw new Error(`heightCm must be within 100-250, got ${args.heightCm}`);
    }
    const localDate = await localDateOrToday(ctx, userId, undefined);
    const age = ageOnDate(args.dob, localDate);
    if (age === null || age < 13 || age > 120) {
      throw new Error(`dob must be a valid date giving an age of 13-120, got ${args.dob}`);
    }
    await assertLedgerWritable(ctx, userId);
    const profile = { goal: args.goal, sex: args.sex, heightCm: args.heightCm, dob: args.dob, activity: args.activity };
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings === null) await ctx.db.insert("user_settings", { userId, ...profile });
    else await ctx.db.patch("user_settings", settings._id, { ...profile, calorieTarget: undefined });
    await initializeCalorieTarget(ctx, userId);
    return null;
  },
});

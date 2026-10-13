import {
  adaptiveTdee, addDays, ageOnDate, daysBetween, formulaBaseline, goalTargetKcal, leastSquaresSlope,
  TDEE_MAX_WINDOW_DAYS, TDEE_MIN_LOGGED_FRACTION, TDEE_MIN_WEIGH_INS,
  TDEE_MIN_WINDOW_DAYS, weightTrend, type TdeeDay,
} from "@stride/core";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { localDateOrToday, requireUserId, resolveLocalDay } from "./time_zone";
import { assertLedgerWritable } from "./users";

export const MAX_PROGRESS_RANGE_DAYS = 180;
export const TARGET_UPDATE_DAYS = 7;

type CalorieTarget = NonNullable<Doc<"user_settings">["calorieTarget"]>;
type ProfileInput = Pick<Doc<"user_settings">, "goal" | "heightCm" | "dob" | "targetWeightKg" | "trainingDaysPerWeek">;
type DietType = NonNullable<Doc<"user_settings">["dietType"]>;

const goalValidator = v.union(v.literal("lose"), v.literal("maintain"), v.literal("gain"));
const sexValidator = v.union(v.literal("male"), v.literal("female"));
const activityValidator = v.union(
  v.literal("sedentary"),
  v.literal("light"),
  v.literal("moderate"),
  v.literal("active"),
  v.literal("very_active"),
);
const dietTypeValidator = v.union(
  v.literal("veg"),
  v.literal("eggetarian"),
  v.literal("non_veg"),
  v.literal("vegan"),
  v.literal("jain"),
);
const paceValidator = v.union(v.literal("relaxed"), v.literal("steady"), v.literal("fast"));
const clampedValidator = v.union(v.literal("pace_cap"), v.literal("floor"));
const dietTypesValidator = v.array(dietTypeValidator);

/** The diets a settings row holds. Rows saved before the multi-select have only the legacy single dietType. */
export function dietsOf(settings: Pick<Doc<"user_settings">, "dietType" | "dietTypes"> | null): DietType[] {
  return settings?.dietTypes ?? (settings?.dietType ? [settings.dietType] : []);
}

/** Deduplicates the picked diets and rejects an empty pick. */
function pickedDiets(dietTypes: DietType[]): DietType[] {
  const unique = [...new Set(dietTypes)];
  if (unique.length === 0) throw new Error("Pick at least one diet");
  return unique;
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
  return { settings, baseline, latestWeightKg: latestWeight?.kg ?? null, result: adaptiveTdee({ days, baselineTdeeKcal: baseline, warmupWeights }) };
}

/** The goal-adjusted target, or null until the profile and measured weight supply a formula baseline. */
export function calorieTarget(
  settings: Doc<"user_settings"> | null,
  baseline: number | null,
  snapshot: Doc<"tdee_snapshots"> | null,
  localDate: string,
  weightKg: number | null,
): CalorieTarget | null {
  if (settings?.goal === undefined || settings.sex === undefined || baseline === null || weightKg === null) return null;
  if (settings.calorieTarget !== undefined) return settings.calorieTarget;
  const maintenance = snapshot?.estimateKcal ?? baseline;
  const { kcal, clamped } = goalTargetKcal({ baseline, maintenance, goal: settings.goal, pace: settings.pace, weightKg, sex: settings.sex });
  return { kcal, source: snapshot === null ? "formula" : "adaptive", appliedLocalDate: localDate, ...(clamped === null ? {} : { clamped }) };
}

/** Freezes the first usable target when a weigh-in supplies the missing measured weight. */
export async function initializeCalorieTarget(ctx: MutationCtx, userId: string): Promise<void> {
  const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
  if (settings?.timeZone === undefined || settings.calorieTarget !== undefined) return;
  const { localDate } = await resolveLocalDay(ctx, userId, Date.now());
  const latestWeight = await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
  const baseline = formulaBaseline(settings, latestWeight?.kg ?? null, localDate);
  const snapshot = await ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
  const target = calorieTarget(settings, baseline, snapshot, localDate, latestWeight?.kg ?? null);
  if (target === null) return;
  await assertLedgerWritable(ctx, userId);
  await ctx.db.patch("user_settings", settings._id, { calorieTarget: target });
}

/** Rejects profile values that would make the formula, the target or the weigh-in history nonsensical. Target-side checks run only when checkTargetSide is true. */
async function validateProfile(ctx: MutationCtx, userId: string, profile: ProfileInput, checkTargetSide: boolean): Promise<void> {
  const { goal, heightCm, dob, targetWeightKg, trainingDaysPerWeek } = profile;
  if (heightCm === undefined || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
    throw new Error(`heightCm must be within 100-250, got ${heightCm}`);
  }
  const localDate = await localDateOrToday(ctx, userId, undefined);
  const age = dob === undefined ? null : ageOnDate(dob, localDate);
  if (age === null || age < 13 || age > 120) {
    throw new Error(`dob must be a valid date giving an age of 13-120, got ${dob}`);
  }
  if (trainingDaysPerWeek !== undefined && (!Number.isInteger(trainingDaysPerWeek) || trainingDaysPerWeek < 0 || trainingDaysPerWeek > 7)) {
    throw new Error(`trainingDaysPerWeek must be an integer from 0 to 7, got ${trainingDaysPerWeek}`);
  }
  if (targetWeightKg === undefined) return;
  if (!Number.isFinite(targetWeightKg) || targetWeightKg < 30 || targetWeightKg > 300) {
    throw new Error(`targetWeightKg must be within 30-300, got ${targetWeightKg}`);
  }
  if (!checkTargetSide) return;
  const latest = await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
  if (latest === null) return;
  if (goal === "lose" && targetWeightKg >= latest.kg) {
    throw new Error(`targetWeightKg must be below your current weight of ${latest.kg} kg to lose weight, got ${targetWeightKg}`);
  }
  if (goal === "gain" && targetWeightKg <= latest.kg) {
    throw new Error(`targetWeightKg must be above your current weight of ${latest.kg} kg to gain weight, got ${targetWeightKg}`);
  }
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
    target: v.union(v.null(), v.object({
      kcal: v.number(),
      source: v.union(v.literal("formula"), v.literal("adaptive")),
      appliedLocalDate: v.string(),
      clamped: v.optional(clampedValidator),
    })),
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
      target: calorieTarget(input.settings, input.baseline, latestSnapshot, localDate, input.latestWeightKg),
    };
  },
});

/** Which profile fields are still missing before the calorie target can be trusted. */
export const profileStatus = query({
  args: {},
  returns: v.object({ complete: v.boolean(), missing: v.array(v.string()) }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [settings, weight] = await Promise.all([
      ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).first(),
    ]);
    const missing: string[] = [];
    if (settings?.goal === undefined) missing.push("goal");
    if (settings?.sex === undefined) missing.push("sex");
    if (settings?.dob === undefined) missing.push("dob");
    if (settings?.heightCm === undefined) missing.push("heightCm");
    if (settings?.activity === undefined) missing.push("activity");
    if (dietsOf(settings).length === 0) missing.push("dietType");
    if (weight === null) missing.push("weight");
    return { complete: missing.length === 0, missing };
  },
});

/** The saved profile for the Profile screen, or null before onboarding has created it. */
export const profile = query({
  args: {},
  returns: v.union(v.null(), v.object({
    goal: v.optional(goalValidator),
    sex: v.optional(sexValidator),
    dob: v.optional(v.string()),
    heightCm: v.optional(v.number()),
    activity: v.optional(activityValidator),
    dietTypes: dietTypesValidator,
    targetWeightKg: v.optional(v.number()),
    pace: v.optional(paceValidator),
    trainingDaysPerWeek: v.optional(v.number()),
    units: v.optional(v.string()),
    latestWeightKg: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings === null) return null;
    const localDate = await localDateOrToday(ctx, userId, undefined);
    const latestWeight = await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).lte("localDate", localDate)).order("desc").first();
    return {
      goal: settings.goal,
      sex: settings.sex,
      dob: settings.dob,
      heightCm: settings.heightCm,
      activity: settings.activity,
      dietTypes: dietsOf(settings),
      targetWeightKg: settings.targetWeightKg,
      pace: settings.pace,
      trainingDaysPerWeek: settings.trainingDaysPerWeek,
      units: settings.units,
      latestWeightKg: latestWeight?.kg ?? null,
    };
  },
});

/** Saves the full onboarding profile, then clears and re-freezes the weekly target. */
export const saveProfile = mutation({
  args: {
    goal: goalValidator,
    sex: sexValidator,
    heightCm: v.number(),
    dob: v.string(),
    activity: activityValidator,
    dietTypes: dietTypesValidator,
    targetWeightKg: v.optional(v.number()),
    pace: v.optional(paceValidator),
    trainingDaysPerWeek: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dietTypes = pickedDiets(args.dietTypes);
    await validateProfile(ctx, userId, args, true);
    await assertLedgerWritable(ctx, userId);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings === null) await ctx.db.insert("user_settings", { userId, ...args, dietTypes });
    else await ctx.db.patch("user_settings", settings._id, { ...args, dietTypes, dietType: undefined, calorieTarget: undefined });
    await initializeCalorieTarget(ctx, userId);
    return null;
  },
});

/** Updates any profile fields the Profile screen sends, then clears and re-freezes the weekly target. */
export const updateProfile = mutation({
  args: {
    goal: v.optional(goalValidator),
    sex: v.optional(sexValidator),
    heightCm: v.optional(v.number()),
    dob: v.optional(v.string()),
    activity: v.optional(activityValidator),
    dietTypes: v.optional(dietTypesValidator),
    targetWeightKg: v.optional(v.number()),
    pace: v.optional(paceValidator),
    trainingDaysPerWeek: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings === null) throw new Error("Finish onboarding first");
    const dietPatch = args.dietTypes === undefined ? {} : { dietTypes: pickedDiets(args.dietTypes), dietType: undefined };
    await validateProfile(ctx, userId, { ...settings, ...args }, args.targetWeightKg !== undefined || args.goal !== undefined);
    await assertLedgerWritable(ctx, userId);
    await ctx.db.patch("user_settings", settings._id, { ...args, ...dietPatch, calorieTarget: undefined });
    await initializeCalorieTarget(ctx, userId);
    return null;
  },
});

/** Saves the metric or imperial choice on the caller's settings row. The weekly calorie target stays as it is. */
export const setUnits = mutation({
  args: { units: v.union(v.literal("metric"), v.literal("imperial")) },
  returns: v.null(),
  handler: async (ctx, { units }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings === null) await ctx.db.insert("user_settings", { userId, units });
    else await ctx.db.patch("user_settings", settings._id, { units });
    return null;
  },
});

import { query, mutation, internalQuery, action } from "./_generated/server";
import { v } from "convex/values";
import { calculateNutritionPlan as computePlan, type PlanInput } from "./tdee_engine";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const p = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) return null;
    return {
      weight: p.weight ?? null,
      height: p.height ?? null,
      age: p.age ?? null,
      sex: p.sex ?? null,
      activityLevel: p.activityLevel,
      calorieTarget: p.calorieTarget ?? null,
      proteinTarget: p.proteinTarget ?? null,
      carbTarget: p.carbTarget ?? null,
      fatTarget: p.fatTarget ?? null,
      bodyFat: p.bodyFat ?? null,
      leanMass: p.leanMass ?? null,
      dailySteps: p.dailySteps ?? null,
      trainingDays: p.trainingDays ?? null,
      cardioMinutes: p.cardioMinutes ?? null,
      jobType: p.jobType ?? null,
      goal: p.goal ?? null,
      trainingStyle: p.trainingStyle ?? null,
      onboardingComplete: p.onboardingComplete ?? false,
      dietaryPreference: p.dietaryPreference ?? null,
      allergies: p.allergies ?? null,
      fitnessLevel: p.fitnessLevel ?? null,
      dislikedFoods: p.dislikedFoods ?? null,
      cuisines: p.cuisines ?? null,
      equipment: p.equipment ?? null,
      scheduleNote: p.scheduleNote ?? null,
      occupationType: p.occupationType ?? null,
      workHoursPerDay: p.workHoursPerDay ?? null,
      lifestyleActivity: p.lifestyleActivity ?? null,
      weeklyWorkouts: p.weeklyWorkouts ?? null,
      goalWeightKg: p.goalWeightKg ?? null,
      planBreakdown: p.planBreakdown ?? null,
      waterTarget: p.waterTarget ?? null,
    };
  },
});

export const upsertProfile = mutation({
  args: {
    weight: v.optional(v.number()),
    height: v.optional(v.number()),
    age: v.optional(v.number()),
    sex: v.optional(v.string()),
    activityLevel: v.optional(v.string()),
    calorieTarget: v.optional(v.number()),
    proteinTarget: v.optional(v.number()),
    carbTarget: v.optional(v.number()),
    fatTarget: v.optional(v.number()),
    bodyFat: v.optional(v.number()),
    leanMass: v.optional(v.number()),
    dailySteps: v.optional(v.number()),
    trainingDays: v.optional(v.number()),
    cardioMinutes: v.optional(v.number()),
    jobType: v.optional(v.string()),
    goal: v.optional(v.string()),
    trainingStyle: v.optional(v.string()),
    onboardingComplete: v.optional(v.boolean()),
    dietaryPreference: v.optional(v.string()),
    allergies: v.optional(v.string()),
    fitnessLevel: v.optional(v.string()),
    dislikedFoods: v.optional(v.string()),
    cuisines: v.optional(v.string()),
    equipment: v.optional(v.string()),
    scheduleNote: v.optional(v.string()),
    occupationType: v.optional(v.string()),
    workHoursPerDay: v.optional(v.number()),
    lifestyleActivity: v.optional(v.string()),
    weeklyWorkouts: v.optional(v.string()),
    goalWeightKg: v.optional(v.number()),
    planBreakdown: v.optional(v.string()),
    waterTarget: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numericFields = ["weight", "height", "age", "calorieTarget", "proteinTarget", "carbTarget", "fatTarget", "bodyFat", "leanMass", "dailySteps", "trainingDays", "cardioMinutes", "workHoursPerDay", "goalWeightKg", "waterTarget"] as const;
    for (const field of numericFields) {
      const val = args[field as keyof typeof args];
      if (typeof val === "number" && val < 0) {
        throw new Error(`Invalid ${field}: must be >= 0`);
      }
    }
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const patch: any = {
      activityLevel: args.activityLevel ?? existing?.activityLevel ?? "moderate",
    };
    const optionalFields = [
      "weight", "height", "age", "sex", "calorieTarget", "proteinTarget",
      "carbTarget", "fatTarget", "bodyFat", "leanMass", "dailySteps",
      "trainingDays", "cardioMinutes", "jobType", "goal", "trainingStyle", "onboardingComplete",
      "dietaryPreference", "allergies", "fitnessLevel",
      "dislikedFoods", "cuisines", "equipment", "scheduleNote",
      "occupationType", "workHoursPerDay", "lifestyleActivity", "weeklyWorkouts",
      "goalWeightKg", "planBreakdown", "waterTarget",
    ] as const;
    for (const field of optionalFields) {
      const val = args[field as keyof typeof args];
      if (val !== undefined) {
        patch[field] = val;
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("user_profiles", { userId, ...patch });
    }
  },
});

/** @deprecated Legacy activity-multiplier TDEE. Use calculateNutritionPlan /
 *  upsertPlanFromOnboarding (4-component engine). Kept until the UI migrates. */
export const calculateTDEE = action({
  args: {
    weight: v.number(),
    height: v.number(),
    age: v.number(),
    sex: v.string(),
    activityLevel: v.optional(v.string()),
    bodyFat: v.optional(v.number()),
    leanMass: v.optional(v.number()),
    dailySteps: v.optional(v.number()),
    trainingDays: v.optional(v.number()),
    cardioMinutes: v.optional(v.number()),
    jobType: v.optional(v.string()),
    goal: v.optional(v.string()),
    trainingStyle: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const { weight, height, age, sex, bodyFat, leanMass, dailySteps, trainingDays, cardioMinutes, jobType, goal, trainingStyle } = args;

    // Step A: Calculate RMR
    let rmr: number;
    const knownLeanMass = leanMass && leanMass > 0 ? leanMass : (bodyFat && bodyFat > 0 ? weight * (1 - bodyFat / 100) : 0);

    if (knownLeanMass && knownLeanMass > 0) {
      // Cunningham equation
      rmr = 500 + 22 * knownLeanMass;
    } else {
      // Mifflin-St Jeor
      if (sex === "female") {
        rmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
      } else {
        rmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
      }
    }
    rmr = Math.round(rmr);

    // Step B: Activity multiplier from job type
    let jobMultiplier = 1.2;
    if (jobType === "mixed") jobMultiplier = 1.375;
    else if (jobType === "standing") jobMultiplier = 1.465;
    else if (jobType === "physical") jobMultiplier = 1.55;

    // Adjust for steps
    const steps = dailySteps ?? 0;
    if (steps >= 10000) jobMultiplier += 0.075;
    else if (steps >= 7000) jobMultiplier += 0.05;
    else if (steps >= 5000) jobMultiplier += 0.025;

    // Calculate exercise calories
    let exerciseCals = 0;
    const td = trainingDays ?? 0;
    const cm = cardioMinutes ?? 0;

    if (td > 0) {
      const style = trainingStyle || "resistance";
      const perSession = style === "endurance" ? 450 : style === "mixed" ? 375 : 325;
      exerciseCals += (td / 7) * perSession;
    }
    if (cm > 0) {
      exerciseCals += (cm / 7) * 8; // ~8 kcal/min average
    }

    const tdee = Math.round(rmr * jobMultiplier + exerciseCals);

    // Step C: Goal adjustment
    let targetCals = tdee;
    let targetProtein = Math.round(weight * 2.0);
    if (goal === "cut") {
      targetCals = Math.round(tdee * 0.85);
      targetProtein = Math.round(weight * 2.2);
    } else if (goal === "bulk") {
      targetCals = Math.round(tdee * 1.1);
      targetProtein = Math.round(weight * 2.0);
    } else if (goal === "recomp") {
      targetCals = tdee;
      targetProtein = Math.round(weight * 2.2);
    }

    const targetFat = Math.round(weight * 0.9);
    const targetCarbs = Math.round((targetCals - (targetProtein * 4) - (targetFat * 9)) / 4);

    return {
      rmr,
      tdee,
      targetCals,
      targetProtein: Math.max(targetProtein, Math.round(weight * 1.6)),
      targetCarbs: Math.max(targetCarbs, 100),
      targetFat: Math.max(targetFat, 40),
      explanation: `RMR: ${rmr} kcal. TDEE: ${tdee} kcal. Goal: ${goal || "maintain"}.`,
    };
  },
});

export const getProfileForContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// ─── User Settings (LLM config) ─────────────────────────────────────────────

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const s = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      // openRouterKey is write-only — never returned to client
      hasOpenRouterKey: !!(s?.openRouterKey),
      openRouterModel: s?.openRouterModel ?? "openai/gpt-4o-mini",
      units: s?.units ?? "metric",
      notifications: s?.notifications ?? true,
      coachingStyle: s?.coachingStyle ?? "gentle",
      reduceMotion: s?.reduceMotion ?? false,
      timezoneOffsetMinutes: s?.timezoneOffsetMinutes ?? null,
    };
  },
});

const UNITS = ["metric", "imperial"];
const COACHING_STYLES = ["gentle", "motivating", "analytical"];

export const upsertSettings = mutation({
  args: {
    openRouterKey: v.optional(v.string()),
    openRouterModel: v.optional(v.string()),
    units: v.optional(v.string()),
    notifications: v.optional(v.boolean()),
    coachingStyle: v.optional(v.string()),
    reduceMotion: v.optional(v.boolean()),
    timezoneOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.units !== undefined && !UNITS.includes(args.units))
      throw new Error(`Invalid units: ${args.units}`);
    if (args.coachingStyle !== undefined && !COACHING_STYLES.includes(args.coachingStyle))
      throw new Error(`Invalid coachingStyle: ${args.coachingStyle}`);
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const patch: any = {};
    if (args.openRouterKey !== undefined) patch.openRouterKey = args.openRouterKey || undefined;
    if (args.openRouterModel !== undefined) patch.openRouterModel = args.openRouterModel;
    if (args.units !== undefined) patch.units = args.units;
    if (args.notifications !== undefined) patch.notifications = args.notifications;
    if (args.coachingStyle !== undefined) patch.coachingStyle = args.coachingStyle;
    if (args.reduceMotion !== undefined) patch.reduceMotion = args.reduceMotion;
    if (args.timezoneOffsetMinutes !== undefined) patch.timezoneOffsetMinutes = args.timezoneOffsetMinutes;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("user_settings", { userId, ...patch });
    }
  },
});

export const getSettingsForContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// ─── 4-component nutrition plan (Task 17) ───────────────────────────────────

const planArgs = {
  weightKg: v.number(),
  heightCm: v.number(),
  age: v.number(),
  sex: v.string(),
  bodyFat: v.optional(v.number()),
  occupationType: v.optional(v.string()),
  workHoursPerDay: v.optional(v.number()),
  lifestyleActivity: v.optional(v.string()),
  weeklyWorkouts: v.optional(
    v.array(v.object({ type: v.string(), durationMin: v.number(), sessionsPerWeek: v.number() })),
  ),
  goal: v.optional(v.string()),
};

export function toPlanInput(a: any): PlanInput {
  return {
    weightKg: a.weightKg,
    heightCm: a.heightCm,
    age: a.age,
    sex: a.sex === "female" ? "female" : "male",
    bodyFat: a.bodyFat,
    occupationType: a.occupationType,
    workHoursPerDay: a.workHoursPerDay,
    lifestyleActivity: a.lifestyleActivity,
    weeklyWorkouts: a.weeklyWorkouts,
    goal: mapLegacyGoal(a.goal),
  };
}

/** Map legacy goal strings to the 7 engine goals. */
function mapLegacyGoal(goal?: string): string | undefined {
  switch (goal) {
    case "cut": return "moderate_loss";
    case "bulk": return "muscle_gain";
    case "lose": return "moderate_loss";
    case "gain": return "lean_gain";
    default: return goal; // already an engine goal or undefined
  }
}

/** Pure compute — returns full plan + transparency breakdown (no persistence). */
export const calculateNutritionPlan = query({
  args: planArgs,
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    return computePlan(toPlanInput(args));
  },
});

/** Compute + persist targets to user_profiles and seed today's daily_goals. */
export const upsertPlanFromOnboarding = mutation({
  args: {
    ...planArgs,
    date: v.string(),
    goalWeightKg: v.optional(v.number()),
    dietaryPreference: v.optional(v.string()),
    allergies: v.optional(v.string()),
    dislikedFoods: v.optional(v.string()),
    cuisines: v.optional(v.string()),
    equipment: v.optional(v.string()),
    scheduleNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const plan = computePlan(toPlanInput(args));

    const patch: any = {
      weight: args.weightKg,
      height: args.heightCm,
      age: args.age,
      sex: args.sex,
      bodyFat: args.bodyFat,
      occupationType: args.occupationType,
      workHoursPerDay: args.workHoursPerDay,
      lifestyleActivity: args.lifestyleActivity,
      goal: mapLegacyGoal(args.goal),
      goalWeightKg: args.goalWeightKg,
      weeklyWorkouts: args.weeklyWorkouts ? JSON.stringify(args.weeklyWorkouts) : undefined,
      activityLevel: args.lifestyleActivity ?? "moderate",
      calorieTarget: plan.calories,
      proteinTarget: plan.protein,
      carbTarget: plan.carbs,
      fatTarget: plan.fat,
      planBreakdown: JSON.stringify(plan),
      onboardingComplete: true,
      dietaryPreference: args.dietaryPreference,
      allergies: args.allergies,
      dislikedFoods: args.dislikedFoods,
      cuisines: args.cuisines,
      equipment: args.equipment,
      scheduleNote: args.scheduleNote,
    };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];

    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("user_profiles", { userId, ...patch });

    // Seed today's daily_goals from the computed plan.
    const goalRow = await ctx.db
      .query("daily_goals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", args.date))
      .first();
    const goals = {
      calorieGoal: plan.calories,
      proteinGoal: plan.protein,
      carbGoal: plan.carbs,
      fatGoal: plan.fat,
    };
    if (goalRow) await ctx.db.patch(goalRow._id, goals);
    else await ctx.db.insert("daily_goals", { userId, date: args.date, ...goals });

    return plan;
  },
});

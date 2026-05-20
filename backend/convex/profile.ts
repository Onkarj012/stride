import { query, mutation, internalQuery, action } from "./_generated/server";
import { v } from "convex/values";

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
  },
  handler: async (ctx, args) => {
    const numericFields = ["weight", "height", "age", "calorieTarget", "proteinTarget", "carbTarget", "fatTarget", "bodyFat", "leanMass", "dailySteps", "trainingDays", "cardioMinutes"] as const;
    for (const field of numericFields) {
      const val = args[field as keyof typeof args];
      if (val !== undefined && val !== null && val < 0) {
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
      "dietaryPreference", "allergies",
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
      openRouterKey: s?.openRouterKey ?? null,
      openRouterModel: s?.openRouterModel ?? "openai/gpt-4o-mini",
    };
  },
});

export const upsertSettings = mutation({
  args: {
    openRouterKey: v.optional(v.string()),
    openRouterModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const patch: any = {};
    if (args.openRouterKey !== undefined) patch.openRouterKey = args.openRouterKey || undefined;
    if (args.openRouterModel !== undefined) patch.openRouterModel = args.openRouterModel;

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

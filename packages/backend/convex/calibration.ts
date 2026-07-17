/**
 * Calibration API
 * Adaptive metabolic profile management.
 * Users provide feedback on calorie estimates, and their metabolic_factor
 * adjusts over time for more accurate personalized estimates.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

const CALCULATION_VERSION = 1;
const MIN_FACTOR = 0.7;
const MAX_FACTOR = 1.4;
const ADJUSTMENT_STEP = 0.02;
const MIN_FEEDBACKS_BEFORE_ADJUST = 5;

// ─── Public queries ───────────────────────────────────────────────────────────

export const getMetabolicProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query("user_metabolic_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!profile) {
      // Return defaults
      return {
        metabolicFactor: 1.0,
        fitnessLevel: "beginner",
        totalWorkoutsTracked: 0,
        lastCalibrationDate: null,
      };
    }
    return {
      metabolicFactor: profile.metabolicFactor,
      fitnessLevel: profile.fitnessLevel,
      totalWorkoutsTracked: profile.totalWorkoutsTracked,
      lastCalibrationDate: profile.lastCalibrationDate ?? null,
    };
  },
});

// ─── Public mutations ─────────────────────────────────────────────────────────

/**
 * Submit feedback on a workout's calorie estimate.
 * Adjusts metabolicFactor by ±0.02 per feedback once enough data is collected.
 */
export const submitCalorieFeedback = mutation({
  args: {
    workoutId: v.id("workouts"),
    feedback: v.union(v.literal("too_high"), v.literal("accurate"), v.literal("too_low")),
  },
  handler: async (ctx, { workoutId, feedback }) => {
    const userId = await requireUserId(ctx);

    // Get existing metabolic profile or create default
    let profile = await ctx.db
      .query("user_metabolic_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!profile) {
      const id = await ctx.db.insert("user_metabolic_profiles", {
        userId,
        metabolicFactor: 1.0,
        fitnessLevel: "beginner",
        totalWorkoutsTracked: 0,
        lastCalibrationDate: undefined,
      });
      profile = await ctx.db.get(id);
      if (!profile) throw new Error("Metabolic profile could not be created");
    }

    // Record feedback
    await ctx.db.insert("calorie_feedback", {
      userId,
      workoutId,
      feedback,
      date: new Date().toISOString().split("T")[0],
      metabolicFactorSnapshot: profile.metabolicFactor,
    });

    // Adjust metabolic factor based on feedback
    let newFactor = profile.metabolicFactor;
    const feedbackCount = (await ctx.db
      .query("calorie_feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()).length;

    if (feedback === "too_high" && feedbackCount >= MIN_FEEDBACKS_BEFORE_ADJUST) {
      newFactor = Math.max(MIN_FACTOR, newFactor - ADJUSTMENT_STEP);
    } else if (feedback === "too_low" && feedbackCount >= MIN_FEEDBACKS_BEFORE_ADJUST) {
      newFactor = Math.min(MAX_FACTOR, newFactor + ADJUSTMENT_STEP);
    }
    // "accurate" feedback — no change, reinforces current factor

    await ctx.db.patch(profile._id, {
      metabolicFactor: Math.round(newFactor * 100) / 100,
      lastCalibrationDate: new Date().toISOString().split("T")[0],
    });

    return {
      metabolicFactor: Math.round(newFactor * 100) / 100,
      totalWorkoutsTracked: profile.totalWorkoutsTracked,
    };
  },
});

/**
 * Set the user's fitness level.
 */
export const setFitnessLevel = mutation({
  args: {
    fitnessLevel: v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced")),
  },
  handler: async (ctx, { fitnessLevel }) => {
    const userId = await requireUserId(ctx);

    let profile = await ctx.db
      .query("user_metabolic_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      await ctx.db.patch(profile._id, { fitnessLevel });
    } else {
      await ctx.db.insert("user_metabolic_profiles", {
        userId,
        metabolicFactor: 1.0,
        fitnessLevel,
        totalWorkoutsTracked: 0,
      });
    }

    return { fitnessLevel };
  },
});

// ─── Internal queries/mutations ───────────────────────────────────────────────

/**
 * Get metabolic profile for use in calorie engine calculations.
 * Called from actions (via runQuery).
 */
export const getMetabolicProfileForContext = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query("user_metabolic_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const userProfile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      metabolicFactor: profile?.metabolicFactor ?? 1.0,
      fitnessLevel: profile?.fitnessLevel ?? "beginner",
      totalWorkoutsTracked: profile?.totalWorkoutsTracked ?? 0,
      lastCalibrationDate: profile?.lastCalibrationDate ?? null,
      userWeight: userProfile?.weight ?? null,
      userAge: userProfile?.age ?? null,
      userSex: userProfile?.sex ?? null,
    };
  },
});

/**
 * Increment total workouts tracked after a committed canonical workout action.
 * Raw inserts and calorie-feedback submissions must not call this.
 */
export const incrementWorkoutCount = internalMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("user_metabolic_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      await ctx.db.patch(profile._id, {
        totalWorkoutsTracked: profile.totalWorkoutsTracked + 1,
      });
    } else {
      await ctx.db.insert("user_metabolic_profiles", {
        userId,
        metabolicFactor: 1.0,
        fitnessLevel: "beginner",
        totalWorkoutsTracked: 1,
      });
    }
  },
});

/** Rebuild the calibration sample count from active workout source rows. */
export async function recomputeWorkoutCountForUser(ctx: any, userId: string) {
  const workouts = (await ctx.db
    .query("workouts")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
    .collect()).filter((workout: any) => !workout.undoneAt);
  const count = workouts.length;
  const profile = await ctx.db
    .query("user_metabolic_profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();

  if (profile) {
    await ctx.db.patch(profile._id, { totalWorkoutsTracked: count });
  } else if (count > 0) {
    await ctx.db.insert("user_metabolic_profiles", {
      userId,
      metabolicFactor: 1.0,
      fitnessLevel: "beginner",
      totalWorkoutsTracked: count,
    });
  }
  return count;
}

export { CALCULATION_VERSION };

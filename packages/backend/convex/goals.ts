import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { adjustCaloriesForDay, type NutritionPlan } from "./tdee_engine";
import { resolvePlanForDayAdjustment } from "./plan_resolve";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

const DEFAULTS = { calorieGoal: 2400, proteinGoal: 180, carbGoal: 280, fatGoal: 80 };

export const getDailyGoal = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const goal = await ctx.db
      .query("daily_goals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
    return goal ?? { ...DEFAULTS };
  },
});

export const upsertDailyGoal = mutation({
  args: {
    date: v.string(),
    calorieGoal: v.optional(v.number()),
    proteinGoal: v.optional(v.number()),
    carbGoal: v.optional(v.number()),
    fatGoal: v.optional(v.number()),
  },
  handler: async (ctx, { date, ...goals }) => {
    for (const [k, v] of Object.entries(goals)) {
      if (v !== undefined && v <= 0) {
        throw new Error(`Invalid ${k}: must be > 0`);
      }
    }
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("daily_goals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();

    const merged = {
      calorieGoal: goals.calorieGoal ?? existing?.calorieGoal ?? DEFAULTS.calorieGoal,
      proteinGoal: goals.proteinGoal ?? existing?.proteinGoal ?? DEFAULTS.proteinGoal,
      carbGoal: goals.carbGoal ?? existing?.carbGoal ?? DEFAULTS.carbGoal,
      fatGoal: goals.fatGoal ?? existing?.fatGoal ?? DEFAULTS.fatGoal,
    };

    if (existing) {
      await ctx.db.patch(existing._id, merged);
    } else {
      await ctx.db.insert("daily_goals", { userId, date, ...merged });
    }
  },
});

export const getDailyGoalForContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    return ctx.db
      .query("daily_goals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
  },
});

// ─── Dynamic per-day adjustment (Task 19) ────────────────────────────────────

function parsePlan(planBreakdown?: string | null): NutritionPlan | null {
  if (!planBreakdown) return null;
  try {
    const p = JSON.parse(planBreakdown);
    return typeof p?.plannedDailyEAT === "number" ? (p as NutritionPlan) : null;
  } catch {
    return null;
  }
}

/**
 * Recompute a day's goals from the user's base plan + that day's actual workout
 * burn (sum of logged caloriesBurned). Idempotent: always derived from the base
 * plan, never incrementally — so re-running is safe. Returns the adjustment note
 * or null if the user has no computed plan yet.
 */
export async function applyDayAdjustment(ctx: any, userId: string, date: string) {
  const profile = await ctx.db
    .query("user_profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const plan = parsePlan(profile?.planBreakdown);
  if (!plan) return null;
  const resolvedPlan = resolvePlanForDayAdjustment(plan, profile ?? {});

  const workouts = (await ctx.db
    .query("workouts")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .collect()).filter((workout: any) => !workout.undoneAt);
  const burn = workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);
  const adj = adjustCaloriesForDay(resolvedPlan, burn);

  const existing = await ctx.db
    .query("daily_goals")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .first();
  const goals = {
    calorieGoal: adj.calorieGoal,
    proteinGoal: adj.proteinGoal,
    carbGoal: adj.carbGoal,
    fatGoal: adj.fatGoal,
  };
  if (existing) await ctx.db.patch(existing._id, goals);
  else await ctx.db.insert("daily_goals", { userId, date, ...goals });
  return adj;
}

/** Called after a workout is logged (client or server) to refresh the day plan. */
export const syncDayAdjustment = mutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return applyDayAdjustment(ctx, userId, date);
  },
});

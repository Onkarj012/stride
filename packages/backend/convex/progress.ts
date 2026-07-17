import { query } from "./_generated/server";
import { v } from "convex/values";
import { adjustCaloriesForDay } from "./tdee_engine";
import { FALLBACK_TARGETS, parseStoredPlan, resolvePlanForDayAdjustment } from "./plan_resolve";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const getProgress = query({
  args: { days: v.optional(v.number()), today: v.optional(v.string()) },
  handler: async (ctx, { days, today: todayArg }) => {
    const userId = await requireUserId(ctx);
    const numDays = days ?? 7;

    const endDate = todayArg ?? new Date().toISOString().split("T")[0];
    const startDate = new Date(new Date(endDate).getTime() - (numDays - 1) * 86400000)
      .toISOString()
      .split("T")[0];

    const [allMeals, allWorkouts, allGoals, profile] = await Promise.all([
      ctx.db
        .query("meals")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
        .filter((q) => q.lte(q.field("date"), endDate))
        .collect(),
      ctx.db
        .query("workouts")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
        .filter((q) => q.lte(q.field("date"), endDate))
        .collect(),
      ctx.db
        .query("daily_goals")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
        .filter((q) => q.lte(q.field("date"), endDate))
        .collect(),
      ctx.db
        .query("user_profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    ]);

    const mealsByDate = new Map<string, { cals: number; prot: number; carbs: number; fat: number }>();
    for (const m of allMeals) {
      const e = mealsByDate.get(m.date) ?? { cals: 0, prot: 0, carbs: 0, fat: 0 };
      mealsByDate.set(m.date, { cals: e.cals + m.calories, prot: e.prot + m.protein, carbs: e.carbs + m.carbs, fat: e.fat + m.fat });
    }

    const workoutsByDate = new Map<string, number>();
    const burnByDate = new Map<string, number>();
    for (const w of allWorkouts) {
      workoutsByDate.set(w.date, (workoutsByDate.get(w.date) ?? 0) + 1);
      burnByDate.set(w.date, (burnByDate.get(w.date) ?? 0) + (w.caloriesBurned ?? 0));
    }

    const goalsByDate = new Map<string, number>();
    for (const g of allGoals) {
      goalsByDate.set(g.date, g.calorieGoal);
    }

    // Days without a stored daily_goals row get a live-computed goal from the
    // user's plan (same resolution as insights.getTodayBrief) instead of a
    // hardcoded constant.
    const parsed = parseStoredPlan(profile?.planBreakdown);
    const plan = parsed ? resolvePlanForDayAdjustment(parsed, profile ?? {}) : null;
    const fallbackGoalForDay = (date: string): number => {
      if (plan) return adjustCaloriesForDay(plan, burnByDate.get(date) ?? 0).calorieGoal;
      return profile?.calorieTarget ?? FALLBACK_TARGETS.calories;
    };

    const result = [];
    const endMs = new Date(endDate + "T00:00:00").getTime();
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(endMs - i * 86400000);
      const date = d.toISOString().split("T")[0];
      const m = mealsByDate.get(date);
      result.push({
        date,
        dayLabel: DAY_NAMES[d.getDay()],
        calories: Math.round(m?.cals ?? 0),
        protein: Math.round(m?.prot ?? 0),
        carbs: Math.round(m?.carbs ?? 0),
        fat: Math.round(m?.fat ?? 0),
        workouts: workoutsByDate.get(date) ?? 0,
        goal: goalsByDate.get(date) ?? fallbackGoalForDay(date),
      });
    }
    return result;
  },
});

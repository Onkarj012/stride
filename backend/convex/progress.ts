import { query } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const getProgress = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const userId = await requireUserId(ctx);
    const numDays = days ?? 7;

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - (numDays - 1) * 86400000)
      .toISOString()
      .split("T")[0];

    const [allMeals, allWorkouts, allGoals] = await Promise.all([
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
    ]);

    const mealsByDate = new Map<string, { cals: number; prot: number }>();
    for (const m of allMeals) {
      const e = mealsByDate.get(m.date) ?? { cals: 0, prot: 0 };
      mealsByDate.set(m.date, { cals: e.cals + m.calories, prot: e.prot + m.protein });
    }

    const workoutsByDate = new Map<string, number>();
    for (const w of allWorkouts) {
      workoutsByDate.set(w.date, (workoutsByDate.get(w.date) ?? 0) + 1);
    }

    const goalsByDate = new Map<string, number>();
    for (const g of allGoals) {
      goalsByDate.set(g.date, g.calorieGoal);
    }

    const result = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const date = d.toISOString().split("T")[0];
      const m = mealsByDate.get(date);
      result.push({
        date,
        dayLabel: DAY_NAMES[d.getDay()],
        calories: Math.round(m?.cals ?? 0),
        protein: Math.round(m?.prot ?? 0),
        workouts: workoutsByDate.get(date) ?? 0,
        goal: goalsByDate.get(date) ?? 2400,
      });
    }
    return result;
  },
});

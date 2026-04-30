import { v } from "convex/values";
import { query } from "./_generated/server";
import { getUserFromToken } from "./auth";

export const getHistory = query({
  args: { token: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const days = args.days || 7;
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const result = [];
    for (const date of dates) {
      const meals = await ctx.db
        .query("meals")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .collect();

      const workouts = await ctx.db
        .query("workouts")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .collect();

      const goals = await ctx.db
        .query("dailyGoals")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .unique();

      const totalCals = meals.reduce((s, m) => s + m.calories, 0);
      const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
      const totalCarbs = meals.reduce((s, m) => s + m.carbs, 0);
      const totalFat = meals.reduce((s, m) => s + m.fat, 0);

      result.push({
        date,
        dayLabel: new Date(date).toLocaleDateString("en-US", { weekday: "narrow" }),
        calories: totalCals,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        workouts: workouts.length,
        goal: goals?.calorieGoal || 2400,
      });
    }

    return result;
  },
});

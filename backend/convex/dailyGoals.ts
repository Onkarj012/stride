import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserFromToken } from "./auth";

export const get = query({
  args: { token: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const date = args.date || new Date().toISOString().split("T")[0];
    const goals = await ctx.db
      .query("dailyGoals")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
      .unique();

    return goals;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    calorieGoal: v.optional(v.number()),
    proteinGoal: v.optional(v.number()),
    carbGoal: v.optional(v.number()),
    fatGoal: v.optional(v.number()),
    waterGoal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const goals = await ctx.db
      .query("dailyGoals")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .unique();

    const updates: any = {};
    if (args.calorieGoal !== undefined) updates.calorieGoal = args.calorieGoal;
    if (args.proteinGoal !== undefined) updates.proteinGoal = args.proteinGoal;
    if (args.carbGoal !== undefined) updates.carbGoal = args.carbGoal;
    if (args.fatGoal !== undefined) updates.fatGoal = args.fatGoal;
    if (args.waterGoal !== undefined) updates.waterGoal = args.waterGoal;

    if (goals) {
      await ctx.db.patch(goals._id, updates);
      return goals._id;
    } else {
      return await ctx.db.insert("dailyGoals", {
        userId: user._id,
        date: args.date,
        calorieGoal: updates.calorieGoal || 2400,
        proteinGoal: updates.proteinGoal || 180,
        carbGoal: updates.carbGoal || 280,
        fatGoal: updates.fatGoal || 80,
        waterGoal: updates.waterGoal || 3.5,
      });
    }
  },
});

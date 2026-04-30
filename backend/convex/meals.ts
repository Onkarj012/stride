import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserFromToken } from "./auth";

export const list = query({
  args: { token: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const date = args.date || new Date().toISOString().split("T")[0];
    return await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    time: v.string(),
    date: v.optional(v.string()),
    aiSuggestion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const date = args.date || new Date().toISOString().split("T")[0];
    return await ctx.db.insert("meals", {
      userId: user._id,
      name: args.name,
      calories: args.calories,
      protein: args.protein,
      carbs: args.carbs,
      fat: args.fat,
      time: args.time,
      date,
      aiSuggestion: args.aiSuggestion,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("meals"),
    name: v.optional(v.string()),
    calories: v.optional(v.number()),
    protein: v.optional(v.number()),
    carbs: v.optional(v.number()),
    fat: v.optional(v.number()),
    time: v.optional(v.string()),
    aiSuggestion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const meal = await ctx.db.get(args.id);
    if (!meal || meal.userId !== user._id) throw new Error("Not found");

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.calories !== undefined) updates.calories = args.calories;
    if (args.protein !== undefined) updates.protein = args.protein;
    if (args.carbs !== undefined) updates.carbs = args.carbs;
    if (args.fat !== undefined) updates.fat = args.fat;
    if (args.time !== undefined) updates.time = args.time;
    if (args.aiSuggestion !== undefined) updates.aiSuggestion = args.aiSuggestion;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("meals") },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const meal = await ctx.db.get(args.id);
    if (!meal || meal.userId !== user._id) throw new Error("Not found");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

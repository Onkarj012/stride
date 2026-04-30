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
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    sets: v.string(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.string(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const date = args.date || new Date().toISOString().split("T")[0];
    return await ctx.db.insert("workouts", {
      userId: user._id,
      name: args.name,
      sets: args.sets,
      reps: args.reps,
      weight: args.weight,
      duration: args.duration,
      intensity: args.intensity,
      date,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("workouts"),
    name: v.optional(v.string()),
    sets: v.optional(v.string()),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const workout = await ctx.db.get(args.id);
    if (!workout || workout.userId !== user._id) throw new Error("Not found");

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.sets !== undefined) updates.sets = args.sets;
    if (args.reps !== undefined) updates.reps = args.reps;
    if (args.weight !== undefined) updates.weight = args.weight;
    if (args.duration !== undefined) updates.duration = args.duration;
    if (args.intensity !== undefined) updates.intensity = args.intensity;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("workouts") },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const workout = await ctx.db.get(args.id);
    if (!workout || workout.userId !== user._id) throw new Error("Not found");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

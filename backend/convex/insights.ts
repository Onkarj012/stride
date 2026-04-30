import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserFromToken } from "./auth";

export const getDailyInsights = query({
  args: { token: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const date = args.date || new Date().toISOString().split("T")[0];
    const insights = await ctx.db
      .query("dailyInsights")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
      .unique();

    return insights;
  },
});

export const createDailyInsight = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    insights: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    return await ctx.db.insert("dailyInsights", {
      userId: user._id,
      date: args.date,
      insights: args.insights,
      createdAt: Date.now(),
    });
  },
});

export const deleteDailyInsight = mutation({
  args: { token: v.string(), id: v.id("dailyInsights") },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const insight = await ctx.db.get(args.id);
    if (!insight || insight.userId !== user._id) throw new Error("Not found");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const getWeeklySummary = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now.setDate(diff)).toISOString().split("T")[0];

    const summary = await ctx.db
      .query("weeklySummaries")
      .withIndex("by_user_week", (q) => q.eq("userId", user._id).eq("weekStart", weekStart))
      .unique();

    return summary;
  },
});

export const createWeeklySummary = mutation({
  args: {
    token: v.string(),
    weekStart: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    return await ctx.db.insert("weeklySummaries", {
      userId: user._id,
      weekStart: args.weekStart,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});

export const deleteWeeklySummary = mutation({
  args: { token: v.string(), id: v.id("weeklySummaries") },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const summary = await ctx.db.get(args.id);
    if (!summary || summary.userId !== user._id) throw new Error("Not found");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

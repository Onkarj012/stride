import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  return monday.toISOString().split("T")[0];
}

export const getDailyInsights = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("insights")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
    if (!row) return { insights: [] };
    try {
      return { insights: JSON.parse(row.content) as string[] };
    } catch {
      return { insights: [row.content] };
    }
  },
});

export const getWeeklySummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const weekStart = currentWeekStart();
    const row = await ctx.db
      .query("weekly_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStart", weekStart))
      .first();
    if (!row) return null;
    return { content: row.content };
  },
});

export const saveInsights = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    insights: v.array(v.string()),
  },
  handler: async (ctx, { userId, date, insights }) => {
    const content = JSON.stringify(insights);
    const existing = await ctx.db
      .query("insights")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content });
    } else {
      await ctx.db.insert("insights", { userId, date, content });
    }
  },
});

export const saveWeeklySummary = internalMutation({
  args: {
    userId: v.string(),
    weekStart: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { userId, weekStart, content }) => {
    const existing = await ctx.db
      .query("weekly_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStart", weekStart))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content });
    } else {
      await ctx.db.insert("weekly_summaries", { userId, weekStart, content });
    }
  },
});

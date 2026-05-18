import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const ensureUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { name, email }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const clerkId = identity.subject;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existing) return existing._id;

    return ctx.db.insert("users", { clerkId, name, email });
  },
});

export const clearAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const byUserDate = [
      "meals", "workouts", "daily_goals", "insights",
      "water_logs", "sleep_logs", "mood_logs", "steps_logs",
    ] as const;
    for (const table of byUserDate) {
      const rows = await (ctx.db.query(table as any) as any)
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
        .collect();
      await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    }

    const byUser = [
      "chat_messages", "chat_sessions", "user_behavior", "nudges",
      "recipes", "food_memory", "workout_memory", "user_ingredients",
      "user_profiles", "user_settings", "user_metabolic_profiles", "calorie_feedback",
    ] as const;
    for (const table of byUser) {
      const rows = await (ctx.db.query(table as any) as any)
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .collect();
      await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    }

    // weekly_summaries uses by_user_week index
    const weeklies = await ctx.db.query("weekly_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(weeklies.map((r) => ctx.db.delete(r._id)));

    // user_gamification
    const gam = await ctx.db.query("user_gamification").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (gam) await ctx.db.delete(gam._id);
  },
});

export const exportAllData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const [
      meals, workouts, daily_goals, insights,
      water_logs, sleep_logs, mood_logs, steps_logs,
    ] = await Promise.all([
      ctx.db.query("meals").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("workouts").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("daily_goals").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("insights").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("water_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("sleep_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("mood_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("steps_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
    ]);

    const [
      weekly_summaries, chat_sessions, recipes,
      food_memory, workout_memory, user_ingredients,
      user_profiles, user_gamification,
      chat_messages, user_behavior, nudges,
      user_settings, user_metabolic_profiles, calorie_feedback,
    ] = await Promise.all([
      ctx.db.query("weekly_summaries").withIndex("by_user_week", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("chat_sessions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("food_memory").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("workout_memory").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_ingredients").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_gamification").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("chat_messages").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_behavior").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("nudges").withIndex("by_user_status", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_metabolic_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("calorie_feedback").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);

    return {
      exportedAt: Date.now(),
      meals, workouts, daily_goals, insights,
      water_logs, sleep_logs, mood_logs, steps_logs,
      weekly_summaries, chat_sessions, chat_messages, recipes,
      food_memory, workout_memory, user_ingredients,
      user_profiles, user_behavior, nudges,
      user_settings, user_metabolic_profiles, calorie_feedback,
      gamification: user_gamification ?? null,
    };
  },
});

import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/** Restart ledger tables (plan 007) that clearAllData empties in scheduled batches. */
const LEDGER_TABLES = ["entries", "day_totals", "weights"] as const;

/** Rows deleted per clearLedgerRows transaction. */
export const CLEAR_LEDGER_BATCH = 200;

/** Reads up to one batch of a user's rows from one ledger table. */
async function ledgerBatch(ctx: MutationCtx, table: (typeof LEDGER_TABLES)[number], userId: string) {
  switch (table) {
    case "entries":
      return await ctx.db.query("entries").withIndex("by_userId_and_localDate_and_status", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "day_totals":
      return await ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "weights":
      return await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
  }
}

/** Deletes one batch of a user's ledger rows and schedules itself until every ledger table is empty for them. */
export const clearLedgerRows = internalMutation({
  args: { userId: v.string(), tableIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, tableIndex }) => {
    const table = LEDGER_TABLES[tableIndex];
    if (table === undefined) return null;
    const rows = await ledgerBatch(ctx, table, userId);
    for (const row of rows) await ctx.db.delete(row._id);
    const next = rows.length === CLEAR_LEDGER_BATCH ? tableIndex : tableIndex + 1;
    if (next < LEDGER_TABLES.length) await ctx.scheduler.runAfter(0, internal.users.clearLedgerRows, { userId, tableIndex: next });
    return null;
  },
});

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

    if (existing) {
      if (existing.name !== name) await ctx.db.patch(existing._id, { name });
      return existing._id;
    }

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
      "weight_logs", "check_in_answers", "check_in_llm_questions",
    ] as const;
    for (const table of byUserDate) {
      const rows = await (ctx.db.query(table as any) as any)
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
        .collect();
      await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    }

    const byUser = [
      "chat_messages", "chat_sessions", "user_behavior",
      "recipes", "food_memory", "workout_memory", "user_ingredients",
      "user_profiles", "user_settings", "user_metabolic_profiles", "calorie_feedback",
      "check_in_template_settings",
    ] as const;
    for (const table of byUser) {
      const rows = await (ctx.db.query(table as any) as any)
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .collect();
      await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    }

    // nudges only has by_user_status, whose userId prefix covers every status.
    const nudges = await ctx.db.query("nudges")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(nudges.map((r) => ctx.db.delete(r._id)));

    // weekly_summaries uses by_user_week index
    const weeklies = await ctx.db.query("weekly_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(weeklies.map((r) => ctx.db.delete(r._id)));

    // user_gamification
    const gam = await ctx.db.query("user_gamification").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (gam) await ctx.db.delete(gam._id);

    // Ledger rows grow with every revision, so they go in scheduled batches.
    await ctx.scheduler.runAfter(0, internal.users.clearLedgerRows, { userId, tableIndex: 0 });
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
      weight_logs, check_in_answers, check_in_llm_questions,
    ] = await Promise.all([
      ctx.db.query("meals").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("workouts").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("daily_goals").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("insights").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("water_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("sleep_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("mood_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("steps_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("weight_logs").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("check_in_answers").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("check_in_llm_questions").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
    ]);

    const [
      weekly_summaries, chat_sessions, recipes,
      food_memory, workout_memory, user_ingredients,
      user_profiles, user_gamification,
      chat_messages, user_behavior, nudges,
      user_settings, user_metabolic_profiles, calorie_feedback,
      check_in_template_settings,
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
      ctx.db.query("check_in_template_settings").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);

    const [entries, day_totals, weights] = await Promise.all([
      ctx.db.query("entries").withIndex("by_userId_and_localDate_and_status", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).collect(),
    ]);

    return {
      exportedAt: Date.now(),
      meals, workouts, daily_goals, insights,
      water_logs, sleep_logs, mood_logs, steps_logs,
      weight_logs, check_in_answers, check_in_llm_questions, check_in_template_settings,
      weekly_summaries, chat_sessions, chat_messages, recipes,
      food_memory, workout_memory, user_ingredients,
      user_profiles, user_behavior, nudges,
      user_settings, user_metabolic_profiles, calorie_feedback,
      gamification: user_gamification ?? null,
      entries, day_totals, weights,
    };
  },
});

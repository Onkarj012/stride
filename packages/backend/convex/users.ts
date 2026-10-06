import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/** Per-user restart tables that clearAllData empties in scheduled batches. Owned foods go last, after the rows that point at them. */
const LEDGER_TABLES = [
  "entries",
  "day_totals",
  "weights",
  "messages",
  "chats",
  "drafts",
  "food_links",
  "user_measures",
  "sets",
  "workout_sessions",
  "tdee_snapshots",
  "foods",
] as const;
type LedgerTable = (typeof LEDGER_TABLES)[number];

/** Rows deleted per clearLedgerRows transaction. */
export const CLEAR_LEDGER_BATCH = 200;
/** Messages deleted per clearLedgerRows transaction. Smaller because a message carries tool-call JSON. */
export const CLEAR_MESSAGE_BATCH = 100;

/** Reads up to one batch of a user's rows from one table other than messages. Foods are only rows the user owns. */
async function ledgerBatch(ctx: MutationCtx, table: Exclude<LedgerTable, "messages">, userId: string) {
  switch (table) {
    case "entries":
      return await ctx.db.query("entries").withIndex("by_userId_and_localDate_and_status", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "day_totals":
      return await ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "weights":
      return await ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "chats":
      return await ctx.db.query("chats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "drafts":
      return await ctx.db.query("drafts").withIndex("by_userId_and_status", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "food_links":
      return await ctx.db.query("food_links").withIndex("by_userId_and_status_and_key", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "user_measures":
      return await ctx.db.query("user_measures").withIndex("by_userId_and_measure", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "sets":
      return await ctx.db.query("sets").withIndex("by_userId_and_exerciseId_and_status", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "workout_sessions":
      return await ctx.db.query("workout_sessions").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "tdee_snapshots":
      return await ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    case "foods":
      return await ctx.db.query("foods").withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId)).take(CLEAR_LEDGER_BATCH);
  }
}

/** Deletes up to one batch of a user's rows from one table, with the files their messages hold. True when more may remain. */
async function clearBatch(ctx: MutationCtx, table: LedgerTable, userId: string): Promise<boolean> {
  if (table === "messages") {
    const rows = await ctx.db.query("messages").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId)).take(CLEAR_MESSAGE_BATCH);
    for (const row of rows) {
      for (const { storageId } of row.attachments) {
        // The file may already be gone, and storage.delete throws on a missing id.
        if ((await ctx.db.system.get("_storage", storageId)) !== null) await ctx.storage.delete(storageId);
      }
      await ctx.db.delete("messages", row._id);
    }
    return rows.length === CLEAR_MESSAGE_BATCH;
  }
  const rows = await ledgerBatch(ctx, table, userId);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length === CLEAR_LEDGER_BATCH;
}

/** Most rows exportAllData returns from each restart table other than messages. */
export const EXPORT_ROW_LIMIT = 1000;
/** Most messages exportAllData returns. Smaller because a message carries tool-call JSON. */
export const EXPORT_MESSAGE_LIMIT = 200;

/** Keeps the first `limit` rows of a `take(limit + 1)` read and says whether any were left out. */
function capped<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/** The user's in-progress ledger clear marker, or null when no clear is running. */
async function pendingLedgerClear(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db.query("ledger_clears").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
}

/** Throws while clearAllData is still deleting the user's rows, so no new ledger, chat, draft or food write survives it half-done. */
export async function assertLedgerWritable(ctx: MutationCtx, userId: string): Promise<void> {
  if ((await pendingLedgerClear(ctx, userId)) !== null) throw new Error("Your data is being cleared. Try again in a moment.");
}

/** Deletes one batch of a user's rows and schedules itself until every listed table is empty, then drops the marker. */
export const clearLedgerRows = internalMutation({
  args: { userId: v.string(), tableIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, tableIndex }) => {
    const table = LEDGER_TABLES[tableIndex];
    const more = table === undefined ? false : await clearBatch(ctx, table, userId);
    const next = more ? tableIndex : tableIndex + 1;
    if (next < LEDGER_TABLES.length) {
      await ctx.scheduler.runAfter(0, internal.users.clearLedgerRows, { userId, tableIndex: next });
      return null;
    }
    const marker = await pendingLedgerClear(ctx, userId);
    if (marker !== null) await ctx.db.delete(marker._id);
    return null;
  },
});

/** True while the caller's ledger rows are still being cleared. Clients wait for false before logging again. */
export const ledgerClearPending = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return (await pendingLedgerClear(ctx, identity.subject)) !== null;
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

    // Restart tables grow without bound, so they go in scheduled batches. The marker blocks writes to them until done.
    if ((await pendingLedgerClear(ctx, userId)) === null) {
      await ctx.db.insert("ledger_clears", { userId });
      await ctx.scheduler.runAfter(0, internal.users.clearLedgerRows, { userId, tableIndex: 0 });
    }
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

    // These tables grow without bound, so each read is capped and `truncated` names the ones that had more rows.
    const take = EXPORT_ROW_LIMIT + 1;
    const [chats, messages, drafts, food_links, foods, user_measures, workout_sessions, sets, tdee_snapshots] = await Promise.all([
      ctx.db.query("chats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("messages").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId)).take(EXPORT_MESSAGE_LIMIT + 1),
      ctx.db.query("drafts").withIndex("by_userId_and_status", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("food_links").withIndex("by_userId_and_status_and_key", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("foods").withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId)).take(take),
      ctx.db.query("user_measures").withIndex("by_userId_and_measure", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("workout_sessions").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("sets").withIndex("by_userId_and_exerciseId_and_status", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("tdee_snapshots").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).take(take),
    ]);
    const restart = {
      chats: capped(chats, EXPORT_ROW_LIMIT),
      messages: capped(messages, EXPORT_MESSAGE_LIMIT),
      drafts: capped(drafts, EXPORT_ROW_LIMIT),
      food_links: capped(food_links, EXPORT_ROW_LIMIT),
      foods: capped(foods, EXPORT_ROW_LIMIT),
      user_measures: capped(user_measures, EXPORT_ROW_LIMIT),
      workout_sessions: capped(workout_sessions, EXPORT_ROW_LIMIT),
      sets: capped(sets, EXPORT_ROW_LIMIT),
      tdee_snapshots: capped(tdee_snapshots, EXPORT_ROW_LIMIT),
    };

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
      chats: restart.chats.rows,
      messages: restart.messages.rows,
      drafts: restart.drafts.rows,
      food_links: restart.food_links.rows,
      foods: restart.foods.rows,
      user_measures: restart.user_measures.rows,
      workout_sessions: restart.workout_sessions.rows,
      sets: restart.sets.rows,
      tdee_snapshots: restart.tdee_snapshots.rows,
      truncated: {
        chats: restart.chats.truncated,
        messages: restart.messages.truncated,
        drafts: restart.drafts.truncated,
        food_links: restart.food_links.truncated,
        foods: restart.foods.truncated,
        user_measures: restart.user_measures.truncated,
        workout_sessions: restart.workout_sessions.truncated,
        sets: restart.sets.truncated,
        tdee_snapshots: restart.tdee_snapshots.truncated,
      },
    };
  },
});

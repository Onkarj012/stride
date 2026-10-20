import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";

/** Per-user restart tables that clearAllData empties in scheduled batches. Owned foods go last, after the rows that point at them. */
const LEDGER_TABLES = [
  "entries",
  "day_totals",
  "weights",
  "messages",
  "chats",
  "drafts",
  "uploads",
  "food_links",
  "food_link_events",
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

/** Reads one batch of rows without storage files; foods include only rows the user owns. */
async function ledgerBatch(ctx: MutationCtx, table: Exclude<LedgerTable, "messages" | "uploads">, userId: string) {
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
    case "food_link_events":
      return await ctx.db.query("food_link_events").withIndex("by_userId_and_key_and_undoneAt", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
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

/** Deletes one batch of rows and their attachment or upload files; true when another batch may remain. */
async function clearBatch(ctx: MutationCtx, table: LedgerTable, userId: string): Promise<boolean> {
  if (table === "uploads") {
    const rows = await ctx.db.query("uploads").withIndex("by_userId", (q) => q.eq("userId", userId)).take(CLEAR_LEDGER_BATCH);
    for (const row of rows) {
      if ((await ctx.db.system.get("_storage", row.storageId)) !== null) await ctx.storage.delete(row.storageId);
      await ctx.db.delete("uploads", row._id);
    }
    return rows.length === CLEAR_LEDGER_BATCH;
  }
  if (table === "messages") {
    const rows = await ctx.db.query("messages").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId)).take(CLEAR_MESSAGE_BATCH);
    for (const row of rows) {
      for (const { storageId } of row.attachments) {
        // The file may already be gone, and storage.delete throws on a missing id.
        if ((await ctx.db.system.get("_storage", storageId)) !== null) await ctx.storage.delete(storageId);
      }
      // A reply still streaming keeps its text in a live row; once the message is gone no ending would delete it.
      if (row.status === "streaming") {
        const stream = await ctx.db.query("reply_streams").withIndex("by_messageId", (q) => q.eq("messageId", row._id)).unique();
        if (stream !== null) await ctx.db.delete("reply_streams", stream._id);
      }
      await ctx.db.delete("messages", row._id);
    }
    return rows.length === CLEAR_MESSAGE_BATCH;
  }
  if (table === "foods") {
    // A food's portion rows go first, so none is left pointing at a deleted food.
    const rows = await ctx.db.query("foods").withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId)).take(CLEAR_LEDGER_BATCH);
    let kept = false;
    for (const row of rows) {
      const portions = await ctx.db
        .query("food_portions")
        .withIndex("by_foodId_and_description", (q) => q.eq("foodId", row._id))
        .take(CLEAR_LEDGER_BATCH);
      for (const portion of portions) await ctx.db.delete(portion._id);
      // A food with more portions than one batch waits for a later pass.
      if (portions.length < CLEAR_LEDGER_BATCH) await ctx.db.delete(row._id);
      else kept = true;
    }
    return kept || rows.length === CLEAR_LEDGER_BATCH;
  }
  const rows = await ledgerBatch(ctx, table, userId);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length === CLEAR_LEDGER_BATCH;
}

/** Most rows exportAllData returns from each restart table other than messages. */
export const EXPORT_ROW_LIMIT = 1000;
/** Most messages exportAllData returns. Smaller because a message carries tool-call JSON. */
export const EXPORT_MESSAGE_LIMIT = 200;

/** The portion rows of the given foods, up to one shared export limit. Says whether rows were left out. */
async function portionsOfFoods(
  ctx: QueryCtx,
  foodIds: readonly Id<"foods">[],
): Promise<{ rows: Doc<"food_portions">[]; truncated: boolean }> {
  const rows: Doc<"food_portions">[] = [];
  for (const foodId of foodIds) {
    const room = EXPORT_ROW_LIMIT - rows.length;
    const found = await ctx.db
      .query("food_portions")
      .withIndex("by_foodId_and_description", (q) => q.eq("foodId", foodId))
      .take(room + 1);
    rows.push(...found.slice(0, room));
    if (found.length > room) return { rows, truncated: true };
  }
  return { rows, truncated: false };
}

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
  if ((await pendingLedgerClear(ctx, userId)) !== null) throw new ConvexError({ code: "LEDGER_CLEARING", message: "Your data is being cleared. Try again in a moment." });
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
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    return (await pendingLedgerClear(ctx, identity.subject)) !== null;
  },
});

/** Deletes every row the user owns in the legacy tables, and schedules the restart-table clear. */
async function clearUserData(ctx: MutationCtx, userId: string): Promise<void> {
  const byUserDate = [
    "daily_goals", "check_in_answers", "check_in_llm_questions",
  ] as const;
  for (const table of byUserDate) {
    const rows = await (ctx.db.query(table as any) as any)
      .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
      .collect();
    await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
  }

  const byUser = [
    "user_behavior", "recipes", "workout_memory", "user_ingredients",
    "user_profiles", "user_settings", "user_metabolic_profiles",
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

  // user_api_keys has only by_userId_and_provider, whose userId prefix covers every provider.
  const apiKeys = await ctx.db.query("user_api_keys")
    .withIndex("by_userId_and_provider", (q) => q.eq("userId", userId))
    .collect();
  await Promise.all(apiKeys.map((r) => ctx.db.delete(r._id)));

  // user_gamification
  const gam = await ctx.db.query("user_gamification").withIndex("by_user", (q) => q.eq("userId", userId)).first();
  if (gam) await ctx.db.delete(gam._id);

  // Restart tables grow without bound, so they go in scheduled batches. The marker blocks writes to them until done.
  if ((await pendingLedgerClear(ctx, userId)) === null) {
    await ctx.db.insert("ledger_clears", { userId });
    await ctx.scheduler.runAfter(0, internal.users.clearLedgerRows, { userId, tableIndex: 0 });
  }
}

/** Clears the caller's data and keeps their account. */
export const clearAllData = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    await clearUserData(ctx, identity.subject);
    return null;
  },
});

/** Clears one user's data and their users row. Only deleteAccount calls it. */
export const clearUserDataInternal = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await clearUserData(ctx, userId);
    const row = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", userId)).unique();
    if (row !== null) await ctx.db.delete(row._id);
    return null;
  },
});

/** Clears the caller's data, then deletes their Clerk user. A Clerk failure keeps the sign-in, so a retry clears nothing new and finishes the delete. */
export const deleteAccount = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    const userId = identity.subject;
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) throw new ConvexError({ code: "ACCOUNT_DELETE_FAILED", message: "CLERK_SECRET_KEY is not set" });

    await ctx.runMutation(internal.users.clearUserDataInternal, { userId });

    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    // 404 means Clerk already removed the user.
    if (res.status !== 200 && res.status !== 404) throw new ConvexError({ code: "ACCOUNT_DELETE_FAILED", message: `Clerk delete failed (${res.status})` });
    // A second sweep catches rows another signed-in device wrote after the first clear finished but before Clerk answered.
    await ctx.runMutation(internal.users.clearUserDataInternal, { userId });
    return null;
  },
});

export const exportAllData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    const userId = identity.subject;

    const [daily_goals, check_in_answers, check_in_llm_questions] = await Promise.all([
      ctx.db.query("daily_goals").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("check_in_answers").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("check_in_llm_questions").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
    ]);

    const [
      recipes, workout_memory, user_ingredients,
      user_profiles, user_gamification,
      user_behavior, nudges,
      user_settings, user_metabolic_profiles,
    ] = await Promise.all([
      ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("workout_memory").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_ingredients").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_gamification").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("user_behavior").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("nudges").withIndex("by_user_status", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("user_metabolic_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);

    const [entries, day_totals, weights] = await Promise.all([
      ctx.db.query("entries").withIndex("by_userId_and_localDate_and_status", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("weights").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId)).collect(),
    ]);

    // These tables grow without bound, so each read is capped and `truncated` names the ones that had more rows.
    const take = EXPORT_ROW_LIMIT + 1;
    const [chats, messages, drafts, food_links, food_link_events, foods, user_measures, workout_sessions, sets, tdee_snapshots] = await Promise.all([
      ctx.db.query("chats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("messages").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId)).take(EXPORT_MESSAGE_LIMIT + 1),
      ctx.db.query("drafts").withIndex("by_userId_and_status", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("food_links").withIndex("by_userId_and_status_and_key", (q) => q.eq("userId", userId)).take(take),
      ctx.db.query("food_link_events").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId)).take(take),
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
      food_link_events: capped(food_link_events, EXPORT_ROW_LIMIT),
      foods: capped(foods, EXPORT_ROW_LIMIT),
      user_measures: capped(user_measures, EXPORT_ROW_LIMIT),
      workout_sessions: capped(workout_sessions, EXPORT_ROW_LIMIT),
      sets: capped(sets, EXPORT_ROW_LIMIT),
      tdee_snapshots: capped(tdee_snapshots, EXPORT_ROW_LIMIT),
    };

    const portions = await portionsOfFoods(ctx, restart.foods.rows.map((food) => food._id));

    return {
      exportedAt: Date.now(),
      daily_goals, check_in_answers, check_in_llm_questions,
      recipes, workout_memory, user_ingredients,
      user_profiles, user_behavior, nudges,
      user_settings, user_metabolic_profiles,
      gamification: user_gamification ?? null,
      entries, day_totals, weights,
      chats: restart.chats.rows,
      messages: restart.messages.rows,
      drafts: restart.drafts.rows,
      food_links: restart.food_links.rows,
      food_link_events: restart.food_link_events.rows,
      foods: restart.foods.rows,
      food_portions: portions.rows,
      user_measures: restart.user_measures.rows,
      workout_sessions: restart.workout_sessions.rows,
      sets: restart.sets.rows,
      tdee_snapshots: restart.tdee_snapshots.rows,
      truncated: {
        chats: restart.chats.truncated,
        messages: restart.messages.truncated,
        drafts: restart.drafts.truncated,
        food_links: restart.food_links.truncated,
        food_link_events: restart.food_link_events.truncated,
        foods: restart.foods.truncated,
        food_portions: portions.truncated,
        user_measures: restart.user_measures.truncated,
        workout_sessions: restart.workout_sessions.truncated,
        sets: restart.sets.truncated,
        tdee_snapshots: restart.tdee_snapshots.truncated,
      },
    };
  },
});

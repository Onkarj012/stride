import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// WARNING: wipeLegacyLedger DELETES EVERY ROW OF THE TABLES BELOW FOR ALL USERS, IRREVERSIBLY. Owner runs it once by hand when slice 4 lands.

/** Pre-restart ledger tables: logs, the chat transcript ledger and data derived from them, including AI-estimated food_memory macros. Profiles, settings and caches stay. */
export const LEGACY_LEDGER_TABLES = [
  "meals",
  "workouts",
  "calorie_feedback",
  "water_logs",
  "sleep_logs",
  "mood_logs",
  "steps_logs",
  "weight_logs",
  "actionGroups",
  "actions",
  "action_telemetry",
  "chat_sessions",
  "chat_messages",
  "derived_state_versions",
  "insights",
  "weekly_summaries",
  "food_memory",
] as const;

/** Rows deleted per transaction. Small enough for chat_messages documents to stay inside read limits. */
export const WIPE_BATCH = 200;

/** Deletes one batch from the current legacy table and schedules itself until every listed table is empty. */
export const wipeLegacyLedger = internalMutation({
  args: { tableIndex: v.optional(v.number()) },
  returns: v.object({ table: v.union(v.string(), v.null()), deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ table: string | null; deleted: number; done: boolean }> => {
    const tableIndex = args.tableIndex ?? 0;
    const table = LEGACY_LEDGER_TABLES[tableIndex];
    if (table === undefined) return { table: null, deleted: 0, done: true };
    const rows = await ctx.db.query(table).take(WIPE_BATCH);
    for (const row of rows) await ctx.db.delete(table, row._id);
    const next = rows.length === WIPE_BATCH ? tableIndex : tableIndex + 1;
    const done = next >= LEGACY_LEDGER_TABLES.length;
    if (!done) await ctx.scheduler.runAfter(0, internal.wipe_legacy.wipeLegacyLedger, { tableIndex: next });
    console.log(`wipeLegacyLedger: deleted ${rows.length} from ${table}${done ? ", done" : ""}`);
    return { table, deleted: rows.length, done };
  },
});

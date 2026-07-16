import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { recordBehaviorRow } from "./behavior";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function writeRecoveryDomain(ctx: any, args: any, options: { emitBehavior?: boolean } = {}) {
  const date = args.date ?? todayDate();
  const time = args.time ?? new Date().toTimeString().slice(0, 5);
  let id: any;
  let previous: any = undefined;
  switch (args.kind) {
    case "water": {
      if (args.ml <= 0) throw new Error("ml must be positive");
      const waterRows = args.mode === "upsert"
        ? await ctx.db.query("water_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect()
        : [];
      const existing = waterRows.find((row: any) => !row.undoneAt) ?? null;
      if (existing) {
        await ctx.db.patch(existing._id, { ml: args.ml, time });
        id = existing._id;
      } else {
        id = await ctx.db.insert("water_logs", { userId: args.userId, date, ml: args.ml, time });
      }
      break;
    }
    case "sleep": {
      if (args.hours < 0 || args.hours > 24) throw new Error("hours out of range");
      const sleepRows = await ctx.db.query("sleep_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect();
      const existing = sleepRows.find((row: any) => !row.undoneAt) ?? null;
      previous = existing ? { hours: existing.hours, quality: existing.quality, note: existing.note } : null;
      if (existing) {
        await ctx.db.patch(existing._id, { hours: args.hours, quality: args.quality, note: args.note });
        id = existing._id;
      } else {
        id = await ctx.db.insert("sleep_logs", { userId: args.userId, date, hours: args.hours, quality: args.quality, note: args.note });
      }
      break;
    }
    case "mood": {
      if (args.rating < 1 || args.rating > 5) throw new Error("rating must be 1..5");
      const moodRows = args.mode === "upsert"
        ? await ctx.db.query("mood_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect()
        : [];
      const existing = moodRows.find((row: any) => !row.undoneAt) ?? null;
      if (existing) {
        await ctx.db.patch(existing._id, { rating: args.rating, note: args.note, time });
        id = existing._id;
      } else {
        id = await ctx.db.insert("mood_logs", { userId: args.userId, date, rating: args.rating, note: args.note, time });
      }
      break;
    }
    case "steps": {
      if (args.count < 0) throw new Error("count must be non-negative");
      const stepRows = await ctx.db.query("steps_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect();
      const existing = stepRows.find((row: any) => !row.undoneAt) ?? null;
      previous = existing ? { count: existing.count } : null;
      if (existing) {
        await ctx.db.patch(existing._id, { count: args.count });
        id = existing._id;
      } else {
        id = await ctx.db.insert("steps_logs", { userId: args.userId, date, count: args.count });
      }
      break;
    }
    default:
      throw new Error("Unsupported recovery action");
  }
  if (options.emitBehavior) await recordBehaviorRow(ctx, args.userId, "log", args.kind, undefined, date);
  return { id, previous };
}

// ─── Water ───────────────────────────────────────────────────────────────

export const getWater = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return (await ctx.db
      .query("water_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).filter((row) => !row.undoneAt);
  },
});

export const addWater = mutation({
  args: {
    ml: v.number(),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { ml, date, time }) => {
    const userId = await requireUserId(ctx);
    return (await writeRecoveryDomain(ctx, { kind: "water", userId, ml, date, time })).id;
  },
});

export const deleteWater = mutation({
  args: { id: v.id("water_logs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// ─── Sleep ───────────────────────────────────────────────────────────────

export const getSleep = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return (await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).find((row) => !row.undoneAt) ?? null;
  },
});

export const upsertSleep = mutation({
  args: {
    hours: v.number(),
    quality: v.string(),
    date: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { hours, quality, date, note }) => {
    const userId = await requireUserId(ctx);
    return (await writeRecoveryDomain(ctx, { kind: "sleep", userId, hours, quality, date, note })).id;
  },
});

export const logSleepFromCoach = mutation({
  args: {
    hours: v.number(),
    quality: v.string(),
    date: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { hours, quality, date, note }) => {
    const userId = await requireUserId(ctx);
    return writeRecoveryDomain(ctx, { kind: "sleep", userId, hours, quality, date, note });
  },
});

export const deleteSleep = mutation({
  args: { id: v.id("sleep_logs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

export const undoSleepLog = mutation({
  args: {
    id: v.id("sleep_logs"),
    previous: v.union(v.null(), v.object({ hours: v.number(), quality: v.string(), note: v.optional(v.string()) })),
    expected: v.object({ hours: v.number(), quality: v.string(), note: v.optional(v.string()) }),
  },
  handler: async (ctx, { id, previous, expected }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    if (row.hours !== expected.hours || row.quality !== expected.quality || row.note !== expected.note) {
      throw new Error("This log has changed since — can't undo");
    }
    if (previous) {
      await ctx.db.patch(id, previous);
    } else {
      await ctx.db.delete(id);
    }
  },
});

// ─── Mood ────────────────────────────────────────────────────────────────

export const getMood = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return (await ctx.db
      .query("mood_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).filter((row) => !row.undoneAt);
  },
});

export const addMood = mutation({
  args: {
    rating: v.number(),
    date: v.optional(v.string()),
    note: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { rating, date, note, time }) => {
    const userId = await requireUserId(ctx);
    return (await writeRecoveryDomain(ctx, { kind: "mood", userId, rating, date, note, time })).id;
  },
});

export const deleteMood = mutation({
  args: { id: v.id("mood_logs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// ─── Steps ────────────────────────────────────────────────────────────────

export const getSteps = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return (await ctx.db
      .query("steps_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).find((row) => !row.undoneAt) ?? null;
  },
});

export const upsertSteps = mutation({
  args: { count: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { count, date }) => {
    const userId = await requireUserId(ctx);
    return (await writeRecoveryDomain(ctx, { kind: "steps", userId, count, date })).id;
  },
});

export const logStepsFromCoach = mutation({
  args: { count: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { count, date }) => {
    const userId = await requireUserId(ctx);
    return writeRecoveryDomain(ctx, { kind: "steps", userId, count, date });
  },
});

export const undoStepsLog = mutation({
  args: {
    id: v.id("steps_logs"),
    previous: v.union(v.null(), v.object({ count: v.number() })),
    expected: v.object({ count: v.number() }),
  },
  handler: async (ctx, { id, previous, expected }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    if (row.count !== expected.count) {
      throw new Error("This log has changed since — can't undo");
    }
    if (previous) {
      await ctx.db.patch(id, previous);
    } else {
      await ctx.db.delete(id);
    }
  },
});

// ─── Today summary (for HomePage TodaysPulse) ─────────────────────────────

export const getTodaySummary = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const d = date ?? todayDate();

    const [water, sleep, mood, steps] = await Promise.all([
      ctx.db.query("water_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .collect().then((rows) => rows.filter((row) => !row.undoneAt)),
      ctx.db.query("sleep_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .collect().then((rows) => rows.find((row) => !row.undoneAt) ?? null),
      ctx.db.query("mood_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .collect().then((rows) => rows.filter((row) => !row.undoneAt)),
      ctx.db.query("steps_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .collect().then((rows) => rows.find((row) => !row.undoneAt) ?? null),
    ]);

    return {
      waterMl: water.reduce((s, w) => s + w.ml, 0),
      waterCount: water.length,
      sleep: sleep ? { hours: sleep.hours, quality: sleep.quality } : null,
      lastMood: mood.length > 0 ? mood[mood.length - 1].rating : null,
      steps: steps?.count ?? 0,
    };
  },
});

// ─── Internal: last sleep for AI context ────────────────────────────────────

export const getLastSleepForContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    // Check today first, then yesterday
    for (const date of [today, yesterday]) {
      const rows = await ctx.db
        .query("sleep_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
        .collect();
      const row = rows.find((candidate) => !candidate.undoneAt);
      if (row) return { hours: row.hours, quality: row.quality, date: row.date };
    }
    return null;
  },
});

import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Water ───────────────────────────────────────────────────────────────

export const getWater = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return ctx.db
      .query("water_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
  },
});

export const addWater = mutation({
  args: {
    ml: v.number(),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { ml, date, time }) => {
    if (ml <= 0) throw new Error("ml must be positive");
    const userId = await requireUserId(ctx);
    return ctx.db.insert("water_logs", {
      userId,
      date: date ?? todayDate(),
      ml,
      time: time ?? new Date().toTimeString().slice(0, 5),
    });
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
    return ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
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
    if (hours < 0 || hours > 24) throw new Error("hours out of range");
    const userId = await requireUserId(ctx);
    const d = date ?? todayDate();
    const existing = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { hours, quality, note });
      return existing._id;
    }
    return ctx.db.insert("sleep_logs", { userId, date: d, hours, quality, note });
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
    if (hours < 0 || hours > 24) throw new Error("hours out of range");
    const userId = await requireUserId(ctx);
    const d = date ?? todayDate();
    const existing = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
      .first();
    const previous = existing ? { hours: existing.hours, quality: existing.quality, note: existing.note } : null;
    if (existing) {
      await ctx.db.patch(existing._id, { hours, quality, note });
      return { id: existing._id, previous };
    }
    const id = await ctx.db.insert("sleep_logs", { userId, date: d, hours, quality, note });
    return { id, previous };
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
    return ctx.db
      .query("mood_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
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
    if (rating < 1 || rating > 5) throw new Error("rating must be 1..5");
    const userId = await requireUserId(ctx);
    return ctx.db.insert("mood_logs", {
      userId,
      date: date ?? todayDate(),
      rating,
      note,
      time: time ?? new Date().toTimeString().slice(0, 5),
    });
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
    return ctx.db
      .query("steps_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
  },
});

export const upsertSteps = mutation({
  args: { count: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { count, date }) => {
    if (count < 0) throw new Error("count must be non-negative");
    const userId = await requireUserId(ctx);
    const d = date ?? todayDate();
    const existing = await ctx.db
      .query("steps_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { count });
      return existing._id;
    }
    return ctx.db.insert("steps_logs", { userId, date: d, count });
  },
});

export const logStepsFromCoach = mutation({
  args: { count: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { count, date }) => {
    if (count < 0) throw new Error("count must be non-negative");
    const userId = await requireUserId(ctx);
    const d = date ?? todayDate();
    const existing = await ctx.db
      .query("steps_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
      .first();
    const previous = existing ? { count: existing.count } : null;
    if (existing) {
      await ctx.db.patch(existing._id, { count });
      return { id: existing._id, previous };
    }
    const id = await ctx.db.insert("steps_logs", { userId, date: d, count });
    return { id, previous };
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
        .collect(),
      ctx.db.query("sleep_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .first(),
      ctx.db.query("mood_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .collect(),
      ctx.db.query("steps_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", d))
        .first(),
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
      const row = await ctx.db
        .query("sleep_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
        .first();
      if (row) return { hours: row.hours, quality: row.quality, date: row.date };
    }
    return null;
  },
});

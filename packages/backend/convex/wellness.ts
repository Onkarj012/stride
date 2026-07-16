import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { recordBehaviorRow } from "./behavior";
import { buildRecoveryDraft } from "./recovery_draft";
import { recomputeForAction } from "./derived_state";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function writeRecoveryDomain(ctx: any, args: any, options: { emitBehavior?: boolean; recomputeDerived?: boolean } = {}) {
  const draft = buildRecoveryDraft({
    ...args,
    date: args.date ?? todayDate(),
    source: args.source ?? "direct_ui",
    entryKind: args.entryKind ?? (args.kind === "rest" ? "state" : args.kind),
  });
  const date = draft.date;
  const time = draft.time ?? new Date().toTimeString().slice(0, 5);
  const metadata = {
    source: draft.source,
    confidence: draft.confidence,
    unresolved: draft.unresolved,
    correctionState: draft.correctionState,
    state: draft.state,
  };
  let id: any;
  let previous: any = undefined;
  switch (draft.entryKind) {
    case "water": {
      if (draft.waterMl == null) throw new Error("water ml is required");
      const waterRows = args.mode === "upsert"
        ? await ctx.db.query("water_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect()
        : [];
      const existing = waterRows.find((row: any) => !row.undoneAt) ?? null;
      if (existing) {
        await ctx.db.patch(existing._id, { ml: draft.waterMl, time, ...metadata });
        id = existing._id;
      } else {
        id = await ctx.db.insert("water_logs", { userId: args.userId, date, ml: draft.waterMl, time, ...metadata });
      }
      break;
    }
    case "sleep": {
      if (draft.sleep?.hours == null && draft.sleep?.band == null && draft.sleep?.quality == null) throw new Error("sleep hours, band, or quality is required");
      const sleepRows = await ctx.db.query("sleep_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect();
      const existing = sleepRows.find((row: any) => !row.undoneAt && (!row.kind || row.kind === "sleep")) ?? null;
      previous = existing ? {
        hours: existing.hours,
        band: existing.band,
        quality: existing.quality,
        note: existing.note,
        intervalStart: existing.intervalStart,
        intervalEnd: existing.intervalEnd,
        intervalDay: existing.intervalDay,
      } : null;
      const sleepFields = {
        hours: draft.sleep?.hours,
        band: draft.sleep?.band,
        quality: draft.sleep?.quality,
        note: draft.note,
        kind: "sleep",
        intervalStart: draft.sleep?.intervalStart,
        intervalEnd: draft.sleep?.intervalEnd,
        intervalDay: draft.sleep?.intervalDay,
        ...metadata,
      };
      if (existing) {
        await ctx.db.patch(existing._id, sleepFields);
        id = existing._id;
      } else {
        id = await ctx.db.insert("sleep_logs", { userId: args.userId, date, ...sleepFields });
      }
      break;
    }
    case "mood": {
      if (draft.mood == null) throw new Error("mood rating is required");
      const moodRows = args.mode === "upsert"
        ? await ctx.db.query("mood_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect()
        : [];
      const existing = moodRows.find((row: any) => !row.undoneAt) ?? null;
      if (existing) {
        await ctx.db.patch(existing._id, { rating: draft.mood, note: draft.note, time, ...metadata });
        id = existing._id;
      } else {
        id = await ctx.db.insert("mood_logs", { userId: args.userId, date, rating: draft.mood, note: draft.note, time, ...metadata });
      }
      break;
    }
    case "steps": {
      if (draft.steps == null) throw new Error("steps count is required");
      const stepRows = await ctx.db.query("steps_logs").withIndex("by_user_date", (q: any) => q.eq("userId", args.userId).eq("date", date)).collect();
      const existing = stepRows.find((row: any) => !row.undoneAt) ?? null;
      previous = existing ? { count: existing.count } : null;
      if (existing) {
        await ctx.db.patch(existing._id, { count: draft.steps, ...metadata });
        id = existing._id;
      } else {
        id = await ctx.db.insert("steps_logs", { userId: args.userId, date, count: draft.steps, ...metadata });
      }
      break;
    }
    case "state":
    case "wellness": {
      const stateFields = {
        kind: draft.entryKind,
        hours: draft.sleep?.hours,
        band: draft.sleep?.band,
        quality: draft.sleep?.quality,
        note: draft.note,
        intervalStart: draft.sleep?.intervalStart,
        intervalEnd: draft.sleep?.intervalEnd,
        intervalDay: draft.sleep?.intervalDay,
        waterMl: draft.waterMl,
        mood: draft.mood,
        stress: draft.stress,
        energy: draft.energy,
        soreness: draft.soreness,
        injury: draft.injury,
        steps: draft.steps,
        illness: draft.illness,
        plannedRest: draft.plannedRest,
        travel: draft.travel,
        ...metadata,
      };
      id = await ctx.db.insert("sleep_logs", { userId: args.userId, date, ...stateFields });
      break;
    }
    default:
      throw new Error("Unsupported recovery action");
  }
  if (options.emitBehavior) await recordBehaviorRow(ctx, args.userId, "log", draft.entryKind, undefined, date);
  if (options.recomputeDerived !== false) {
    await recomputeForAction(ctx, {
      userId: args.userId,
      actionType: draft.entryKind === "state" ? "rest" : "recovery",
      date,
    });
  }
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
    await recomputeForAction(ctx, { userId, actionType: "recovery", date: row.date });
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
      .collect()).find((row) => !row.undoneAt && (!row.kind || row.kind === "sleep")) ?? null;
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
    await recomputeForAction(ctx, { userId, actionType: "recovery", date: row.date });
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
    await recomputeForAction(ctx, { userId, actionType: "recovery", date: row.date });
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
    await recomputeForAction(ctx, { userId, actionType: "recovery", date: row.date });
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
    await recomputeForAction(ctx, { userId, actionType: "recovery", date: row.date });
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
        .collect().then((rows) => rows.find((row) => !row.undoneAt && (!row.kind || row.kind === "sleep")) ?? null),
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
      sleep: sleep ? { hours: sleep.hours, band: sleep.band, quality: sleep.quality } : null,
      lastMood: mood.length > 0 ? mood[mood.length - 1].rating : null,
      steps: steps?.count,
    };
  },
});

export type RecoveryStateResult = {
  date: string;
  state: string;
  requiredInputs: string[];
  missingInputs: string[];
  insufficient_data: boolean;
  confidence: "insufficient_data" | "reported";
};

export function deriveRecoveryState(input: {
  date: string;
  sleep: { hours?: number; band?: string; quality?: string } | null;
  water: Array<{ ml: number }>;
  mood: Array<{ rating: number }>;
  steps: { count?: number } | null;
  stateRows?: Array<{ state?: string; undoneAt?: number; stress?: number }>;
}): RecoveryStateResult {
  const requiredInputs = ["sleep", "water", "mood", "stress", "steps"];
  const hasSleep = !!input.sleep && (input.sleep.hours != null || input.sleep.band != null || input.sleep.quality != null);
  const hasWater = input.water.length > 0;
  const hasMood = input.mood.length > 0;
  const hasSteps = input.steps?.count != null;
  const hasStress = (input.stateRows ?? []).some((row) => !row.undoneAt && row.stress != null);
  const missingInputs = requiredInputs.filter((name) => (
    name === "sleep" ? !hasSleep :
      name === "water" ? !hasWater :
        name === "mood" ? !hasMood :
          name === "steps" ? !hasSteps : !hasStress
  ));
  const latestState = [...(input.stateRows ?? [])].filter((row) => !row.undoneAt).at(-1)?.state ?? "unknown";
  return {
    date: input.date,
    state: latestState,
    requiredInputs,
    missingInputs,
    insufficient_data: missingInputs.length > 0,
    confidence: missingInputs.length > 0 ? "insufficient_data" : "reported",
  };
}

export const getRecoveryState = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const [sleep, water, mood, steps, stateRows] = await Promise.all([
      ctx.db.query("sleep_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect()
        .then((rows) => rows.find((row) => !row.undoneAt && (!row.kind || row.kind === "sleep")) ?? null),
      ctx.db.query("water_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect()
        .then((rows) => rows.filter((row) => !row.undoneAt)),
      ctx.db.query("mood_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect()
        .then((rows) => rows.filter((row) => !row.undoneAt)),
      ctx.db.query("steps_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect()
        .then((rows) => rows.find((row) => !row.undoneAt) ?? null),
      ctx.db.query("sleep_logs").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).collect(),
    ]);
    return deriveRecoveryState({ date, sleep, water, mood, steps, stateRows });
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
      if (row && (!row.kind || row.kind === "sleep")) return { hours: row.hours, band: row.band, quality: row.quality, date: row.date };
    }
    return null;
  },
});

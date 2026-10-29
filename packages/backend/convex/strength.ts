import { addDays, epley, weekStart, weeklyVolumeByMuscle } from "@stride/core";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { revisionOpValidator } from "./ledger_validators";
import { localDateOrToday, requireUserId, resolveLocalDay } from "./time_zone";
import { assertLedgerWritable } from "./users";

const MAX_SESSION_SETS = 200;
// Shared by all exercises in one sessionDetail query. Each set read can also cost a session read, so this stays under Convex's 4,096 range limit.
const MAX_HISTORY_SETS = 1000;
const RECENT_SET_SCAN = 200;
const RECENT_EXERCISE_LIMIT = 6;
const RECENT_WORKOUT_SCAN = 30;
const MAX_RECENT_WORKOUTS = 5;
type RevisionOp = Infer<typeof revisionOpValidator>;
type SessionCache = Map<Id<"workout_sessions">, Doc<"workout_sessions"> | null>;
type SetContent = Pick<Doc<"sets">, "sessionId" | "exerciseId" | "setIndex" | "weightKg" | "reps" | "weightBasis" | "rpe" | "deletedAt">;
type ReadCtx = QueryCtx | MutationCtx;

/** Rejects empty or oversized submission ids. */
function checkSubmissionId(submissionId: string): void {
  if (submissionId.trim().length === 0 || submissionId.length > 128) throw new Error("submissionId must be 1-128 characters");
}

/** Rejects implausible set values while allowing bodyweight sets at zero kg. */
function checkSet(weightKg: number, reps: number, rpe: number | undefined): void {
  if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) throw new ConvexError({ code: "INVALID_SET", message: "weightKg must be within 0-1000" });
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000) throw new ConvexError({ code: "INVALID_SET", message: "reps must be an integer within 1-1000" });
  if (rpe !== undefined && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) throw new ConvexError({ code: "INVALID_SET", message: "rpe must be within 1-10" });
}

/** Rejects invalid timestamps before resolving a local day. */
function checkTimestamp(timestamp: number): void {
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw new ConvexError({ code: "INVALID_DATE", message: "Timestamp must be a valid finite instant" });
}

/** Loads a session owned by the caller. */
async function requireSession(ctx: ReadCtx, userId: string, sessionId: Id<"workout_sessions">): Promise<Doc<"workout_sessions">> {
  const session = await ctx.db.get("workout_sessions", sessionId);
  if (session === null || session.userId !== userId || session.deletedAt !== undefined) throw new ConvexError({ code: "NOT_FOUND", message: "Session not found" });
  return session;
}

/** Loads a shared exercise and rejects missing library rows. */
async function requireExercise(ctx: ReadCtx, exerciseId: Id<"exercises">): Promise<Doc<"exercises">> {
  const exercise = await ctx.db.get("exercises", exerciseId);
  if (exercise === null || (exercise.ownerId !== undefined && exercise.ownerId !== (await requireUserId(ctx)))) throw new ConvexError({ code: "NOT_FOUND", message: "Exercise not found" });
  return exercise;
}

/** Loads a set owned by the caller and checks its parent session. */
async function requireSet(ctx: ReadCtx, userId: string, setId: Id<"sets">): Promise<Doc<"sets">> {
  const set = await ctx.db.get("sets", setId);
  if (set === null || set.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Set not found" });
  await requireSession(ctx, userId, set.sessionId);
  return set;
}

/** Validates cardio measurements and requires duration or distance. */
function checkCardio(args: { durationMin?: number; distanceKm?: number; reportedKcal?: number; speedKmh?: number; inclinePct?: number }): void {
  const bounded = (value: number | undefined, min: number, max: number, integer = false) => value === undefined || (Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
  if (!bounded(args.durationMin, 1, 1440, true) || !bounded(args.distanceKm, 0, 500) || !bounded(args.reportedKcal, 0, 5000) || !bounded(args.speedKmh, 0, 50) || !bounded(args.inclinePct, 0, 40) || (args.durationMin === undefined && args.distanceKm === undefined)) {
    throw new ConvexError({ code: "INVALID_CARDIO", message: "Add a duration or distance and check the cardio values." });
  }
}

/** Returns an existing cardio revision for an exact retry and rejects reused submission ids. */
async function cardioReplay(ctx: MutationCtx, userId: string, submissionId: string, op: "edit" | "delete" | "undo", cardioId: Id<"cardio">): Promise<Id<"cardio"> | null> {
  checkSubmissionId(submissionId);
  const prior = await ctx.db.query("cardio").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", submissionId)).unique();
  if (prior === null) return null;
  if (prior.op !== op || prior.supersedes !== cardioId) throw new Error("submissionId already used for a different cardio change");
  return prior._id;
}

/** Reads current rows for a session and refuses a partial set list. */
async function sessionSets(ctx: ReadCtx, sessionId: Id<"workout_sessions">, userId: string): Promise<Doc<"sets">[]> {
  const rows = await ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(MAX_SESSION_SETS + 1);
  if (rows.length > MAX_SESSION_SETS) throw new ConvexError({ code: "LIMIT_REACHED", message: "Session exceeds 200 sets" });
  if (rows.some((row) => row.userId !== userId)) throw new Error("Set ownership mismatch");
  return rows.sort((a, b) => a.setIndex - b.setIndex);
}

/** Reads recent live sets and their sessions, reporting when older history is omitted. */
async function history(ctx: ReadCtx, userId: string) {
  const rows = await ctx.db.query("sets").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "live")).order("desc").take(MAX_HISTORY_SETS + 1);
  const sets = rows.slice(0, MAX_HISTORY_SETS);
  const sessionMap = new Map<Id<"workout_sessions">, Doc<"workout_sessions">>();
  for (const sessionId of new Set(sets.map((set) => set.sessionId))) {
    const session = await ctx.db.get("workout_sessions", sessionId);
    if (session !== null && session.userId === userId && session.deletedAt === undefined) sessionMap.set(session._id, session);
  }
  return { sets: sets.filter((set) => sessionMap.has(set.sessionId)), sessions: sessionMap, historyLimited: rows.length > MAX_HISTORY_SETS };
}

/** Reads up to `limit` of one exercise's recent live sets and their sessions, reporting when older history is omitted. */
async function exerciseHistory(ctx: ReadCtx, userId: string, exerciseId: Id<"exercises">, cache: SessionCache, limit: number) {
  const rows = await ctx.db.query("sets").withIndex("by_userId_and_exerciseId_and_status", (q) => q.eq("userId", userId).eq("exerciseId", exerciseId).eq("status", "live")).order("desc").take(limit + 1);
  const kept = rows.slice(0, limit);
  const sessionMap = new Map<Id<"workout_sessions">, Doc<"workout_sessions">>();
  for (const sessionId of new Set(kept.map((set) => set.sessionId))) {
    if (!cache.has(sessionId)) cache.set(sessionId, await ctx.db.get("workout_sessions", sessionId));
    const session = cache.get(sessionId);
    if (session && session.userId === userId && session.deletedAt === undefined) sessionMap.set(session._id, session);
  }
  return { sets: kept.filter((set) => sessionMap.has(set.sessionId)), sessions: sessionMap, read: kept.length, historyLimited: rows.length > limit };
}

/** Returns a set with a deterministic Epley estimate, or null outside its valid rep range. */
function setView(set: Doc<"sets">) {
  return { _id: set._id, revision: set.revision, setIndex: set.setIndex, weightKg: set.weightKg, reps: set.reps, ...(set.weightBasis === undefined ? {} : { weightBasis: set.weightBasis }), ...(set.rpe === undefined ? {} : { rpe: set.rpe }), e1rmKg: epley(set.weightKg, set.reps) };
}

/** Finds the latest completed session before the current workout for one exercise. */
function previousSets(sets: Doc<"sets">[], sessions: Map<Id<"workout_sessions">, Doc<"workout_sessions">>, exerciseId: Id<"exercises">, before?: Doc<"workout_sessions">) {
  const candidates = sets.filter((set) => {
    const session = sessions.get(set.sessionId);
    return set.exerciseId === exerciseId && session !== undefined && session.endedAt !== undefined && (before === undefined || (session._id !== before._id && session.startedAt < before.startedAt));
  });
  candidates.sort((a, b) => (sessions.get(b.sessionId)?.startedAt ?? 0) - (sessions.get(a.sessionId)?.startedAt ?? 0));
  const sessionId = candidates[0]?.sessionId;
  return candidates.filter((set) => set.sessionId === sessionId).sort((a, b) => a.setIndex - b.setIndex).map(setView);
}

/** Extracts the editable content without copying revision metadata. */
function contentOf(set: Doc<"sets">): SetContent {
  return { sessionId: set.sessionId, exerciseId: set.exerciseId, setIndex: set.setIndex, weightKg: set.weightKg, reps: set.reps, ...(set.weightBasis === undefined ? {} : { weightBasis: set.weightBasis }), ...(set.rpe === undefined ? {} : { rpe: set.rpe }), ...(set.deletedAt === undefined ? {} : { deletedAt: set.deletedAt }) };
}

/** Returns the original revision on an exact mutation retry. */
async function replay(ctx: MutationCtx, userId: string, submissionId: string, op: RevisionOp, setId: Id<"sets">): Promise<Id<"sets"> | null> {
  checkSubmissionId(submissionId);
  const rows = await ctx.db.query("sets").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", submissionId)).take(2);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row === undefined || rows.length !== 1 || row.op !== op || row.supersedes !== setId) throw new Error("submissionId already used for a different change");
  return row._id;
}

/** Appends a revision and marks its previous head superseded. */
async function writeRevision(ctx: MutationCtx, head: Doc<"sets">, content: SetContent, op: RevisionOp, submissionId: string): Promise<Id<"sets">> {
  if (head.status === "superseded") throw new ConvexError({ code: "STALE_REVISION", message: "Set has a newer revision. Reload and retry." });
  if (head.status !== "live" && content.deletedAt === undefined && (await sessionSets(ctx, head.sessionId, head.userId)).length >= MAX_SESSION_SETS) throw new ConvexError({ code: "LIMIT_REACHED", message: "Session exceeds 200 sets" });
  await ctx.db.patch("sets", head._id, { status: "superseded" });
  return await ctx.db.insert("sets", { ...content, userId: head.userId, revision: head.revision + 1, supersedes: head._id, op, status: content.deletedAt === undefined ? "live" : "deleted", submissionId });
}

/** Starts a workout once under a submission id on the caller's resolved local day. */
export const startSession = mutation({
  args: { submissionId: v.string(), startedAt: v.optional(v.number()), name: v.optional(v.string()) },
  returns: v.id("workout_sessions"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    checkSubmissionId(args.submissionId);
    const prior = await ctx.db.query("workout_sessions").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", args.submissionId)).unique();
    if (prior !== null) return prior._id;
    const startedAt = args.startedAt ?? Date.now();
    checkTimestamp(startedAt);
    if (args.name !== undefined && (args.name.trim().length === 0 || args.name.length > 100)) throw new ConvexError({ code: "INVALID_TEXT", message: "name must be 1-100 characters" });
    const day = await resolveLocalDay(ctx, userId, startedAt);
    const sameDay = await ctx.db.query("workout_sessions").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", day.localDate)).take(30);
    if (sameDay.length >= 30) throw new ConvexError({ code: "LIMIT_REACHED", message: "Day exceeds 30 workout sessions" });
    return await ctx.db.insert("workout_sessions", { userId, localDate: day.localDate, timeZone: day.timeZone, startedAt, submissionId: args.submissionId, ...(args.name === undefined ? {} : { name: args.name.trim() }) });
  },
});

/** Ends a workout once without changing calorie or day-budget data. */
export const endSession = mutation({
  args: { sessionId: v.id("workout_sessions"), endedAt: v.optional(v.number()) },
  returns: v.id("workout_sessions"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const session = await requireSession(ctx, userId, args.sessionId);
    if (session.endedAt !== undefined) return session._id;
    const endedAt = args.endedAt ?? Date.now();
    checkTimestamp(endedAt);
    if (endedAt < session.startedAt) throw new ConvexError({ code: "END_BEFORE_START", message: "endedAt must be at or after startedAt" });
    await ctx.db.patch("workout_sessions", session._id, { endedAt });
    return session._id;
  },
});

/** Adds a set once and preserves stable per-exercise ordering. */
export const addSet = mutation({
  args: { submissionId: v.string(), sessionId: v.id("workout_sessions"), exerciseId: v.id("exercises"), weightKg: v.number(), reps: v.number(), weightBasis: v.optional(v.union(v.literal("total"), v.literal("each"))), rpe: v.optional(v.number()) },
  returns: v.id("sets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    checkSubmissionId(args.submissionId);
    const session = await requireSession(ctx, userId, args.sessionId);
    await requireExercise(ctx, args.exerciseId);
    const prior = await ctx.db.query("sets").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", args.submissionId)).unique();
    if (prior !== null) {
      if (prior.op !== "add" || prior.sessionId !== session._id || prior.exerciseId !== args.exerciseId) throw new Error("submissionId already used for a different change");
      return prior._id;
    }
    if (session.endedAt !== undefined) throw new ConvexError({ code: "SESSION_FINISHED", message: "Session is finished" });
    checkSet(args.weightKg, args.reps, args.rpe);
    const rows = await sessionSets(ctx, session._id, userId);
    if (rows.length >= MAX_SESSION_SETS) throw new ConvexError({ code: "LIMIT_REACHED", message: "Session exceeds 200 sets" });
    const last = await ctx.db.query("sets").withIndex("by_sessionId_and_exerciseId_and_setIndex", (q) => q.eq("sessionId", session._id).eq("exerciseId", args.exerciseId)).order("desc").first();
    const setIndex = (last?.setIndex ?? 0) + 1;
    return await ctx.db.insert("sets", { userId, sessionId: session._id, exerciseId: args.exerciseId, setIndex, reps: args.reps, weightKg: args.weightKg, ...(args.weightBasis === undefined ? {} : { weightBasis: args.weightBasis }), ...(args.rpe === undefined ? {} : { rpe: args.rpe }), revision: 1, op: "add", status: "live", submissionId: args.submissionId });
  },
});

/** Adds one cardio record without changing strength totals or calorie targets. */
export const addCardio = mutation({
  args: { submissionId: v.string(), sessionId: v.id("workout_sessions"), exerciseId: v.id("exercises"), durationMin: v.optional(v.number()), distanceKm: v.optional(v.number()), reportedKcal: v.optional(v.number()), speedKmh: v.optional(v.number()), inclinePct: v.optional(v.number()) },
  returns: v.id("cardio"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    checkSubmissionId(args.submissionId);
    const session = await requireSession(ctx, userId, args.sessionId);
    const exercise = await requireExercise(ctx, args.exerciseId);
    if (exercise.category !== "cardio") throw new ConvexError({ code: "INVALID_EXERCISE", message: "Choose a cardio activity." });
    checkCardio(args);
    const prior = await ctx.db.query("cardio").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", args.submissionId)).unique();
    if (prior !== null) {
      if (prior.sessionId !== session._id || prior.exerciseId !== args.exerciseId) throw new Error("submissionId already used for a different change");
      return prior._id;
    }
    if (session.endedAt !== undefined) throw new ConvexError({ code: "SESSION_FINISHED", message: "Session is finished" });
    const rows = await ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session._id).eq("status", "live")).take(100);
    return await ctx.db.insert("cardio", { userId, sessionId: session._id, exerciseId: args.exerciseId, position: rows.length, durationMin: args.durationMin, distanceKm: args.distanceKm, reportedKcal: args.reportedKcal, speedKmh: args.speedKmh, inclinePct: args.inclinePct, revision: 1, op: "add", status: "live", submissionId: args.submissionId });
  },
});

/** Edits cardio values as a new revision. */
export const editCardio = mutation({
  args: { submissionId: v.string(), cardioId: v.id("cardio"), durationMin: v.optional(v.union(v.number(), v.null())), distanceKm: v.optional(v.union(v.number(), v.null())), reportedKcal: v.optional(v.union(v.number(), v.null())), speedKmh: v.optional(v.union(v.number(), v.null())), inclinePct: v.optional(v.union(v.number(), v.null())) },
  returns: v.id("cardio"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const prior = await cardioReplay(ctx, userId, args.submissionId, "edit", args.cardioId);
    if (prior !== null) return prior;
    const head = await ctx.db.get("cardio", args.cardioId);
    if (head === null || head.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Cardio record not found" });
    const session = await requireSession(ctx, userId, head.sessionId);
    if (head.status !== "live") throw new ConvexError({ code: "STALE_REVISION", message: "Cardio record has a newer revision." });
    const fields = ["durationMin", "distanceKm", "reportedKcal", "speedKmh", "inclinePct"] as const;
    const content = Object.fromEntries(fields.map((field) => [field, args[field] === null ? undefined : args[field] ?? head[field]])) as Pick<Doc<"cardio">, typeof fields[number]>;
    checkCardio(content);
    await ctx.db.patch("cardio", head._id, { status: "superseded" });
    return await ctx.db.insert("cardio", { ...content, userId, sessionId: session._id, exerciseId: head.exerciseId, position: head.position, revision: head.revision + 1, supersedes: head._id, op: "edit", status: "live", submissionId: args.submissionId });
  },
});

/** Soft-deletes one cardio record as a revision. */
export const deleteCardio = mutation({
  args: { submissionId: v.string(), cardioId: v.id("cardio") }, returns: v.id("cardio"),
  handler: async (ctx, { submissionId, cardioId }) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const prior = await cardioReplay(ctx, userId, submissionId, "delete", cardioId); if (prior !== null) return prior;
    const head = await ctx.db.get("cardio", cardioId);
    if (head === null || head.userId !== userId || head.status !== "live") throw new ConvexError({ code: "NOT_FOUND", message: "Cardio record not found" });
    await requireSession(ctx, userId, head.sessionId);
    await ctx.db.patch("cardio", head._id, { status: "superseded" });
    return await ctx.db.insert("cardio", { userId, sessionId: head.sessionId, exerciseId: head.exerciseId, position: head.position, durationMin: head.durationMin, distanceKm: head.distanceKm, reportedKcal: head.reportedKcal, speedKmh: head.speedKmh, inclinePct: head.inclinePct, revision: head.revision + 1, supersedes: head._id, op: "delete", status: "deleted", deletedAt: Date.now(), submissionId });
  },
});

/** Reverts a cardio change by restoring its previous revision. */
export const undoCardioRevision = mutation({
  args: { submissionId: v.string(), cardioId: v.id("cardio") }, returns: v.id("cardio"),
  handler: async (ctx, { submissionId, cardioId }) => {
    const userId = await requireUserId(ctx); await assertLedgerWritable(ctx, userId);
    const prior = await cardioReplay(ctx, userId, submissionId, "undo", cardioId); if (prior !== null) return prior;
    const head = await ctx.db.get("cardio", cardioId);
    if (head === null || head.userId !== userId || head.status === "superseded") throw new ConvexError({ code: "NOT_FOUND", message: "Cardio record not found" });
    const previous = head.supersedes === undefined ? null : await ctx.db.get("cardio", head.supersedes);
    await ctx.db.patch("cardio", head._id, { status: "superseded" });
    const gone = previous === null;
    const content = previous ?? head;
    return await ctx.db.insert("cardio", { userId, sessionId: content.sessionId, exerciseId: content.exerciseId, position: content.position, ...(content.durationMin === undefined ? {} : { durationMin: content.durationMin }), ...(content.distanceKm === undefined ? {} : { distanceKm: content.distanceKm }), ...(content.reportedKcal === undefined ? {} : { reportedKcal: content.reportedKcal }), ...(content.speedKmh === undefined ? {} : { speedKmh: content.speedKmh }), ...(content.inclinePct === undefined ? {} : { inclinePct: content.inclinePct }), revision: head.revision + 1, supersedes: head._id, op: "undo", status: gone ? "deleted" : "live", ...(gone ? { deletedAt: Date.now() } : {}), submissionId });
  },
});

/** Edits a current set by appending a revision; null clears its optional RPE. */
export const editSet = mutation({
  args: { submissionId: v.string(), setId: v.id("sets"), weightKg: v.optional(v.number()), reps: v.optional(v.number()), weightBasis: v.optional(v.union(v.literal("total"), v.literal("each"), v.null())), rpe: v.optional(v.union(v.number(), v.null())) },
  returns: v.id("sets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const head = await requireSet(ctx, userId, args.setId);
    const prior = await replay(ctx, userId, args.submissionId, "edit", head._id);
    if (prior !== null) return prior;
    if (head.status === "deleted") throw new ConvexError({ code: "ALREADY_DELETED", message: "Set is deleted. Undo the delete first." });
    if (args.weightKg === undefined && args.reps === undefined && args.rpe === undefined && args.weightBasis === undefined) throw new Error("editSet needs at least one change");
    const content = contentOf(head);
    content.weightKg = args.weightKg ?? content.weightKg;
    content.reps = args.reps ?? content.reps;
    if (args.weightBasis === null) delete content.weightBasis;
    else if (args.weightBasis !== undefined) content.weightBasis = args.weightBasis;
    if (args.rpe === null) delete content.rpe;
    else if (args.rpe !== undefined) content.rpe = args.rpe;
    checkSet(content.weightKg, content.reps, content.rpe);
    return await writeRevision(ctx, head, content, "edit", args.submissionId);
  },
});

/** Soft-deletes a current set by appending a deleted revision. */
export const deleteSet = mutation({
  args: { submissionId: v.string(), setId: v.id("sets") },
  returns: v.id("sets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const head = await requireSet(ctx, userId, args.setId);
    const prior = await replay(ctx, userId, args.submissionId, "delete", head._id);
    if (prior !== null) return prior;
    if (head.status === "deleted") throw new ConvexError({ code: "ALREADY_DELETED", message: "Set is already deleted" });
    return await writeRevision(ctx, head, { ...contentOf(head), deletedAt: Date.now() }, "delete", args.submissionId);
  },
});

/** Reverts the latest set change with a new revision; undoing an add deletes it. */
export const undoRevision = mutation({
  args: { submissionId: v.string(), setId: v.id("sets") },
  returns: v.id("sets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const head = await requireSet(ctx, userId, args.setId);
    const prior = await replay(ctx, userId, args.submissionId, "undo", head._id);
    if (prior !== null) return prior;
    let content: SetContent = { ...contentOf(head), deletedAt: Date.now() };
    if (head.supersedes !== undefined) {
      const previous = await requireSet(ctx, userId, head.supersedes);
      if (previous.sessionId !== head.sessionId || previous.exerciseId !== head.exerciseId) throw new Error("Previous revision does not match this set");
      content = contentOf(previous);
    }
    return await writeRevision(ctx, head, content, "undo", args.submissionId);
  },
});

/** Lists the caller's sessions for one local day in start-time order. */
export const sessionsForDay = query({
  args: { localDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const date = await localDateOrToday(ctx, userId, args.localDate);
    const rows = await ctx.db.query("workout_sessions").withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", date)).take(31);
    if (rows.length > 30) throw new ConvexError({ code: "LIMIT_REACHED", message: "Day exceeds 30 workout sessions" });
    return rows.filter((row) => row.deletedAt === undefined).sort((a, b) => a.startedAt - b.startedAt);
  },
});

/** Returns the caller's newest unfinished workout, whatever day it started on. */
export const activeSession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.query("workout_sessions").withIndex("by_userId_and_endedAt_and_deletedAt_and_startedAt", (q) => q.eq("userId", userId).eq("endedAt", undefined).eq("deletedAt", undefined)).order("desc").first();
  },
});

/** Pages through saved workouts so even old completed sessions can be reopened. */
export const savedSessions = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.query("workout_sessions").withIndex("by_userId_and_deletedAt_and_startedAt", (q) => q.eq("userId", userId).eq("deletedAt", undefined)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(20, args.paginationOpts.numItems) });
  },
});

/** Finds completed-session hints for an exercise newly selected in this workout. */
export const exerciseHints = query({
  args: { sessionId: v.id("workout_sessions"), exerciseId: v.id("exercises") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const session = await requireSession(ctx, userId, args.sessionId);
    await requireExercise(ctx, args.exerciseId);
    const past = await exerciseHistory(ctx, userId, args.exerciseId, new Map(), MAX_HISTORY_SETS);
    return { previousSets: past.historyLimited ? [] : previousSets(past.sets, past.sessions, args.exerciseId, session), historyLimited: past.historyLimited };
  },
});

/** Loads a workout's current sets, previous hints and deterministic completion summary. */
export const sessionDetail = query({
  args: { sessionId: v.id("workout_sessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const session = await requireSession(ctx, userId, args.sessionId);
    const sets = await sessionSets(ctx, session._id, userId);
    const cardioRows = await ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session._id).eq("status", "live")).take(100);
    const cardio = await Promise.all(cardioRows.map(async (row) => ({ ...row, exercise: await requireExercise(ctx, row.exerciseId) })));
    const cache: SessionCache = new Map();
    let budget = MAX_HISTORY_SETS;
    let historyLimited = false;
    const exercises = [];
    const newBests = [];
    for (const exerciseId of new Set(sets.map((set) => set.exerciseId))) {
      const exercise = await requireExercise(ctx, exerciseId);
      const past = await exerciseHistory(ctx, userId, exerciseId, cache, budget);
      budget -= past.read;
      historyLimited ||= past.historyLimited;
      const currentSets = sets.filter((set) => set.exerciseId === exerciseId);
      exercises.push({ exercise, sets: currentSets.map(setView), previousSets: past.historyLimited ? [] : previousSets(past.sets, past.sessions, exerciseId, session), historyLimited: past.historyLimited });
      const best = Math.max(0, ...currentSets.map((set) => epley(set.weightKg, set.reps) ?? 0));
      const olderSets = past.sets.filter((set) => (past.sessions.get(set.sessionId)?.startedAt ?? Infinity) < session.startedAt);
      const previous = Math.max(0, ...olderSets.map((set) => epley(set.weightKg, set.reps) ?? 0));
      if (!past.historyLimited && best > previous) newBests.push({ exerciseId, name: exercise.name, e1rmKg: best, previousBestKg: previous === 0 ? null : previous });
    }
    return { session, exercises, cardio, historyLimited, historySetLimit: MAX_HISTORY_SETS, summary: { setCount: sets.length, volumeKg: sets.reduce((total, set) => total + set.weightKg * set.reps, 0), newBests, cardioCount: cardio.length, reportedKcal: cardio.some((row) => row.reportedKcal !== undefined) ? cardio.reduce((total, row) => total + (row.reportedKcal ?? 0), 0) : null } };
  },
});

/** Lists the caller's lifts ranked by the start time of their latest workout, newest first. */
export const recentExercises = query({
  args: {},
  returns: v.array(v.id("exercises")),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db.query("sets").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "live")).order("desc").take(RECENT_SET_SCAN);
    const cache: SessionCache = new Map();
    const latestWorkout = new Map<Id<"exercises">, number>();
    for (const set of rows) {
      if (!cache.has(set.sessionId)) cache.set(set.sessionId, await ctx.db.get("workout_sessions", set.sessionId));
      const session = cache.get(set.sessionId);
      if (!session || session.userId !== userId || session.deletedAt !== undefined) continue;
      latestWorkout.set(set.exerciseId, Math.max(latestWorkout.get(set.exerciseId) ?? session.startedAt, session.startedAt));
    }
    const cardio = await ctx.db.query("cardio").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "live")).order("desc").take(RECENT_SET_SCAN);
    for (const row of cardio) {
      if (!cache.has(row.sessionId)) cache.set(row.sessionId, await ctx.db.get("workout_sessions", row.sessionId));
      const session = cache.get(row.sessionId);
      if (!session || session.userId !== userId || session.deletedAt !== undefined) continue;
      latestWorkout.set(row.exerciseId, Math.max(latestWorkout.get(row.exerciseId) ?? session.startedAt, session.startedAt));
    }
    // Map keeps first-seen order and sort is stable, so ties keep the newest-set scan order.
    return [...latestWorkout].sort((a, b) => b[1] - a[1]).slice(0, RECENT_EXERCISE_LIMIT).map(([exerciseId]) => exerciseId);
  },
});

/** Lists the newest finished workouts that have sets, with each exercise's set count, scanning at most 30 sessions. */
export const recentWorkouts = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_RECENT_WORKOUTS) throw new Error(`limit must be an integer within 1-${MAX_RECENT_WORKOUTS}`);
    const sessions = await ctx.db.query("workout_sessions").withIndex("by_userId_and_deletedAt_and_startedAt", (q) => q.eq("userId", userId).eq("deletedAt", undefined)).order("desc").take(RECENT_WORKOUT_SCAN);
    const workouts = [];
    for (const session of sessions) {
      if (workouts.length >= args.limit) break;
      if (session.endedAt === undefined) continue;
      const sets = await sessionSets(ctx, session._id, userId);
      const cardio = await ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", session._id).eq("status", "live")).take(100);
      if (sets.length === 0 && cardio.length === 0) continue;
      const counts = new Map<Id<"exercises">, number>();
      for (const set of sets) counts.set(set.exerciseId, (counts.get(set.exerciseId) ?? 0) + 1);
      const exercises = [];
      for (const [exerciseId, count] of counts) exercises.push({ exercise: await requireExercise(ctx, exerciseId), sets: count });
      workouts.push({ sessionId: session._id, name: session.name, localDate: session.localDate, exercises, cardioCount: cardio.length });
    }
    return workouts;
  },
});

/** Returns exercise trends and weekly volume, with an explicit recent-history limit. */
export const stats = query({
  args: { weeks: v.optional(v.number()), exerciseId: v.optional(v.id("exercises")), localDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const weeks = args.weeks ?? 8;
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) throw new Error("weeks must be an integer within 1-12");
    if (args.exerciseId !== undefined) await requireExercise(ctx, args.exerciseId);
    const today = await localDateOrToday(ctx, userId, args.localDate);
    const currentWeek = weekStart(today);
    const past = await history(ctx, userId);
    const exerciseMap = new Map<Id<"exercises">, Doc<"exercises">>();
    for (const exerciseId of new Set(past.sets.map((set) => set.exerciseId))) exerciseMap.set(exerciseId, await requireExercise(ctx, exerciseId));
    const weeklyVolume = Array.from({ length: weeks }, (_, index) => {
      const start = addDays(currentWeek, -7 * (weeks - 1 - index));
      const end = addDays(start, 6);
      const sets = past.sets.filter((set) => {
        const date = past.sessions.get(set.sessionId)?.localDate;
        return date !== undefined && date >= start && date <= end && date <= today;
      });
      const volume = weeklyVolumeByMuscle(sets, exerciseMap);
      return { weekStart: start, muscles: [...volume].map(([muscle, values]) => ({ muscle, ...values })).sort((a, b) => a.muscle.localeCompare(b.muscle)) };
    });
    const exercises = [];
    for (const [exerciseId, exercise] of exerciseMap) {
      if (args.exerciseId !== undefined && args.exerciseId !== exerciseId) continue;
      const daily = new Map<string, number>();
      for (const set of past.sets.filter((row) => row.exerciseId === exerciseId)) {
        const date = past.sessions.get(set.sessionId)?.localDate;
        const estimate = epley(set.weightKg, set.reps);
        if (date !== undefined && estimate !== null) daily.set(date, Math.max(daily.get(date) ?? 0, estimate));
      }
      const trend = [...daily].map(([localDate, e1rmKg]) => ({ localDate, e1rmKg })).sort((a, b) => a.localDate.localeCompare(b.localDate));
      exercises.push({ exerciseId, name: exercise.name, bestE1rmKg: past.historyLimited || trend.length === 0 ? null : Math.max(...trend.map((point) => point.e1rmKg)), trend, previousSets: past.historyLimited ? [] : previousSets(past.sets, past.sessions, exerciseId) });
    }
    exercises.sort((a, b) => (b.bestE1rmKg ?? 0) - (a.bestE1rmKg ?? 0) || a.name.localeCompare(b.name));
    return { weeklyVolume, exercises, historyLimited: past.historyLimited, historySetLimit: MAX_HISTORY_SETS };
  },
});

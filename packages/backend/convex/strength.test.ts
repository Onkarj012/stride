import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const START = Date.UTC(2026, 9, 5, 19);

afterEach(() => vi.useRealTimers());

/** Creates an IST user and a shared strength exercise without importing a dataset. */
async function setup(transactionLimits = false) {
  const t = convexTest({ schema, modules, transactionLimits });
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "session", startedAt: START, name: "Evening workout" });
  return { t, user, exerciseId, sessionId };
}

/** Logs one baseline set into the setup workout. */
async function withSet(transactionLimits = false) {
  const data = await setup(transactionLimits);
  const setId = await data.user.mutation(api.strength.addSet, { submissionId: "add", sessionId: data.sessionId, exerciseId: data.exerciseId, weightKg: 60, reps: 8, rpe: 7 });
  return { ...data, setId };
}

test("startSession retries once and resolves IST midnight without touching calorie data", async () => {
  const { t, user, sessionId } = await setup();
  expect(await user.mutation(api.strength.startSession, { submissionId: "session", startedAt: START })).toBe(sessionId);
  const session = await t.run((ctx) => ctx.db.get("workout_sessions", sessionId));
  expect(session).toMatchObject({ localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START });
  expect(await user.query(api.strength.sessionsForDay, { localDate: "2026-10-05" })).toEqual([]);
  expect((await user.query(api.strength.sessionsForDay, { localDate: "2026-10-06" })).map((row) => row._id)).toEqual([sessionId]);
  expect(await t.run((ctx) => ctx.db.query("day_totals").take(1))).toEqual([]);
});

test("startSession uses today and rejects missing zones, bad ids, names and instants", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const { t, user } = await setup();
  const id = await user.mutation(api.strength.startSession, { submissionId: "now" });
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", id))).toMatchObject({ localDate: "2026-10-06", startedAt: START });
  const noZone = t.withIdentity({ subject: "no_zone" });
  await expect(noZone.mutation(api.strength.startSession, { submissionId: "missing" })).rejects.toThrow(/Time zone not set/);
  await expect(user.mutation(api.strength.startSession, { submissionId: "" })).rejects.toThrow(/submissionId/);
  await expect(user.mutation(api.strength.startSession, { submissionId: "invalid-name", name: " " })).rejects.toMatchObject({ data: { code: "INVALID_TEXT" } });
  await expect(user.mutation(api.strength.startSession, { submissionId: "invalid-time", startedAt: Infinity })).rejects.toMatchObject({ data: { code: "INVALID_DATE" } });
});

test("endSession is idempotent, validates chronology and blocks new sets", async () => {
  const { t, user, sessionId, exerciseId, setId } = await withSet();
  await expect(user.mutation(api.strength.endSession, { sessionId, endedAt: START - 1 })).rejects.toMatchObject({ data: { code: "END_BEFORE_START" } });
  expect(await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 })).toBe(sessionId);
  expect(await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 120_000 })).toBe(sessionId);
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", sessionId))).toMatchObject({ endedAt: START + 60_000 });
  await expect(user.mutation(api.strength.addSet, { submissionId: "after-finish", sessionId, exerciseId, weightKg: 60, reps: 8 })).rejects.toMatchObject({ data: { code: "SESSION_FINISHED" } });
  expect(await user.mutation(api.strength.addSet, { submissionId: "add", sessionId, exerciseId, weightKg: 60, reps: 8 })).toBe(setId);
  await user.mutation(api.strength.editSet, { submissionId: "correct-finished", setId, reps: 9 });
});

test("addSet retries once and gives each exercise ordered set numbers", async () => {
  const { t, user, sessionId, exerciseId, setId } = await withSet();
  expect(await user.mutation(api.strength.addSet, { submissionId: "add", sessionId, exerciseId, weightKg: 60, reps: 8 })).toBe(setId);
  const second = await user.mutation(api.strength.addSet, { submissionId: "add-2", sessionId, exerciseId, weightKg: 62.5, reps: 6 });
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.exercises[0]?.sets.map((set) => [set._id, set.setIndex])).toEqual([[setId, 1], [second, 2]]);
  expect(detail.summary).toMatchObject({ setCount: 2, volumeKg: 855 });
  expect(await t.run((ctx) => ctx.db.query("sets").take(5))).toHaveLength(2);
});

test("weight basis survives set revisions and cardio does not affect strength totals", async () => {
  const { user, sessionId, exerciseId } = await setup();
  const setId = await user.mutation(api.strength.addSet, { submissionId: "basis", sessionId, exerciseId, weightKg: 10, reps: 8, weightBasis: "each" });
  await user.mutation(api.strength.editSet, { submissionId: "basis-edit", setId, weightBasis: "total" });
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.exercises[0]?.sets[0]).toMatchObject({ weightKg: 10, weightBasis: "total" });
  expect(detail.summary.setCount).toBe(1);
  await user.mutation(api.strength.addCardio, { submissionId: "walk", sessionId, exerciseId: await user.mutation(api.exercises.createPersonal, { name: "Walking", kind: "cardio" }), durationMin: 10, reportedKcal: 60 });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary).toMatchObject({ setCount: 1, cardioCount: 1, reportedKcal: 60 });
});

test("addSet validates numbers, allows bodyweight and suppresses high-rep e1RM", async () => {
  const { user, sessionId, exerciseId } = await setup();
  for (const values of [{ weightKg: -1, reps: 8 }, { weightKg: 1001, reps: 8 }, { weightKg: 60, reps: 0 }, { weightKg: 60, reps: 1.5 }, { weightKg: 60, reps: 8, rpe: 11 }]) {
    await expect(user.mutation(api.strength.addSet, { submissionId: "bad", sessionId, exerciseId, ...values })).rejects.toMatchObject({ data: { code: "INVALID_SET" } });
  }
  await user.mutation(api.strength.addSet, { submissionId: "bodyweight", sessionId, exerciseId, weightKg: 0, reps: 10 });
  await user.mutation(api.strength.addSet, { submissionId: "high-reps", sessionId, exerciseId, weightKg: 60, reps: 13 });
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.exercises[0]?.sets.map((set) => set.e1rmKg)).toEqual([null, null]);
  expect(detail.summary.newBests).toEqual([]);
});

test("editSet appends revisions, clears RPE and rejects stale edits or empty changes", async () => {
  const { t, user, sessionId, setId } = await withSet();
  const edited = await user.mutation(api.strength.editSet, { submissionId: "edit", setId, weightKg: 65, rpe: null });
  expect(await user.mutation(api.strength.editSet, { submissionId: "edit", setId, weightKg: 65, rpe: null })).toBe(edited);
  expect(await t.run((ctx) => ctx.db.get("sets", setId))).toMatchObject({ status: "superseded" });
  const row = await t.run((ctx) => ctx.db.get("sets", edited));
  expect(row).toMatchObject({ revision: 2, supersedes: setId, status: "live", weightKg: 65, op: "edit" });
  expect(row?.rpe).toBeUndefined();
  await expect(user.mutation(api.strength.editSet, { submissionId: "stale", setId, reps: 9 })).rejects.toMatchObject({ data: { code: "STALE_REVISION" } });
  await expect(user.mutation(api.strength.editSet, { submissionId: "empty", setId: edited })).rejects.toThrow(/at least one/);
  await expect(user.mutation(api.strength.editSet, { submissionId: "bad", setId: edited, reps: 0 })).rejects.toMatchObject({ data: { code: "INVALID_SET" } });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.volumeKg).toBe(520);
});

test("deleteSet creates a tombstone and undo restores the previous content", async () => {
  const { t, user, sessionId, setId } = await withSet();
  const deleted = await user.mutation(api.strength.deleteSet, { submissionId: "delete", setId });
  expect(await user.mutation(api.strength.deleteSet, { submissionId: "delete", setId })).toBe(deleted);
  expect(await t.run((ctx) => ctx.db.get("sets", deleted))).toMatchObject({ status: "deleted", op: "delete", revision: 2 });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.setCount).toBe(0);
  await expect(user.mutation(api.strength.editSet, { submissionId: "deleted-edit", setId: deleted, reps: 9 })).rejects.toMatchObject({ data: { code: "ALREADY_DELETED" } });
  await expect(user.mutation(api.strength.deleteSet, { submissionId: "deleted-again", setId: deleted })).rejects.toMatchObject({ data: { code: "ALREADY_DELETED" } });
  const restored = await user.mutation(api.strength.undoRevision, { submissionId: "undo", setId: deleted });
  expect(await user.mutation(api.strength.undoRevision, { submissionId: "undo", setId: deleted })).toBe(restored);
  expect(await t.run((ctx) => ctx.db.get("sets", restored))).toMatchObject({ status: "live", weightKg: 60, reps: 8, rpe: 7, revision: 3 });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.volumeKg).toBe(480);
});

test("undoRevision restores an edit and undoing an add deletes it", async () => {
  const { t, user, setId, sessionId, exerciseId } = await withSet();
  const edited = await user.mutation(api.strength.editSet, { submissionId: "edit", setId, reps: 6 });
  const undone = await user.mutation(api.strength.undoRevision, { submissionId: "undo-edit", setId: edited });
  expect(await t.run((ctx) => ctx.db.get("sets", undone))).toMatchObject({ reps: 8, status: "live" });
  const extra = await user.mutation(api.strength.addSet, { submissionId: "extra", sessionId, exerciseId, weightKg: 70, reps: 5 });
  const removed = await user.mutation(api.strength.undoRevision, { submissionId: "undo-add", setId: extra });
  expect(await t.run((ctx) => ctx.db.get("sets", removed))).toMatchObject({ status: "deleted", op: "undo" });
});

test("submission ids cannot be reused for a different operation or set", async () => {
  const { user, setId, sessionId, exerciseId } = await withSet();
  await expect(user.mutation(api.strength.editSet, { submissionId: "add", setId, reps: 9 })).rejects.toThrow(/different change/);
  const edited = await user.mutation(api.strength.editSet, { submissionId: "edit", setId, reps: 9 });
  await expect(user.mutation(api.strength.deleteSet, { submissionId: "edit", setId: edited })).rejects.toThrow(/different change/);
  await expect(user.mutation(api.strength.addSet, { submissionId: "edit", sessionId, exerciseId, weightKg: 70, reps: 5 })).rejects.toThrow(/different change/);
});

test("all public strength functions reject signed-out callers", async () => {
  const { t, setId, sessionId, exerciseId } = await withSet();
  const calls = [
    t.mutation(api.strength.startSession, { submissionId: "x" }),
    t.mutation(api.strength.endSession, { sessionId }),
    t.mutation(api.strength.addSet, { submissionId: "x", sessionId, exerciseId, weightKg: 60, reps: 8 }),
    t.mutation(api.strength.editSet, { submissionId: "x", setId, reps: 9 }),
    t.mutation(api.strength.deleteSet, { submissionId: "x", setId }),
    t.mutation(api.strength.undoRevision, { submissionId: "x", setId }),
    t.query(api.strength.sessionsForDay, {}),
    t.query(api.strength.activeSession, {}),
    t.query(api.strength.sessionDetail, { sessionId }),
    t.query(api.strength.exerciseHints, { sessionId, exerciseId }),
    t.query(api.strength.savedSessions, { paginationOpts: { numItems: 20, cursor: null } }),
    t.query(api.strength.stats, {}),
  ];
  for (const call of calls) await expect(call).rejects.toThrow(/Unauthenticated/);
});

test("session and set id arguments enforce ownership", async () => {
  const { t, sessionId, exerciseId, setId } = await withSet();
  const other = t.withIdentity({ subject: "user_b" });
  await other.mutation(api.time_zone.setTimeZone, { timeZone: "UTC" });
  await expect(other.mutation(api.strength.endSession, { sessionId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  await expect(other.query(api.strength.sessionDetail, { sessionId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  await expect(other.query(api.strength.exerciseHints, { sessionId, exerciseId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  await expect(other.mutation(api.strength.addSet, { submissionId: "x", sessionId, exerciseId, weightKg: 60, reps: 8 })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  await expect(other.mutation(api.strength.editSet, { submissionId: "x", setId, reps: 9 })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  await expect(other.mutation(api.strength.deleteSet, { submissionId: "x", setId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  await expect(other.mutation(api.strength.undoRevision, { submissionId: "x", setId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  expect(await other.query(api.strength.sessionsForDay, { localDate: "2026-10-06" })).toEqual([]);
  expect((await other.query(api.strength.stats, {})).exercises).toEqual([]);
  expect((await other.query(api.strength.savedSessions, { paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
});

test("undo rejects a previous revision belonging to another user", async () => {
  const { t, user, setId, sessionId, exerciseId } = await withSet();
  const foreign = await t.run((ctx) => ctx.db.insert("sets", { userId: "user_b", sessionId, exerciseId, weightKg: 99, reps: 1, setIndex: 1, revision: 1, status: "superseded", submissionId: "foreign" }));
  await t.run((ctx) => ctx.db.patch("sets", setId, { supersedes: foreign }));
  await expect(user.mutation(api.strength.undoRevision, { submissionId: "x", setId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
});

test("each strength mutation refuses writes and retries during clearAllData", async () => {
  const { t, user, sessionId, exerciseId, setId } = await withSet();
  await t.run((ctx) => ctx.db.insert("ledger_clears", { userId: "user_a" }));
  for (const call of [
    user.mutation(api.strength.startSession, { submissionId: "session" }),
    user.mutation(api.strength.endSession, { sessionId }),
    user.mutation(api.strength.addSet, { submissionId: "add", sessionId, exerciseId, weightKg: 60, reps: 8 }),
    user.mutation(api.strength.editSet, { submissionId: "edit", setId, reps: 9 }),
    user.mutation(api.strength.deleteSet, { submissionId: "delete", setId }),
    user.mutation(api.strength.undoRevision, { submissionId: "undo", setId }),
  ]) await expect(call).rejects.toThrow(/being cleared/);
});

test("sessionDetail gives previous completed sets, totals and new e1RM bests", async () => {
  const { user, sessionId, exerciseId, setId } = await withSet();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  const next = await user.mutation(api.strength.startSession, { submissionId: "next", startedAt: START + 86_400_000 });
  const nextSet = await user.mutation(api.strength.addSet, { submissionId: "next-add", sessionId: next, exerciseId, weightKg: 70, reps: 6 });
  const future = await user.mutation(api.strength.startSession, { submissionId: "future", startedAt: START + 172_800_000 });
  await user.mutation(api.strength.addSet, { submissionId: "future-add", sessionId: future, exerciseId, weightKg: 100, reps: 6 });
  await user.mutation(api.strength.endSession, { sessionId: future, endedAt: START + 172_860_000 });
  const detail = await user.query(api.strength.sessionDetail, { sessionId: next });
  expect(detail.exercises[0]?.previousSets.map((set) => set._id)).toEqual([setId]);
  expect((await user.query(api.strength.exerciseHints, { sessionId: next, exerciseId })).previousSets.map((set) => set._id)).toEqual([setId]);
  expect(detail.exercises[0]?.sets.map((set) => set._id)).toEqual([nextSet]);
  expect(detail.summary).toEqual({ setCount: 1, volumeKg: 420, newBests: [{ exerciseId, name: "Bench press", e1rmKg: 84, previousBestKg: 76 }], cardioCount: 0, reportedKcal: null });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.newBests[0]?.previousBestKg).toBeNull();
});

test("stats keeps lifetime e1RM history independent of requested weekly volume", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 20, 6));
  const { user, sessionId, exerciseId, setId } = await withSet();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  const recent = await user.mutation(api.strength.startSession, { submissionId: "recent", startedAt: Date.UTC(2026, 9, 19, 6) });
  const recentSet = await user.mutation(api.strength.addSet, { submissionId: "recent-add", sessionId: recent, exerciseId, weightKg: 50, reps: 8 });
  const active = await user.query(api.strength.stats, { weeks: 1, exerciseId });
  expect(active.exercises[0]?.previousSets.map((set) => set._id)).toEqual([setId]);
  await user.mutation(api.strength.endSession, { sessionId: recent, endedAt: Date.UTC(2026, 9, 19, 7) });
  const stats = await user.query(api.strength.stats, { weeks: 1, exerciseId });
  expect(stats.weeklyVolume).toEqual([{ weekStart: "2026-10-19", muscles: [{ muscle: "chest", sets: 1, tonnageKg: 400 }, { muscle: "triceps", sets: 0.5, tonnageKg: 0 }] }]);
  expect(stats.exercises[0]?.bestE1rmKg).toBe(76);
  expect(stats.exercises[0]?.trend.map((point) => point.localDate)).toEqual(["2026-10-06", "2026-10-19"]);
  expect(stats.exercises[0]?.previousSets.map((set) => set._id)).toEqual([recentSet]);
  await user.mutation(api.strength.deleteSet, { submissionId: "remove-recent", setId: recentSet });
  expect((await user.query(api.strength.stats, { weeks: 1 })).weeklyVolume[0]?.muscles).toEqual([]);
});

test("stats follows the requested local day for the week it reports", async () => {
  const { user, sessionId, exerciseId } = await withSet();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  const later = await user.mutation(api.strength.startSession, { submissionId: "later", startedAt: Date.UTC(2026, 9, 19, 6) });
  await user.mutation(api.strength.addSet, { submissionId: "later-add", sessionId: later, exerciseId, weightKg: 50, reps: 8 });
  const earlier = await user.query(api.strength.stats, { weeks: 1, localDate: "2026-10-06" });
  expect(earlier.weeklyVolume).toEqual([{ weekStart: "2026-10-05", muscles: [{ muscle: "chest", sets: 1, tonnageKg: 480 }, { muscle: "triceps", sets: 0.5, tonnageKg: 0 }] }]);
});

test("stats returns empty weeks and rejects invalid bounds or missing exercises", async () => {
  const { t, user, exerciseId } = await setup();
  expect((await user.query(api.strength.stats, { weeks: 12 })).weeklyVolume).toHaveLength(12);
  for (const weeks of [0, 13, 1.5]) await expect(user.query(api.strength.stats, { weeks })).rejects.toThrow(/weeks/);
  await t.run((ctx) => ctx.db.delete("exercises", exerciseId));
  await expect(user.query(api.strength.stats, { exerciseId })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
});

test("sessionsForDay validates dates and refuses silently truncated days", async () => {
  const { t, user } = await setup();
  await expect(user.query(api.strength.sessionsForDay, { localDate: "2026-13-01" })).rejects.toThrow(/YYYY-MM-DD/);
  await t.run(async (ctx) => {
    for (let index = 0; index < 30; index++) await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START + index, submissionId: `overflow-${index}` });
  });
  await expect(user.query(api.strength.sessionsForDay, { localDate: "2026-10-06" })).rejects.toMatchObject({ data: { code: "LIMIT_REACHED" } });
});

test("sessionDetail and addSet refuse session set overflow", async () => {
  const { t, user, sessionId, exerciseId } = await setup();
  await t.run(async (ctx) => {
    for (let index = 0; index < 200; index++) await ctx.db.insert("sets", { userId: "user_a", sessionId, exerciseId, setIndex: index + 1, weightKg: 60, reps: 8, revision: 1, status: "live", submissionId: `set-${index}` });
  });
  await expect(user.mutation(api.strength.addSet, { submissionId: "overflow", sessionId, exerciseId, weightKg: 60, reps: 8 })).rejects.toMatchObject({ data: { code: "LIMIT_REACHED" } });
  await t.run((ctx) => ctx.db.insert("sets", { userId: "user_a", sessionId, exerciseId, setIndex: 201, weightKg: 60, reps: 8, revision: 1, status: "live", submissionId: "overflow-seed" }));
  await expect(user.query(api.strength.sessionDetail, { sessionId })).rejects.toMatchObject({ data: { code: "LIMIT_REACHED" } });
});

test("empty lifetime sessions do not block stats or workout details", async () => {
  const { t, user, sessionId } = await withSet();
  await t.run(async (ctx) => {
    for (let index = 0; index < 1000; index++) await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START + index, submissionId: `history-${index}` });
  });
  expect((await user.query(api.strength.stats, {})).historyLimited).toBe(false);
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.setCount).toBe(1);
});

test("large set history stays readable and marks incomplete comparisons", async () => {
  const { t, user, sessionId, exerciseId } = await withSet();
  await t.run(async (ctx) => {
    for (let index = 0; index < 26; index++) {
      const id = await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-07", timeZone: "Asia/Kolkata", startedAt: START + 86_400_000 + index, endedAt: START + 86_460_000 + index, submissionId: `large-${index}` });
      for (let slot = 0; slot < 200; slot++) await ctx.db.insert("sets", { userId: "user_a", sessionId: id, exerciseId, setIndex: slot + 1, weightKg: 50, reps: 8, revision: 1, status: "live", submissionId: `large-${index}-${slot}` });
    }
  });
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.historyLimited).toBe(true);
  expect(detail.summary).toMatchObject({ setCount: 1, volumeKg: 480, newBests: [] });
  const stats = await user.query(api.strength.stats, { localDate: "2026-10-07", weeks: 1 });
  expect(stats.historyLimited).toBe(true);
  expect(stats.exercises[0]?.bestE1rmKg).toBeNull();
  expect(stats.exercises[0]?.previousSets).toEqual([]);
  expect((await user.query(api.strength.exerciseHints, { sessionId, exerciseId })).previousSets).toEqual([]);
  await user.mutation(api.strength.addSet, { submissionId: "still-loggable", sessionId, exerciseId, weightKg: 65, reps: 8 });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.setCount).toBe(2);
});

test("history fits Convex read limits when every set has a different session and exercise", async () => {
  const { t, user, sessionId, exerciseId } = await withSet(true);
  await t.run(async (ctx) => {
    for (let index = 0; index < 5000; index++) {
      const lift = await ctx.db.insert("exercises", { sourceId: `budget-${index}`, name: `Lift ${index}`, category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] });
      const session = await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-07", timeZone: "Asia/Kolkata", startedAt: START + 86_400_000 + index, endedAt: START + 86_460_000 + index, submissionId: `budget-${index}` });
      await ctx.db.insert("sets", { userId: "user_a", sessionId: session, exerciseId: lift, setIndex: 1, weightKg: 50, reps: 8, revision: 1, status: "live", submissionId: `budget-${index}` });
    }
  });
  const stats = await user.query(api.strength.stats, { localDate: "2026-10-07", weeks: 1 });
  expect(stats.historyLimited).toBe(true);
  expect(stats.exercises).toHaveLength(stats.historySetLimit);
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.summary).toMatchObject({ setCount: 1, volumeKg: 480 });
  // Hints read only this exercise's history, so thousands of other lifts no longer cut it short.
  expect(detail.historyLimited).toBe(false);
  expect((await user.query(api.strength.exerciseHints, { sessionId, exerciseId })).historyLimited).toBe(false);
});

test("a workout with several long-history lifts shares one read budget and still loads", async () => {
  const { t, user, sessionId } = await withSet(true);
  for (let lift = 0; lift < 5; lift++) {
    const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: `long-${lift}`, name: `Long lift ${lift}`, category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
    await t.run(async (ctx) => {
      for (let index = 0; index < 900; index++) {
        const startedAt = START - 172_800_000 - index * 1_000;
        const session = await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-04", timeZone: "Asia/Kolkata", startedAt, endedAt: startedAt + 60_000, submissionId: `long-${lift}-session-${index}` });
        await ctx.db.insert("sets", { userId: "user_a", sessionId: session, exerciseId, setIndex: 1, weightKg: 50, reps: 8, revision: 1, status: "live", submissionId: `long-${lift}-set-${index}` });
      }
    });
    await user.mutation(api.strength.addSet, { submissionId: `long-${lift}-add`, sessionId, exerciseId, weightKg: 60, reps: 8 });
  }
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.historyLimited).toBe(true);
  expect(detail.summary.setCount).toBe(6);
});

test("a lift that runs out of history budget does not hide hints for a complete lift", async () => {
  const { t, user, sessionId, exerciseId: liftA } = await setup(true);
  const liftB = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "row", name: "Row", category: "strength", equipment: null, mechanic: null, level: null, primaryMuscles: ["back"], secondaryMuscles: [] }));
  // Lift B is added first so it is read first and keeps its budget.
  await user.mutation(api.strength.addSet, { submissionId: "b-add", sessionId, exerciseId: liftB, weightKg: 50, reps: 8 });
  await user.mutation(api.strength.addSet, { submissionId: "a-add", sessionId, exerciseId: liftA, weightKg: 60, reps: 8 });
  await t.run(async (ctx) => {
    const oldB = await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-05", timeZone: "Asia/Kolkata", startedAt: START - 86_400_000, endedAt: START - 86_340_000, submissionId: "old-b" });
    await ctx.db.insert("sets", { userId: "user_a", sessionId: oldB, exerciseId: liftB, setIndex: 1, weightKg: 50, reps: 8, revision: 1, status: "live", submissionId: "old-b-set" });
    const oldA = await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-04", timeZone: "Asia/Kolkata", startedAt: START - 172_800_000, endedAt: START - 172_740_000, submissionId: "old-a" });
    for (let index = 0; index < 1000; index++) await ctx.db.insert("sets", { userId: "user_a", sessionId: oldA, exerciseId: liftA, setIndex: index + 1, weightKg: 40, reps: 8, revision: 1, status: "live", submissionId: `old-a-set-${index}` });
  });
  const detail = await user.query(api.strength.sessionDetail, { sessionId });
  expect(detail.historyLimited).toBe(true);
  const a = detail.exercises.find((e) => e.exercise._id === liftA);
  const b = detail.exercises.find((e) => e.exercise._id === liftB);
  expect(a?.historyLimited).toBe(true);
  expect(a?.previousSets).toEqual([]);
  expect(b?.historyLimited).toBe(false);
  expect(b?.previousSets.map((set) => set.weightKg)).toEqual([50]);
});

test("hints still find the previous bench session behind hundreds of newer sets of another lift", async () => {
  const { t, user, sessionId, exerciseId, setId } = await withSet();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  await t.run(async (ctx) => {
    const squat = await ctx.db.insert("exercises", { sourceId: "squat", name: "Squat", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["quadriceps"], secondaryMuscles: [] });
    for (let index = 0; index < 5; index++) {
      const id = await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START + 1_000 + index, endedAt: START + 2_000 + index, submissionId: `squat-${index}` });
      for (let slot = 0; slot < 200; slot++) await ctx.db.insert("sets", { userId: "user_a", sessionId: id, exerciseId: squat, setIndex: slot + 1, weightKg: 80, reps: 5, revision: 1, status: "live", submissionId: `squat-${index}-${slot}` });
    }
  });
  const next = await user.mutation(api.strength.startSession, { submissionId: "next", startedAt: START + 86_400_000 });
  await user.mutation(api.strength.addSet, { submissionId: "next-add", sessionId: next, exerciseId, weightKg: 70, reps: 6 });
  const detail = await user.query(api.strength.sessionDetail, { sessionId: next });
  expect(detail.historyLimited).toBe(false);
  expect(detail.exercises[0]?.previousSets.map((set) => set._id)).toEqual([setId]);
  expect(detail.summary.newBests).toEqual([{ exerciseId, name: "Bench press", e1rmKg: 84, previousBestKg: 76 }]);
  expect((await user.query(api.strength.exerciseHints, { sessionId: next, exerciseId })).previousSets.map((set) => set._id)).toEqual([setId]);
});

test("recentExercises lists distinct lifts newest first, at most six, skipping deleted sessions", async () => {
  const { t, user, sessionId, exerciseId } = await setup();
  expect(await user.query(api.strength.recentExercises, {})).toEqual([]);
  const lifts = await t.run(async (ctx) => {
    const ids = [];
    for (let index = 0; index < 8; index++) ids.push(await ctx.db.insert("exercises", { sourceId: `lift-${index}`, name: `Lift ${index}`, category: "strength", equipment: null, mechanic: null, level: null, primaryMuscles: ["chest"], secondaryMuscles: [] }));
    return ids;
  });
  await user.mutation(api.strength.addSet, { submissionId: "bench-1", sessionId, exerciseId, weightKg: 60, reps: 8 });
  for (const [index, lift] of lifts.entries()) await user.mutation(api.strength.addSet, { submissionId: `lift-${index}`, sessionId, exerciseId: lift, weightKg: 40, reps: 8 });
  await user.mutation(api.strength.addSet, { submissionId: "bench-2", sessionId, exerciseId, weightKg: 62, reps: 8 });
  expect(await user.query(api.strength.recentExercises, {})).toEqual([exerciseId, lifts[7], lifts[6], lifts[5], lifts[4], lifts[3]]);
  await t.run((ctx) => ctx.db.patch("workout_sessions", sessionId, { deletedAt: Date.now() }));
  expect(await user.query(api.strength.recentExercises, {})).toEqual([]);
  expect(await t.withIdentity({ subject: "user_b" }).query(api.strength.recentExercises, {})).toEqual([]);
});

test("recentExercises ranks by workout time, so editing an old set does not move its lift up", async () => {
  const { t, user, setId, exerciseId } = await withSet();
  const row = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "row", name: "Row", category: "strength", equipment: null, mechanic: null, level: null, primaryMuscles: ["back"], secondaryMuscles: [] }));
  const newer = await user.mutation(api.strength.startSession, { submissionId: "newer", startedAt: START + 86_400_000 });
  await user.mutation(api.strength.addSet, { submissionId: "row-add", sessionId: newer, exerciseId: row, weightKg: 50, reps: 8 });
  await user.mutation(api.strength.editSet, { submissionId: "old-edit", setId, reps: 9 });
  expect(await user.query(api.strength.recentExercises, {})).toEqual([row, exerciseId]);
});

test("recentWorkouts skips empty and open sessions and respects the limit", async () => {
  const { user, sessionId, exerciseId } = await setup();
  await user.mutation(api.strength.addSet, { submissionId: "bench-1", sessionId, exerciseId, weightKg: 60, reps: 8 });
  await user.mutation(api.strength.addSet, { submissionId: "bench-2", sessionId, exerciseId, weightKg: 60, reps: 6 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  const empty = await user.mutation(api.strength.startSession, { submissionId: "empty", startedAt: START + 86_400_000 });
  await user.mutation(api.strength.endSession, { sessionId: empty, endedAt: START + 86_460_000 });
  const newest = await user.mutation(api.strength.startSession, { submissionId: "newest", startedAt: START + 172_800_000 });
  await user.mutation(api.strength.addSet, { submissionId: "newest-bench", sessionId: newest, exerciseId, weightKg: 62, reps: 5 });
  await user.mutation(api.strength.endSession, { sessionId: newest, endedAt: START + 172_860_000 });
  const open = await user.mutation(api.strength.startSession, { submissionId: "open", startedAt: START + 259_200_000 });
  await user.mutation(api.strength.addSet, { submissionId: "open-bench", sessionId: open, exerciseId, weightKg: 62, reps: 5 });
  expect((await user.query(api.strength.recentWorkouts, { limit: 5 })).map((w) => [w.sessionId, w.exercises.map((e) => e.sets)])).toEqual([[newest, [1]], [sessionId, [2]]]);
  expect((await user.query(api.strength.recentWorkouts, { limit: 1 })).map((w) => w.sessionId)).toEqual([newest]);
  await expect(user.query(api.strength.recentWorkouts, { limit: 6 })).rejects.toThrow(/limit/);
});

test("saved workouts page through older sessions and reopen finished sets for edits", async () => {
  const { t, user, sessionId, setId } = await withSet();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  await t.run(async (ctx) => {
    for (let index = 0; index < 25; index++) await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-07", timeZone: "Asia/Kolkata", startedAt: START + 86_400_000 + index, endedAt: START + 86_460_000 + index, submissionId: `saved-${index}` });
    await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-07", timeZone: "Asia/Kolkata", startedAt: START + 172_800_000, submissionId: "hidden", deletedAt: START });
  });
  const first = await user.query(api.strength.savedSessions, { paginationOpts: { numItems: 20, cursor: null } });
  expect(first.page).toHaveLength(20);
  expect(first.isDone).toBe(false);
  const next = await user.query(api.strength.savedSessions, { paginationOpts: { numItems: 20, cursor: first.continueCursor } });
  expect(next.page.at(-1)?._id).toBe(sessionId);
  expect(next.isDone).toBe(true);
  await user.mutation(api.strength.editSet, { submissionId: "reopen-edit", setId, reps: 9 });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).exercises[0]?.sets[0]?.reps).toBe(9);
});

test("an empty session can finish and clears the resume flow", async () => {
  const { user, sessionId } = await setup();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  expect(await user.query(api.strength.activeSession, {})).toBeNull();
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.setCount).toBe(0);
});

test("activeSession finds an open workout behind more than twenty finished sessions", async () => {
  const { t, user, sessionId } = await setup();
  await t.run(async (ctx) => {
    for (let index = 0; index < 25; index++) await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-07", timeZone: "Asia/Kolkata", startedAt: START + 86_400_000 + index, endedAt: START + 86_460_000 + index, submissionId: `ended-${index}` });
  });
  expect((await user.query(api.strength.activeSession, {}))?._id).toBe(sessionId);
});

test("deleted tail sets keep their index when added sets are undone later", async () => {
  const { user, sessionId, exerciseId, setId } = await withSet();
  const deleted = await user.mutation(api.strength.deleteSet, { submissionId: "delete-tail", setId });
  await user.mutation(api.strength.addSet, { submissionId: "new-tail", sessionId, exerciseId, weightKg: 70, reps: 5 });
  await user.mutation(api.strength.undoRevision, { submissionId: "restore-tail", setId: deleted });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).exercises[0]?.sets.map((set) => set.setIndex)).toEqual([1, 2]);
});

test("undo cannot restore a deleted set above the session cap", async () => {
  const { t, user, sessionId, exerciseId, setId } = await withSet();
  const deleted = await user.mutation(api.strength.deleteSet, { submissionId: "delete", setId });
  await t.run(async (ctx) => {
    for (let index = 0; index < 200; index++) await ctx.db.insert("sets", { userId: "user_a", sessionId, exerciseId, setIndex: index + 2, weightKg: 60, reps: 8, revision: 1, status: "live", submissionId: `cap-${index}` });
  });
  await expect(user.mutation(api.strength.undoRevision, { submissionId: "undo-overflow", setId: deleted })).rejects.toMatchObject({ data: { code: "LIMIT_REACHED" } });
});

test("activeSession finds an unfinished session from an earlier day, skipping ended, deleted and other users' sessions", async () => {
  const { t, user, sessionId } = await setup();
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  expect(await user.query(api.strength.activeSession, {})).toBeNull();
  const other = t.withIdentity({ subject: "user_b" });
  await other.mutation(api.time_zone.setTimeZone, { timeZone: "UTC" });
  await other.mutation(api.strength.startSession, { submissionId: "other", startedAt: START + 1_000 });
  await t.run((ctx) => ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START + 2_000, submissionId: "deleted", deletedAt: START + 3_000 }));
  const yesterday = await user.mutation(api.strength.startSession, { submissionId: "yesterday", startedAt: START - 86_400_000 });
  expect(await user.query(api.strength.activeSession, {})).toMatchObject({ _id: yesterday, localDate: "2026-10-05" });
});

test("startSession refuses a thirty-first session on one day", async () => {
  const { t, user } = await setup();
  await t.run(async (ctx) => {
    for (let index = 0; index < 29; index++) await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START + index, submissionId: `day-${index}` });
  });
  await expect(user.mutation(api.strength.startSession, { submissionId: "overflow", startedAt: START })).rejects.toMatchObject({ data: { code: "LIMIT_REACHED" } });
});

test("every successful mutation retry is also blocked during a ledger clear", async () => {
  const { t, user, sessionId, setId } = await withSet();
  const edited = await user.mutation(api.strength.editSet, { submissionId: "edit", setId, reps: 9 });
  const deleted = await user.mutation(api.strength.deleteSet, { submissionId: "delete", setId: edited });
  await user.mutation(api.strength.undoRevision, { submissionId: "undo", setId: deleted });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 });
  await t.run((ctx) => ctx.db.insert("ledger_clears", { userId: "user_a" }));
  for (const call of [
    user.mutation(api.strength.endSession, { sessionId }),
    user.mutation(api.strength.editSet, { submissionId: "edit", setId, reps: 9 }),
    user.mutation(api.strength.deleteSet, { submissionId: "delete", setId: edited }),
    user.mutation(api.strength.undoRevision, { submissionId: "undo", setId: deleted }),
  ]) await expect(call).rejects.toThrow(/being cleared/);
});

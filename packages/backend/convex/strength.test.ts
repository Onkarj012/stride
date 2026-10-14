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
  await expect(user.mutation(api.strength.startSession, { submissionId: "invalid-name", name: " " })).rejects.toThrow(/name/);
  await expect(user.mutation(api.strength.startSession, { submissionId: "invalid-time", startedAt: Infinity })).rejects.toThrow(/Timestamp/);
});

test("endSession is idempotent, validates chronology and blocks new sets", async () => {
  const { t, user, sessionId, exerciseId, setId } = await withSet();
  await expect(user.mutation(api.strength.endSession, { sessionId, endedAt: START - 1 })).rejects.toThrow(/endedAt/);
  expect(await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 60_000 })).toBe(sessionId);
  expect(await user.mutation(api.strength.endSession, { sessionId, endedAt: START + 120_000 })).toBe(sessionId);
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", sessionId))).toMatchObject({ endedAt: START + 60_000 });
  await expect(user.mutation(api.strength.addSet, { submissionId: "after-finish", sessionId, exerciseId, weightKg: 60, reps: 8 })).rejects.toThrow(/finished/);
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

test("addSet validates numbers, allows bodyweight and suppresses high-rep e1RM", async () => {
  const { user, sessionId, exerciseId } = await setup();
  for (const values of [{ weightKg: -1, reps: 8 }, { weightKg: 1001, reps: 8 }, { weightKg: 60, reps: 0 }, { weightKg: 60, reps: 1.5 }, { weightKg: 60, reps: 8, rpe: 11 }]) {
    await expect(user.mutation(api.strength.addSet, { submissionId: "bad", sessionId, exerciseId, ...values })).rejects.toThrow(/weightKg|reps|rpe/);
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
  await expect(user.mutation(api.strength.editSet, { submissionId: "stale", setId, reps: 9 })).rejects.toThrow(/newer revision/);
  await expect(user.mutation(api.strength.editSet, { submissionId: "empty", setId: edited })).rejects.toThrow(/at least one/);
  await expect(user.mutation(api.strength.editSet, { submissionId: "bad", setId: edited, reps: 0 })).rejects.toThrow(/reps/);
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.volumeKg).toBe(520);
});

test("deleteSet creates a tombstone and undo restores the previous content", async () => {
  const { t, user, sessionId, setId } = await withSet();
  const deleted = await user.mutation(api.strength.deleteSet, { submissionId: "delete", setId });
  expect(await user.mutation(api.strength.deleteSet, { submissionId: "delete", setId })).toBe(deleted);
  expect(await t.run((ctx) => ctx.db.get("sets", deleted))).toMatchObject({ status: "deleted", op: "delete", revision: 2 });
  expect((await user.query(api.strength.sessionDetail, { sessionId })).summary.setCount).toBe(0);
  await expect(user.mutation(api.strength.editSet, { submissionId: "deleted-edit", setId: deleted, reps: 9 })).rejects.toThrow(/deleted/);
  await expect(user.mutation(api.strength.deleteSet, { submissionId: "deleted-again", setId: deleted })).rejects.toThrow(/already deleted/);
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
  await expect(other.mutation(api.strength.endSession, { sessionId })).rejects.toThrow(/Session not found/);
  await expect(other.query(api.strength.sessionDetail, { sessionId })).rejects.toThrow(/Session not found/);
  await expect(other.query(api.strength.exerciseHints, { sessionId, exerciseId })).rejects.toThrow(/Session not found/);
  await expect(other.mutation(api.strength.addSet, { submissionId: "x", sessionId, exerciseId, weightKg: 60, reps: 8 })).rejects.toThrow(/Session not found/);
  await expect(other.mutation(api.strength.editSet, { submissionId: "x", setId, reps: 9 })).rejects.toThrow(/Set not found/);
  await expect(other.mutation(api.strength.deleteSet, { submissionId: "x", setId })).rejects.toThrow(/Set not found/);
  await expect(other.mutation(api.strength.undoRevision, { submissionId: "x", setId })).rejects.toThrow(/Set not found/);
  expect(await other.query(api.strength.sessionsForDay, { localDate: "2026-10-06" })).toEqual([]);
  expect((await other.query(api.strength.stats, {})).exercises).toEqual([]);
  expect((await other.query(api.strength.savedSessions, { paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
});

test("undo rejects a previous revision belonging to another user", async () => {
  const { t, user, setId, sessionId, exerciseId } = await withSet();
  const foreign = await t.run((ctx) => ctx.db.insert("sets", { userId: "user_b", sessionId, exerciseId, weightKg: 99, reps: 1, setIndex: 1, revision: 1, status: "superseded", submissionId: "foreign" }));
  await t.run((ctx) => ctx.db.patch("sets", setId, { supersedes: foreign }));
  await expect(user.mutation(api.strength.undoRevision, { submissionId: "x", setId })).rejects.toThrow(/Set not found/);
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
  expect(detail.summary).toEqual({ setCount: 1, volumeKg: 420, newBests: [{ exerciseId, name: "Bench press", e1rmKg: 84, previousBestKg: 76 }] });
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
  await expect(user.query(api.strength.stats, { exerciseId })).rejects.toThrow(/Exercise not found/);
});

test("sessionsForDay validates dates and refuses silently truncated days", async () => {
  const { t, user } = await setup();
  await expect(user.query(api.strength.sessionsForDay, { localDate: "2026-13-01" })).rejects.toThrow(/YYYY-MM-DD/);
  await t.run(async (ctx) => {
    for (let index = 0; index < 30; index++) await ctx.db.insert("workout_sessions", { userId: "user_a", localDate: "2026-10-06", timeZone: "Asia/Kolkata", startedAt: START + index, submissionId: `overflow-${index}` });
  });
  await expect(user.query(api.strength.sessionsForDay, { localDate: "2026-10-06" })).rejects.toThrow(/30 workout sessions/);
});

test("sessionDetail and addSet refuse session set overflow", async () => {
  const { t, user, sessionId, exerciseId } = await setup();
  await t.run(async (ctx) => {
    for (let index = 0; index < 200; index++) await ctx.db.insert("sets", { userId: "user_a", sessionId, exerciseId, setIndex: index + 1, weightKg: 60, reps: 8, revision: 1, status: "live", submissionId: `set-${index}` });
  });
  await expect(user.mutation(api.strength.addSet, { submissionId: "overflow", sessionId, exerciseId, weightKg: 60, reps: 8 })).rejects.toThrow(/200 sets/);
  await t.run((ctx) => ctx.db.insert("sets", { userId: "user_a", sessionId, exerciseId, setIndex: 201, weightKg: 60, reps: 8, revision: 1, status: "live", submissionId: "overflow-seed" }));
  await expect(user.query(api.strength.sessionDetail, { sessionId })).rejects.toThrow(/200 sets/);
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
  expect(detail.historyLimited).toBe(true);
  expect((await user.query(api.strength.exerciseHints, { sessionId, exerciseId })).historyLimited).toBe(true);
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
  await expect(user.mutation(api.strength.undoRevision, { submissionId: "undo-overflow", setId: deleted })).rejects.toThrow(/200 sets/);
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
  await expect(user.mutation(api.strength.startSession, { submissionId: "overflow", startedAt: START })).rejects.toThrow(/30 workout sessions/);
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

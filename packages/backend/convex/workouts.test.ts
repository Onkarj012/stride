import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { OPENROUTER_CHAT_URL } from "./pipeline/openrouter";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ACCEPTANCE = `My today's workout is as follows.\n- Lat pull down, long grip, 36, 39, 41 kgs, 15 reps each.\n- lat pull down, close grip: 30, 30 kgs, 15 reps each.\n- Compound row: 39 kgs, 39 kgs, 41 kgs: 15, 15, 12 reps\n- Rod Bicep curls, 15, 12.5, 15 kg: 15, 15, 12\n- inverse rod curls: 10, 10 kg rod: 15 reps each\n- Seated Hammer curls: 16, 20 kg: 15, 15\n- walking 10 min, 60 kcal burned`;

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

/** Creates a fixed-time IST user with plain-English workout logging enabled. */
async function setup() {
  vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 29, 5, 30));
  const t = convexTest(schema, modules); const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  await user.mutation(api.progress_v2.setPlainWorkouts, { on: true });
  return { t, user };
}

test("acceptance workout makes a review with 15 sets and one cardio item, then saves atomically", async () => {
  const { t, user } = await setup();
  const names = ["Lat pull down, long grip", "lat pull down, close grip", "Compound row", "Rod Bicep curls", "inverse rod curls", "Seated Hammer curls"];
  const [longGripId, closeGripId, compoundRowId] = await t.run(async (ctx) => Promise.all([
    ctx.db.insert("exercises", { sourceId: "lat-long", name: "Lat pull down, long grip", category: "strength", equipment: "cable", mechanic: "compound", level: "beginner", primaryMuscles: ["back"], secondaryMuscles: [] }),
    ctx.db.insert("exercises", { sourceId: "lat-close", name: "lat pull down, close grip", category: "strength", equipment: "cable", mechanic: "compound", level: "beginner", primaryMuscles: ["back"], secondaryMuscles: [] }),
    ctx.db.insert("exercises", { sourceId: "compound-row", name: "Compound row machine", category: "strength", equipment: "machine", mechanic: "compound", level: "beginner", primaryMuscles: ["back"], secondaryMuscles: [] }),
  ]));
  const items = [
    [[36, 39, 41], [15], "kg", null], [[30, 30], [15], "kg", null], [[39, 39, 41], [15, 15, 12], "kg", null],
    [[15, 12.5, 15], [15, 15, 12], "kg", null], [[10, 10], [15], "kg", null], [[16, 20], [15, 15], "kg", null],
  ].map(([weights, reps, unit]) => ({ name: "", kind: "strength", weights, reps, unit, basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: null }));
  items.forEach((item, index) => { item.name = names[index]!; });
  const cardio = { name: "walking", kind: "cardio", weights: [], reps: [], unit: "kg", basis: null, bodyweight: false, durationMin: 10, distanceKm: null, reportedKcal: 60, speedKmh: null, inclinePct: null, from: null };
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    if (String(input) !== OPENROUTER_CHAT_URL) throw new Error("unexpected request");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [...items, cardio], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } });
  }));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "parse-1", text: ACCEPTANCE });
  const view = await user.query(api.workouts.draft, { draftId });
  expect(view.draft).toMatchObject({ localDate: "2026-10-29", status: "pending" });
  expect(view.draft.durationMin).toBeUndefined();
  expect(view.draft.items.filter((item) => item.kind === "strength").map((item) => item.sets.length)).toEqual([3, 2, 3, 3, 2, 2]);
  expect(view.draft.items[0]?.name).not.toBe(view.draft.items[1]?.name);
  expect(view.draft.items[0]?.exerciseId).toBe(longGripId);
  expect(view.draft.items[1]?.exerciseId).toBe(closeGripId);
  expect(view.draft.items[2]?.exerciseId).toBeUndefined();
  expect(view.draft.items[2]?.candidateIds).toContain(compoundRowId);
  expect(view.draft.items[2]?.exerciseId).toBeUndefined();
  expect(view.draft.items[6]).toMatchObject({ kind: "cardio", sets: [], cardio: { durationMin: 10, reportedKcal: 60 } });
  const saved = await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "save-1" });
  expect(await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "save-1" })).toEqual(saved);
  expect(await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", saved.sessionId).eq("status", "live")).take(200))).toHaveLength(15);
  expect(await t.run((ctx) => ctx.db.query("cardio").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", saved.sessionId).eq("status", "live")).take(10))).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("day_totals").take(10))).toEqual([]);
  await user.mutation(api.workouts.undoDraft, { draftId, submissionId: "undo-1" });
  await user.mutation(api.workouts.undoDraft, { draftId, submissionId: "undo-1" });
  expect(await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", saved.sessionId).eq("status", "live")).take(200))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", saved.sessionId))).toMatchObject({ deletedAt: expect.any(Number) });
});

test("pending reviews list only the caller's pending non-chat drafts, newest first", async () => {
  const { t, user } = await setup();
  const other = t.withIdentity({ subject: "user_b" });
  await other.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  const first = await user.mutation(api.workouts.blankDraft, { submissionId: "pending-1" });
  const chatId = await t.run((ctx) => ctx.db.insert("chats", { userId: "user_a", title: "Chat", updatedAt: Date.now() }));
  await t.run((ctx) => ctx.db.insert("workout_drafts", { userId: "user_a", chatId, submissionId: "chat-draft", status: "pending", source: "coach", inputText: "", mode: "new", needsTarget: false, localDate: "2026-10-29", items: [], createdAt: Date.now() }));
  const discarded = await user.mutation(api.workouts.blankDraft, { submissionId: "discarded-1" });
  await user.mutation(api.workouts.discardDraft, { draftId: discarded });
  await other.mutation(api.workouts.blankDraft, { submissionId: "other-1" });
  const second = await user.mutation(api.workouts.blankDraft, { submissionId: "pending-2" });
  expect(await user.query(api.workouts.pendingDrafts, {})).toEqual([
    { _id: second, localDate: "2026-10-29", source: "manual", itemCount: 0 },
    { _id: first, localDate: "2026-10-29", source: "manual", itemCount: 0 },
  ]);
});

test("setting off refuses parsing before calling the model", async () => {
  const { user } = await setup(); await user.mutation(api.progress_v2.setPlainWorkouts, { on: false });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(user.action(api.workouts.parse, { submissionId: "off", text: "bench 10 kg 8 reps" })).rejects.toMatchObject({ data: { code: "FEATURE_OFF" } });
  expect(fetch).not.toHaveBeenCalled();
});

test("commit rejects a plate version changed after it loaded", async () => {
  const { user } = await setup();
  const draftId = await user.mutation(api.workouts.blankDraft, { submissionId: "versioned" });
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: "2026-10-29", startTime: "10:00", durationMin: null, needsTarget: false, targetSessionId: null, items: [] });
  await expect(user.mutation(api.workouts.commitDraft, { draftId, submissionId: "versioned-save", expectedVersion: 0, edits: { localDate: "2026-10-29", startTime: "10:00", durationMin: null, needsTarget: false, targetSessionId: null, items: [] } })).rejects.toMatchObject({ data: { code: "STALE_REVISION", message: "This review changed in chat. Reload it." } });
});

test("batch additions to the same exercise get consecutive set indexes", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "same-ex", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const draftId = await user.mutation(api.workouts.blankDraft, { submissionId: "same-index" });
  const items = [1, 2].map((n) => ({ key: `item-${n}`, name: "Bench press", kind: "strength" as const, exerciseId, candidateIds: [exerciseId], sets: [{ weightKg: 50, reps: 8 }], problems: [] }));
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: "2026-10-29", startTime: "10:00", durationMin: null, needsTarget: false, targetSessionId: null, items });
  const saved = await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "same-index-save" });
  const sets = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", saved.sessionId).eq("status", "live")).take(10));
  expect(sets.map((set) => set.setIndex).sort()).toEqual([1, 2]);
});

test("workout draft appends stop at the shared 100 cardio row session limit", async () => {
  const { t, user } = await setup();
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "cardio-cap-session" });
  const exerciseId = await user.mutation(api.exercises.createPersonal, { name: "Walking", kind: "cardio" });
  await t.run(async (ctx) => {
    for (let index = 0; index < 100; index += 1) await ctx.db.insert("cardio", { userId: "user_a", sessionId, exerciseId, position: index, durationMin: 1, revision: 1, op: "add", status: "live", submissionId: `draft-cardio-${index}` });
  });
  const draftId = await user.mutation(api.workouts.blankDraft, { submissionId: "cardio-cap-draft", sessionId });
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: "2026-10-29", startTime: "10:00", durationMin: null, needsTarget: false, targetSessionId: sessionId, items: [{ key: "walk", name: "Walking", kind: "cardio", exerciseId, candidateIds: [exerciseId], sets: [], cardio: { durationMin: 1 }, problems: [] }] });
  await expect(user.mutation(api.workouts.commitDraft, { draftId, submissionId: "cardio-cap-save" })).rejects.toMatchObject({ data: { code: "LIMIT_REACHED" } });
});

test("AI failure leaves no workout draft or session", async () => {
  const { t, user } = await setup();
  await expect(user.action(api.workouts.parse, { submissionId: "provider-failure", text: "bench 60 kg 8 reps" })).rejects.toMatchObject({ data: { code: "AI_UNAVAILABLE" } });
  expect(await t.run((ctx) => ctx.db.query("workout_drafts").take(10))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("workout_sessions").take(10))).toEqual([]);
});

test("a correction to a saved workout revises its set and batch undo restores the earlier value", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "old-session", startedAt: Date.UTC(2026, 9, 28, 5, 30) });
  const setId = await user.mutation(api.strength.addSet, { submissionId: "old-set", sessionId, exerciseId, weightKg: 60, reps: 8 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 45) });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [70], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "fix-session", text: "Bench press was 70 kg for 8", sessionId });
  expect((await user.query(api.workouts.draft, { draftId })).draft.mode).toBe("revise");
  const saved = await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "revise-session" });
  const live = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10));
  expect(live).toHaveLength(1);
  expect(live[0]).toMatchObject({ weightKg: 70, reps: 8, supersedes: setId });
  await user.mutation(api.workouts.undoDraft, { draftId, submissionId: "undo-revise" });
  expect(await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10))).toMatchObject([{ weightKg: 60, reps: 8 }]);
  expect(saved.sessionId).toBe(sessionId);
});

test("a revise draft keeps the saved workout time when the model gives no date or time", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "bench-time", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "timed-session", startedAt: Date.UTC(2026, 9, 28, 2, 0) });
  await user.mutation(api.strength.addSet, { submissionId: "timed-set", sessionId, exerciseId, weightKg: 60, reps: 8 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 45) });
  const before = await t.run((ctx) => ctx.db.get("workout_sessions", sessionId));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [70], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "time-correction", text: "Bench press was 70 kg", sessionId });
  const draft = (await user.query(api.workouts.draft, { draftId })).draft;
  expect(draft).toMatchObject({ localDate: before!.localDate, startTime: "07:30" });
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "time-correction-save" });
  const after = await t.run((ctx) => ctx.db.get("workout_sessions", sessionId));
  expect(after).toMatchObject({ localDate: before!.localDate, startedAt: before!.startedAt, endedAt: before!.endedAt });
  expect(after).not.toHaveProperty("durationMin");
  expect(after).not.toHaveProperty("timing");
});

test("batch undo refuses to restore session times changed by a later write", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "undo-time", name: "Bench", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "undo-time-session", startedAt: Date.UTC(2026, 9, 29, 5) });
  await user.mutation(api.strength.addSet, { submissionId: "undo-time-set", sessionId, exerciseId, weightKg: 40, reps: 8 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 29, 5, 30) });
  const draftId = await user.mutation(api.workouts.blankDraft, { submissionId: "undo-time-draft", sessionId });
  await t.run((ctx) => ctx.db.patch("workout_drafts", draftId, { mode: "revise" }));
  const item = { key: "bench", name: "Bench", kind: "strength" as const, exerciseId, candidateIds: [exerciseId], sets: [{ weightKg: 41, reps: 8, setId: (await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).first()))!._id }], problems: [] };
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: "2026-10-29", startTime: "11:00", durationMin: null, needsTarget: false, targetSessionId: sessionId, items: [item] });
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "undo-time-save" });
  await t.run((ctx) => ctx.db.patch("workout_sessions", sessionId, { startedAt: Date.UTC(2026, 9, 29, 6) }));
  await expect(user.mutation(api.workouts.undoDraft, { draftId, submissionId: "undo-time-undo" })).rejects.toMatchObject({ data: { code: "STALE_REVISION", message: "The workout time changed after it was saved." } });
});

test("moving a finished workout start keeps its elapsed time", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "shift-time", name: "Bench", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "shift-session", startedAt: Date.UTC(2026, 9, 28, 5) });
  const setId = await user.mutation(api.strength.addSet, { submissionId: "shift-set", sessionId, exerciseId, weightKg: 40, reps: 8 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 30) });
  const draftId = await user.mutation(api.workouts.blankDraft, { submissionId: "shift-draft", sessionId });
  await t.run((ctx) => ctx.db.patch("workout_drafts", draftId, { mode: "revise" }));
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: "2026-10-28", startTime: "12:00", durationMin: null, needsTarget: false, targetSessionId: sessionId, items: [{ key: "bench", name: "Bench", kind: "strength", exerciseId, candidateIds: [exerciseId], sets: [{ setId, weightKg: 40, reps: 8 }], problems: [] }] });
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "shift-save" });
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", sessionId))).toMatchObject({ startedAt: Date.UTC(2026, 9, 28, 6, 30), endedAt: Date.UTC(2026, 9, 28, 7) });
});

test("a pending-draft correction keeps the other items and their set ids", async () => {
  const { user } = await setup();
  const initialItems = ["Bench press", "Squat"].map((name) => ({ name, kind: "strength", weights: [40], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: null }));
  const prompts: string[] = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    prompts.push(body.messages.find((message) => message.role === "system")?.content ?? "");
    const userText = body.messages.find((message) => message.role === "user")?.content;
    const items = userText === "initial" ? initialItems : [
      { ...initialItems[0]!, weights: [39], from: 0 },
      { ...initialItems[1]!, from: 1 },
    ];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items, durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  const first = await user.action(api.workouts.parse, { submissionId: "draft-first", text: "initial" });
  const before = (await user.query(api.workouts.draft, { draftId: first.draftId })).draft;
  const corrected = await user.action(api.workouts.parse, { submissionId: "draft-fix", text: "the bench was 39", draftId: first.draftId });
  const after = (await user.query(api.workouts.draft, { draftId: corrected.draftId })).draft;
  expect(after.items).toHaveLength(2);
  expect(after.items.map((item) => item.sets[0]?.setId)).toEqual(before.items.map((item) => item.sets[0]?.setId));
  expect(after.items[0]?.sets[0]?.weightKg).toBe(39);
  expect(prompts[1]).toContain('"from":0,"name":"Bench press"');
});

test("repeated append corrections keep earlier removed set ids for commit", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "append-correction", name: "Bench", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "append-session" });
  for (const [index, weightKg] of [30, 40, 50].entries()) await user.mutation(api.strength.addSet, { submissionId: `append-set-${index}`, sessionId, exerciseId, weightKg, reps: 8 });
  const originalSets = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10));
  const target = await user.mutation(api.workouts.blankDraft, { submissionId: "append-draft", sessionId });
  await user.mutation(api.workouts.updateDraft, { draftId: target, localDate: "2026-10-29", startTime: "10:00", durationMin: null, needsTarget: false, targetSessionId: sessionId, items: [{ key: "bench", name: "Bench", kind: "strength", exerciseId, candidateIds: [exerciseId], sets: originalSets.map((set) => ({ setId: set._id, weightKg: set.weightKg, reps: set.reps })), problems: [] }] });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench", kind: "strength", weights: [35], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "append" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } })));
  const first = await user.action(api.workouts.parse, { submissionId: "append-fix-1", text: "bench is one set", draftId: target });
  const second = await user.action(api.workouts.parse, { submissionId: "append-fix-2", text: "bench is still one set", draftId: first.draftId });
  await user.mutation(api.workouts.commitDraft, { draftId: second.draftId, submissionId: "append-save" });
  expect(await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10))).toMatchObject([{ weightKg: 35, reps: 8 }]);
});

test("Coach corrections create a retry-discoverable draft and supersede the old card", async () => {
  const { t, user } = await setup();
  const chatId = await t.run((ctx) => ctx.db.insert("chats", { userId: "user_a", title: "Workout", updatedAt: Date.now() }));
  const messageId = await t.run((ctx) => ctx.db.insert("messages", { userId: "user_a", chatId, role: "assistant", text: "Review below", status: "done", submissionId: "message", attachments: [], toolCalls: [], draftIds: [], entryIds: [], workoutDraftIds: [] }));
  const oldDraftId = await t.run((ctx) => ctx.db.insert("workout_drafts", { userId: "user_a", chatId, submissionId: "old-workout", status: "pending", source: "coach", inputText: "bench", mode: "new", needsTarget: false, localDate: "2026-10-29", startTime: "10:00", version: 1, items: [], createdAt: Date.now() }));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench", kind: "strength", weights: [40], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: null }], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } })));
  const newDraftId = await t.action(internal.pipeline.workout_parse.parseCoach, { userId: "user_a", submissionId: "retry-turn:offer_workout:0", text: "bench 40 kg 8 reps", chatId, messageId, draftId: oldDraftId });
  const oldDraft = await user.query(api.workouts.draft, { draftId: oldDraftId });
  expect(oldDraft.draft).toMatchObject({ status: "discarded", supersededBy: newDraftId });
  const saved = await t.query(internal.chats.priorTurnWrites, { userId: "user_a", submissionId: "retry-turn" });
  expect(saved.workoutDraftIds).toContain(newDraftId);
});

test("a correction to an open session edits the numbered item instead of appending a duplicate", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "open-bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "open-correction-session" });
  const oldSet = await user.mutation(api.strength.addSet, { submissionId: "open-correction-set", sessionId, exerciseId, weightKg: 39, reps: 8 });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [40], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "append" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "open-correction", text: "the bench was 40", sessionId });
  const draft = (await user.query(api.workouts.draft, { draftId })).draft;
  expect(draft.mode).toBe("append");
  expect(draft.items[0]?.sets[0]?.setId).toBe(oldSet);
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "open-correction-save" });
  const live = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10));
  expect(live).toHaveLength(1);
  expect(live[0]).toMatchObject({ weightKg: 40, supersedes: oldSet });
});

test("fixing draft set values recomputes and clears server review problems", async () => {
  const { user } = await setup();
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [40, 50], reps: [8, 6, 4], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: null }], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "problem-draft", text: "bench" });
  const draft = (await user.query(api.workouts.draft, { draftId })).draft;
  expect(draft.items[0]?.problems).toHaveLength(1);
  const items = draft.items.map((item) => ({ ...item, sets: [{ weightKg: 40, reps: 8 }, { weightKg: 50, reps: 6 }], problems: item.problems }));
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: draft.localDate, startTime: draft.startTime!, durationMin: null, needsTarget: false, targetSessionId: null, items });
  expect((await user.query(api.workouts.draft, { draftId })).draft.items[0]?.problems).toEqual([]);
});

test("an unclear target blocks save until the user chooses the open session", async () => {
  const { user } = await setup();
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "open-session" });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Squat", kind: "strength", weights: [40], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: null }], durationMin: null, date: null, startTime: null, targetIntent: "unclear" }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "ambiguous", text: "Squats 40 kg for 8" });
  const plate = (await user.query(api.workouts.draft, { draftId })).draft;
  expect(plate.needsTarget).toBe(true);
  await expect(user.mutation(api.workouts.commitDraft, { draftId, submissionId: "blocked" })).rejects.toMatchObject({ data: { code: "WORKOUT_NEEDS_REVIEW" } });
  await user.mutation(api.workouts.updateDraft, { draftId, localDate: plate.localDate, startTime: plate.startTime!, durationMin: null, needsTarget: false, targetSessionId: sessionId, items: plate.items });
  expect((await user.query(api.workouts.draft, { draftId })).draft.mode).toBe("append");
  const saved = await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "append-save" });
  expect(saved.sessionId).toBe(sessionId);
});

test("copying a saved workout makes a new draft with names only or all measurements", async () => {
  const { user } = await setup();
  const strengthId = await user.mutation(api.exercises.createPersonal, { name: "My lift", kind: "strength" });
  const cardioId = await user.mutation(api.exercises.createPersonal, { name: "Walking", kind: "cardio" });
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "copy-source", startedAt: Date.UTC(2026, 9, 28, 5, 30) });
  await user.mutation(api.strength.addSet, { submissionId: "copy-set", sessionId, exerciseId: strengthId, weightKg: 10, reps: 8, weightBasis: "each" });
  await user.mutation(api.strength.addCardio, { submissionId: "copy-cardio", sessionId, exerciseId: cardioId, durationMin: 12, reportedKcal: 45 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 45) });
  const everythingId = await user.mutation(api.workouts.draftFromSession, { submissionId: "copy-all", sessionId, copy: "everything" });
  const everything = (await user.query(api.workouts.draft, { draftId: everythingId })).draft;
  expect(everything).toMatchObject({ source: "copy", mode: "new", localDate: "2026-10-29" });
  expect(everything.items.find((item) => item.kind === "strength")?.sets).toMatchObject([{ weightKg: 10, reps: 8, weightBasis: "each" }]);
  expect(everything.items.find((item) => item.kind === "cardio")?.cardio).toMatchObject({ durationMin: 12, reportedKcal: 45 });
  const namesId = await user.mutation(api.workouts.draftFromSession, { submissionId: "copy-names", sessionId, copy: "names" });
  const names = (await user.query(api.workouts.draft, { draftId: namesId })).draft;
  expect(names.items.find((item) => item.kind === "strength")?.sets).toEqual([]);
  expect(names.items.find((item) => item.kind === "strength")?.problems).toHaveLength(1);
});

test("revision context keeps every cardio row as a separately numbered item", async () => {
  const { t, user } = await setup();
  const cardioId = await user.mutation(api.exercises.createPersonal, { name: "Walking", kind: "cardio" });
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "cardio-session", startedAt: Date.UTC(2026, 9, 28, 5, 30) });
  const first = await user.mutation(api.strength.addCardio, { submissionId: "walk-1", sessionId, exerciseId: cardioId, durationMin: 10 });
  const second = await user.mutation(api.strength.addCardio, { submissionId: "walk-2", sessionId, exerciseId: cardioId, durationMin: 20 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 55) });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    const context = body.messages.find((message) => message.role === "system")?.content ?? "";
    expect(context).toContain('"from":0');
    expect(context).toContain('"from":1');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [
      { name: "Walking", kind: "cardio", weights: [], reps: [], unit: "kg", basis: null, bodyweight: false, durationMin: 11, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 },
      { name: "Walking", kind: "cardio", weights: [], reps: [], unit: "kg", basis: null, bodyweight: false, durationMin: 21, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 1 },
    ], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } });
  }));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "revise-cardio", text: "correct both walks", sessionId });
  const items = (await user.query(api.workouts.draft, { draftId })).draft.items;
  expect(items.map((item) => item.cardio?.cardioId)).toEqual([first, second]);
});

test("revise commit rejects changed live heads before writing", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "stale-bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "stale-session", startedAt: Date.UTC(2026, 9, 28, 5, 30) });
  await user.mutation(api.strength.addSet, { submissionId: "stale-set", sessionId, exerciseId, weightKg: 60, reps: 8 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 45) });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [70], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "stale-review", text: "change bench", sessionId });
  const liveBefore = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).first());
  await user.mutation(api.strength.editSet, { submissionId: "later-set", setId: liveBefore!._id, reps: 9 });
  await expect(user.mutation(api.workouts.commitDraft, { draftId, submissionId: "stale-save" })).rejects.toMatchObject({ data: { code: "STALE_REVISION", message: "This workout changed since the review was made. Open it again." } });
  expect((await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10))).map((set) => set.reps)).toEqual([9]);
});

test("revision mapping uses the heads read before the model call", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "snapshot-bench", name: "Bench", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "snapshot-session", startedAt: Date.UTC(2026, 9, 28, 5) });
  const oldSetId = await user.mutation(api.strength.addSet, { submissionId: "snapshot-set", sessionId, exerciseId, weightKg: 40, reps: 8 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 30) });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => {
    await t.run(async (ctx) => {
      const old = await ctx.db.get("sets", oldSetId);
      await ctx.db.patch("sets", oldSetId, { status: "superseded" });
      await ctx.db.insert("sets", { userId: "user_a", sessionId, exerciseId, setIndex: 1, weightKg: 45, reps: 8, revision: 2, supersedes: oldSetId, op: "edit", status: "live", submissionId: "snapshot-later-edit" });
      return old;
    });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench", kind: "strength", weights: [50], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } });
  }));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "snapshot-correction", text: "Bench was 50 kg", sessionId });
  expect((await user.query(api.workouts.draft, { draftId })).draft.items[0]?.sets[0]?.setId).toBe(oldSetId);
  await expect(user.mutation(api.workouts.commitDraft, { draftId, submissionId: "snapshot-save" })).rejects.toMatchObject({ data: { code: "STALE_REVISION" } });
});

test("undo leaves a created session live when a later batch added records", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "undo-bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const draftId = await t.run((ctx) => ctx.db.insert("workout_drafts", { userId: "user_a", submissionId: "create-for-undo", status: "pending", source: "manual", inputText: "", mode: "new", needsTarget: false, localDate: "2026-10-29", startTime: "11:00", items: [{ key: "one", name: "Bench press", kind: "strength", exerciseId, candidateIds: [exerciseId], sets: [{ weightKg: 60, reps: 8 }], problems: [] }], createdAt: Date.now() }));
  const saved = await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "created-save" });
  await t.run(async (ctx) => {
    const current = await ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", saved.sessionId).eq("status", "live")).first();
    await ctx.db.insert("sets", { userId: "user_a", sessionId: saved.sessionId, exerciseId, setIndex: 2, weightKg: 65, reps: 8, revision: 1, op: "add", status: "live", submissionId: "later-work" });
    return current;
  });
  await user.mutation(api.workouts.undoDraft, { draftId, submissionId: "created-undo" });
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", saved.sessionId))).not.toHaveProperty("deletedAt");
  expect((await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", saved.sessionId).eq("status", "live")).take(10))).map((set) => set.weightKg)).toEqual([65]);
});

test("append correction deletes old sets that the corrected item no longer has", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "shorten-bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "shorten-session" });
  const old = await Promise.all([60, 65].map((weightKg, i) => user.mutation(api.strength.addSet, { submissionId: `shorten-old-${i}`, sessionId, exerciseId, weightKg, reps: 8 })));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [62], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: null, date: null, startTime: null, targetIntent: "append" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "shorten-review", text: "bench was one set", sessionId });
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "shorten-save" });
  const live = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10));
  expect(live).toHaveLength(1);
  expect(live[0]).toMatchObject({ weightKg: 62, supersedes: old[0] });
  const deleted = await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "deleted")).take(10));
  expect(deleted.map((set) => set.supersedes)).toContain(old[1]);
});

test("batch undo restores absent session fields and RPE", async () => {
  const { t, user } = await setup();
  const exerciseId = await t.run((ctx) => ctx.db.insert("exercises", { sourceId: "restore-bench", name: "Bench press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: [] }));
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "restore-session", startedAt: Date.UTC(2026, 9, 28, 5, 30) });
  const original = await user.mutation(api.strength.addSet, { submissionId: "restore-set", sessionId, exerciseId, weightKg: 60, reps: 8, rpe: 7 });
  await user.mutation(api.strength.endSession, { sessionId, endedAt: Date.UTC(2026, 9, 28, 5, 45) });
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ name: "Bench press", kind: "strength", weights: [70], reps: [8], unit: "kg", basis: null, bodyweight: false, durationMin: null, distanceKm: null, reportedKcal: null, speedKmh: null, inclinePct: null, from: 0 }], durationMin: 20, date: null, startTime: null, targetIntent: "new" }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { "content-type": "application/json" } })));
  const { draftId } = await user.action(api.workouts.parse, { submissionId: "restore-review", text: "correct workout", sessionId });
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "restore-save" });
  expect((await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).first()))?.rpe).toBe(7);
  await user.mutation(api.workouts.undoDraft, { draftId, submissionId: "restore-undo" });
  const session = await t.run((ctx) => ctx.db.get("workout_sessions", sessionId));
  expect(session).not.toHaveProperty("durationMin");
  expect(session).not.toHaveProperty("timing");
  expect(await t.run((ctx) => ctx.db.get("sets", original))).toMatchObject({ rpe: 7 });
  expect((await t.run((ctx) => ctx.db.query("sets").withIndex("by_sessionId_and_status", (q) => q.eq("sessionId", sessionId).eq("status", "live")).take(10)))[0]).toMatchObject({ weightKg: 60, rpe: 7 });
});

test("blank append draft uses the target session local date and start time", async () => {
  const { t, user } = await setup();
  const sessionId = await user.mutation(api.strength.startSession, { submissionId: "old-open", startedAt: Date.UTC(2026, 9, 27, 19, 5) });
  const draftId = await user.mutation(api.workouts.blankDraft, { submissionId: "blank-append", sessionId });
  expect((await user.query(api.workouts.draft, { draftId })).draft).toMatchObject({ mode: "append", localDate: "2026-10-28", startTime: "00:35" });
  const before = await t.run((ctx) => ctx.db.get("workout_sessions", sessionId));
  await user.mutation(api.workouts.commitDraft, { draftId, submissionId: "blank-append-save" });
  expect(await t.run((ctx) => ctx.db.get("workout_sessions", sessionId))).toEqual(before);
});

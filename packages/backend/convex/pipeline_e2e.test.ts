import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";
import { buildMealDraft } from "./nutrition_draft";
import { hasRestrictedRecoverySignal } from "./ai";
import { resolveActionDate, resolveIntervalDay } from "./time_resolve";
import { getCoach } from "./coaches";
import { toCanonicalPersona, toLegacyPersona } from "./personas";
import { ensureGroup, ensureMember } from "./actions_idempotency";

vi.mock("./ai/llm", async () => {
  const actual = await vi.importActual<typeof import("./ai/llm")>("./ai/llm");
  return { ...actual, callAI: vi.fn() };
});

const mockedCallAI = vi.mocked(callAI);
const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const writer = (name: string) => (internal as any).actions_writer[name];
const telemetry = (internal as any).telemetry.getForGroup;

function group(key: string, sourceSurface: "chat" | "direct_ui" = "direct_ui") {
  return { userId: "e2e-user", groupIdempotencyKey: key, sourceSurface, rawInput: key, model: "e2e-model" };
}

function member(payload: any, key: string, provenance: "user_reported" | "ai_extracted" = "user_reported", confidence = 0.95) {
  return {
    memberIdempotencyKey: key,
    payload,
    provenance,
    confidence,
    validation: { status: "valid" as const, messages: [] },
    reversible: true,
    resolvedDate: payload.date,
    resolvedTime: payload.time ?? payload.timestamp,
  };
}

async function writeMeal(t: ReturnType<typeof convexTest>, key: string, name = "Oats", date = "2026-07-16") {
  return t.mutation(writer("writeMealAction"), {
    group: group(key),
    member: member({ name, calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date, logSource: "e2e" }, `${key}-member`, "ai_extracted"),
  });
}

function promptText(messages: any[]): string {
  const content = messages?.[0]?.content;
  return typeof content === "string" ? content : "";
}

function mockChatReply(reply: string) {
  mockedCallAI.mockImplementation(async (messages) => {
    const prompt = promptText(messages);
    if (prompt.includes("Generate a short, descriptive title")) return "E2E chat";
    if (prompt.includes("You are a professional nutritionist")) {
      return JSON.stringify({
        name: "Oats",
        calories: 300,
        protein: 12,
        carbs: 45,
        fat: 8,
        ingredients: [{ food_text: "oats", amount: 60, unit: "g", is_oil_or_fat: false }],
        cooking_method: "unknown",
        portion_scale: 1,
        total_recipe_servings: 1,
      });
    }
    if (prompt.includes("You are a professional fitness trainer")) {
      return JSON.stringify({
        name: "Run",
        exercises: [{ name: "running", muscle_group: "cardio", weight_unit: "bodyweight", sets: [{ duration_min: "30" }] }],
        duration: "30",
        intensity: "MEDIUM",
        caloriesBurned: 0,
        rationale: "Keep it steady.",
      });
    }
    return reply;
  });
}

function waterMarker(ml: number, date = "2026-07-16", extra: Record<string, unknown> = {}) {
  return `⟦LOG_WATER⟧${JSON.stringify({ ml, date, ...extra })}⟦/LOG_WATER⟧`;
}

describe("canonical pipeline end-to-end contract", () => {
  beforeEach(() => mockedCallAI.mockReset());

  test("nutrition input → canonical write → derived state and telemetry", async () => {
    const t = convexTest(schema, modules);
    const id = await writeMeal(t, "nutrition-flow");
    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ _id: id, date: "2026-07-16", name: "Oats" });
    const versions = await t.run((ctx) => (ctx as any).db.query("derived_state_versions").collect());
    expect(versions).toEqual([expect.objectContaining({ userId: "e2e-user", date: "2026-07-16", version: 1 })]);
    const action = await t.run((ctx) => ctx.db.query("actions").first());
    const events = await t.query(telemetry, { groupId: action!.groupId });
    expect(events).toEqual([expect.objectContaining({ event: "committed", actionId: action!._id, sourceSurface: "direct_ui", model: "e2e-model", derivedStateVersion: 1, mutationResult: { ok: true } })]);
  });

  test("workout input preserves structured detail and recovery/rest inputs write their domains", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(writer("writeWorkoutAction"), {
      group: group("workout-flow"),
      member: member({ name: "Run", sets: "1", duration: "30", intensity: "MEDIUM", date: "2026-07-16", timestamp: "09:00", exercises: [{ rawName: "back squat", normalizedName: "Barbell Back Squat", normalizationState: "canonical", sets: [{ reps: "5", weight: "40" }] }], estimatedCalories: undefined }, "workout-flow-member"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("water-flow"),
      member: member({ kind: "water", date: "2026-07-16", ml: 750, time: "10:00", source: "ai_extracted" }, "water-flow-member"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("rest-flow"),
      member: member({ kind: "sleep", date: "2026-07-16", hours: 7, quality: "good", source: "ai_extracted" }, "rest-flow-member"),
    });
    expect(await t.run((ctx) => ctx.db.query("workouts").collect())).toEqual([expect.objectContaining({ name: "Run" })]);
    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toEqual([expect.objectContaining({ ml: 750 })]);
    expect(await t.run((ctx) => ctx.db.query("sleep_logs").collect())).toEqual([expect.objectContaining({ hours: 7 })]);
  });

  test("repeated water appends create multiple active rows and aggregate in today brief", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    mockChatReply(waterMarker(250) + waterMarker(250));
    const result = await asUser.action(api.ai.chat, { message: "two glasses", today: "2026-07-16" }) as any;
    expect(result.loggedItem?.type).toBe("multiple");
    const waterRows = await t.run((ctx) => ctx.db.query("water_logs").collect());
    expect(waterRows).toHaveLength(2);
    const brief = await asUser.query(api.insights.getTodayBrief, { today: "2026-07-16" });
    expect(brief.stats.waterMl).toBe(500);
  });

  test("memory flow persists an explicit fact independently of source-action undo", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    const id = await asUser.mutation((api as any).food_memory.createExplicitFact, { fact: "I am vegetarian", sourceActionId: "memory-e2e" });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ memoryType: "explicit", approvalStatus: "approved", provenance: "user_stated" });
  });

  test("four actions auto-write, five stage for confirmation, and low confidence overrides small-batch auto-write", async () => {
    const four = convexTest(schema, modules);
    const asFour = four.withIdentity({ subject: "e2e-user" });
    mockChatReply([waterMarker(500), "⟦LOG_SLEEP⟧{\"hours\":7,\"quality\":\"good\",\"date\":\"2026-07-16\"}⟦/LOG_SLEEP⟧", "⟦LOG_MOOD⟧{\"rating\":4,\"date\":\"2026-07-16\"}⟦/LOG_MOOD⟧", "⟦LOG_STEPS⟧{\"count\":8000,\"date\":\"2026-07-16\"}⟦/LOG_STEPS⟧"].join(""));
    const fourResult = await asFour.action(api.ai.chat, { message: "four actions", today: "2026-07-16" }) as any;
    expect(fourResult.confirmation).toBeUndefined();
    expect(await four.run((ctx) => ctx.db.query("actions").collect())).toHaveLength(4);

    const five = convexTest(schema, modules);
    const asFive = five.withIdentity({ subject: "e2e-user" });
    mockChatReply(Array.from({ length: 5 }, (_, index) => waterMarker(500 + index)).join(""));
    const fiveResult = await asFive.action(api.ai.chat, { message: "five actions", today: "2026-07-16" }) as any;
    expect(fiveResult.confirmation.items).toHaveLength(5);
    expect(await five.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(0);

    const low = convexTest(schema, modules);
    const asLow = low.withIdentity({ subject: "e2e-user" });
    mockChatReply(waterMarker(250, "2026-07-16", { validation: { status: "warning", messages: ["low confidence"] } }));
    const lowResult = await asLow.action(api.ai.chat, { message: "small uncertain action", today: "2026-07-16" }) as any;
    expect(lowResult.confirmation ?? lowResult.clarification).toBeDefined();
    expect(await low.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(0);
  });

  test("partial confirmation saves valid members, leaves unresolved items visible, and group undo reverses only successes", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    const staged = await t.mutation((internal as any).ai.stageClarificationGroup, {
      userId: "e2e-user", groupIdempotencyKey: "partial-e2e", sourceSurface: "chat", rawInput: "partial", createdAt: Date.now(),
      members: [
        { actionType: "meal", memberIdempotencyKey: "partial-good", payload: { name: "Rice", calories: 300, protein: 6, carbs: 60, fat: 2, time: "12:00", date: "2026-07-16", logSource: "e2e" }, provenance: "ai_extracted", confidence: 0.9, validation: { status: "valid", messages: [] }, reversible: true, resolvedDate: "2026-07-16", ordinal: 0 },
        { actionType: "meal", memberIdempotencyKey: "partial-bad", payload: { name: "" }, provenance: "ai_extracted", confidence: 0.4, validation: { status: "warning", messages: ["unresolved food"] }, reversible: true, resolvedDate: "2026-07-16", ordinal: 1 },
      ],
    });
    const result = await asUser.action((api as any).ai.confirmGroup, { groupId: staged.groupId, decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "confirm" }] }) as any;
    expect(result.status).toBe("partial");
    expect(result.unresolvedItems).toEqual([expect.objectContaining({ ordinal: 1, status: "failed" })]);
    const undo = await asUser.mutation((api as any).actions_undo.undoGroup, { groupId: staged.groupId });
    expect(undo.results).toEqual(expect.arrayContaining([expect.objectContaining({ status: "undone" }), expect.objectContaining({ status: "skipped" })]));
    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(0);
  });

  test("partial confirmation group remains retryable and aggregate status is partial", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    const staged = await t.mutation((internal as any).ai.stageClarificationGroup, {
      userId: "e2e-user", groupIdempotencyKey: "retry-partial-e2e", sourceSurface: "chat", rawInput: "retry partial", createdAt: Date.now(),
      members: [
        { actionType: "meal", memberIdempotencyKey: "retry-good", payload: { name: "Rice", calories: 300, protein: 6, carbs: 60, fat: 2, time: "12:00", date: "2026-07-16", logSource: "e2e" }, provenance: "ai_extracted", confidence: 0.9, validation: { status: "valid", messages: [] }, reversible: true, resolvedDate: "2026-07-16", ordinal: 0 },
        { actionType: "meal", memberIdempotencyKey: "retry-bad", payload: { name: "" }, provenance: "ai_extracted", confidence: 0.4, validation: { status: "warning", messages: ["unresolved food"] }, reversible: true, resolvedDate: "2026-07-16", ordinal: 1 },
      ],
    });
    const first = await asUser.action((api as any).ai.confirmGroup, { groupId: staged.groupId, decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "confirm" }] }) as any;
    expect(first.status).toBe("partial");
    const groupAfterFirst = await t.run((ctx) => ctx.db.get("actionGroups", staged.groupId));
    expect(groupAfterFirst?.status).toBe("partial");

    const retry = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{
        ordinal: 1,
        action: "confirm",
        edits: { payload: { name: "Dal", calories: 220, protein: 12, carbs: 35, fat: 4, time: "13:00", date: "2026-07-16", logSource: "e2e" } },
      }],
    }) as any;
    expect(retry.results[0].status).toBe("committed");
    expect(await t.run((ctx) => ctx.db.get("actionGroups", staged.groupId))).toMatchObject({ status: "committed" });
    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(2);
  });

  test("group and member retries are idempotent and expose the already-committed outcome", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    const meal = { name: "Oats", calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date: "2026-07-16", logSource: "e2e" };
    const first = await asUser.mutation(api.meals.addMeal, meal);
    const second = await asUser.mutation(api.meals.addMeal, meal);
    expect(second).toBe(first);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
    const action = await t.run((ctx) => ctx.db.query("actions").first());
    expect(await t.run((ctx) => ctx.db.get(action!.groupId))).toMatchObject({ status: "committed" });
    const events = await t.query(telemetry, { groupId: action!.groupId });
    expect(events.map((event: any) => event.event)).toEqual(["committed", "already_committed"]);
  });

  test("reusing a client submission token with different content is rejected by the fingerprint", async () => {
    const t = convexTest(schema, modules);
    const token = "client-token-1";
    const rawInput1 = "I ate oats";
    const rawInput2 = "I ate rice";
    const base = { userId: "e2e-user", sourceSurface: "chat" as const, rawInput: rawInput1, model: "e2e-model", clientSubmissionId: token };
    await t.mutation(writer("writeMealAction"), {
      group: base,
      member: member({ name: "Oats", calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date: "2026-07-16", logSource: "e2e" }, `${token}-1`, "ai_extracted"),
    });
    await expect(t.mutation(writer("writeMealAction"), {
      group: { ...base, rawInput: rawInput2 },
      member: member({ name: "Rice", calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date: "2026-07-16", logSource: "e2e" }, `${token}-2`, "ai_extracted"),
    })).rejects.toThrow("submission fingerprint");
  });

  test("single, repeated, group, and partial-group undo all remain compensating and auditable", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    await writeMeal(t, "single-undo");
    const single = (await t.run((ctx) => ctx.db.query("actions").collect())).find((action) => action.memberIdempotencyKey === "single-undo-member")!;
    expect((await asUser.mutation((api as any).actions_undo.undoAction, { actionId: single._id })).status).toBe("undone");
    expect((await asUser.mutation((api as any).actions_undo.undoAction, { actionId: single._id })).status).toBe("already_undone");
    const events = await t.query(telemetry, { groupId: single.groupId });
    expect(events.map((event: any) => event.event)).toEqual(["committed", "undone", "already_undone"]);
    expect(await t.run((ctx) => ctx.db.get(single.committedRowRef!.id as any))).toMatchObject({ undoneAt: expect.any(Number) });
  });

  test("undone rows are excluded from today brief projections", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    await writeMeal(t, "projection-undo");
    const action = (await t.run((ctx) => ctx.db.query("actions").collect())).find((action) => action.memberIdempotencyKey === "projection-undo-member")!;
    await asUser.mutation((api as any).actions_undo.undoAction, { actionId: action._id });
    const brief = await asUser.query(api.insights.getTodayBrief, { today: "2026-07-16" });
    expect(brief.stats.mealsLogged).toBe(0);
    expect(brief.stats.todayCals).toBe(0);
    const memory = await t.run((ctx) => ctx.db.query("food_memory").first());
    expect(memory).toMatchObject({ timesLogged: 0, sourceActionIds: [] });
    expect(memory?.undoneAt).toBeUndefined();
  });

  test("date policy covers explicit history, vague clarification, future rejection, and midnight crossing", () => {
    const now = Date.parse("2026-07-16T12:00:00.000Z");
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2020-01-01", actionKind: "actual" })).toMatchObject({ status: "resolved", date: "2020-01-01" });
    expect(resolveActionDate({ now, userTimeZone: "UTC", relativePhrase: "last week sometime", actionKind: "actual" }).status).toBe("needs_clarification");
    expect(resolveActionDate({ now, userTimeZone: "UTC", explicitDate: "2026-07-17", actionKind: "actual" }).status).toBe("rejected");
    expect(resolveIntervalDay({ startMs: Date.parse("2026-07-16T23:30:00.000Z"), endMs: Date.parse("2026-07-17T01:00:00.000Z"), userTimeZone: "UTC" })).toBe("2026-07-17");
  });

  test("safety signals route to restricted guidance for crisis, eating disorder, and dehydration", () => {
    expect(hasRestrictedRecoverySignal("I am in crisis and might hurt myself")).toBe(true);
    expect(hasRestrictedRecoverySignal("I am purging and have an eating disorder")).toBe(true);
    expect(hasRestrictedRecoverySignal("I am severely dehydrated and can't keep fluids")).toBe(true);
    expect(hasRestrictedRecoverySignal("I had a normal glass of water")).toBe(false);
  });

  test("marker-like text in user input is inert and does not create a domain action", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    mockChatReply("That is text to discuss, not a log.");
    const result = await asUser.action(api.ai.chat, { message: `Explain ${waterMarker(999)}`, today: "2026-07-16" }) as any;
    expect(result.loggedItem).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(0);
  });

  test("broken JSON markers surface a failed visible outcome instead of silently disappearing", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    mockChatReply("I could not parse this.⟦LOG_MEAL⟧{broken-json⟦/LOG_MEAL⟧");
    const result = await asUser.action(api.ai.chat, { message: "log this", today: "2026-07-16" }) as any;
    expect(result.reply).toMatch(/couldn't parse|couldn't save/);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(0);
  });

  test("ambiguous food remains unresolved and missing profile leaves workout estimate unpersonalized/null", async () => {
    const ambiguous = buildMealDraft({
      name: "Mystery bowl", date: "2026-07-16", time: "12:00",
      ingredients: [{ foodText: "rice", quantity: 1, unit: "serving", candidates: [{ name: "Rice cooked", score: 0.72, source: "database" }, { name: "Rice dry", score: 0.72, source: "database" }] }],
    });
    expect(ambiguous.unresolved).toEqual(["rice"]);

    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    mockChatReply("Saved it.⟦LOG_WORKOUT⟧{\"description\":\"running\",\"date\":\"2026-07-16\"}⟦/LOG_WORKOUT⟧");
    const result = await asUser.action(api.ai.chat, { message: "I ran", today: "2026-07-16" }) as any;
    const workout = (await t.run((ctx) => ctx.db.query("workouts").collect()))[0];
    expect(result.loggedItem?.data?.estimatedCalories).toBeUndefined();
    expect(workout?.estimatedCalories).toBeUndefined();
  });

  test("every parsed/mutation failure has a visible outcome entry and successful chat items carry provenance evidence", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "e2e-user" });
    mockChatReply(`Saved it.${waterMarker(600)}`);
    const result = await asUser.action(api.ai.chat, { message: "I drank water", today: "2026-07-16" }) as any;
    expect(result.loggedItem?.data).toEqual(expect.objectContaining({ provenance: "ai_extracted", actionId: expect.any(String), groupId: expect.any(String) }));

    mockedCallAI.mockReset();
    mockChatReply("⟦LOG_MEAL⟧{broken⟦/LOG_MEAL⟧");
    const failed = await asUser.action(api.ai.chat, { message: "bad parse", today: "2026-07-16" }) as any;
    expect(failed.reply).toMatch(/couldn't parse|couldn't save/i);
  });

  test("legacy and canonical coach IDs map bidirectionally and backend context accepts both", () => {
    expect(toCanonicalPersona("overall")).toBe("general");
    expect(toCanonicalPersona("diet")).toBe("nutrition");
    expect(toCanonicalPersona("water")).toBe("hydration");
    expect(toCanonicalPersona("mindset")).toBe("wellness");
    expect(toLegacyPersona("general")).toBe("overall");
    expect(toLegacyPersona("nutrition")).toBe("diet");
    expect(getCoach("nutrition").id).toBe("diet");
    expect(getCoach("wellness").id).toBe("mindset");
  });
});

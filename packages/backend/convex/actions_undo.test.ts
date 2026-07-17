import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const undoApi = (api as any).actions_undo;
const writerApi = (internal as any).actions_writer;

function group(key: string) {
  return { userId: "undo-user", groupIdempotencyKey: key, sourceSurface: "chat" as const, rawInput: key };
}

function member(payload: any, key: string) {
  return {
    memberIdempotencyKey: key,
    payload,
    provenance: "ai_extracted" as const,
    validation: { status: "valid" as const, messages: [] },
    reversible: true,
    resolvedDate: payload.date,
    resolvedTime: payload.time ?? payload.timestamp,
  };
}

async function writeMeal(t: ReturnType<typeof convexTest>, key: string, name = key) {
  return t.mutation(writerApi.writeMealAction, {
    group: group(key),
    member: member({ name, calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date: "2026-07-16", logSource: "test" }, `${key}-member`),
  });
}

describe("audited action undo", () => {
  test("soft-reverses a meal, preserves the audit row, and marks the action undone", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    const mealId = await writeMeal(t, "undo-single");
    const action = (await t.run((ctx) => ctx.db.query("actions").collect()))[0];

    const result = await asUser.mutation(undoApi.undoAction, { actionId: action._id });
    const row = await t.run((ctx) => ctx.db.get(mealId));
    const storedAction = await t.run((ctx) => ctx.db.get(action._id));

    expect(result).toMatchObject({ actionId: action._id, groupId: action.groupId, status: "undone", rowId: mealId });
    expect(row).toMatchObject({ _id: mealId, name: "undo-single" });
    expect((row as any)?.undoneAt).toEqual(expect.any(Number));
    expect(storedAction).toMatchObject({ status: "undone", committedRowRef: { table: "meals", id: mealId } });
    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(0);
    const memory = await t.run((ctx) => ctx.db.query("food_memory").first());
    expect(memory).toMatchObject({ timesLogged: 0, sourceActionIds: [] });
    expect(memory?.undoneAt).toBeUndefined();
  });

  test("repeated undo is an idempotent no-op", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    await writeMeal(t, "undo-repeat");
    const action = (await t.run((ctx) => ctx.db.query("actions").collect()))[0];

    await asUser.mutation(undoApi.undoAction, { actionId: action._id });
    const repeated = await asUser.mutation(undoApi.undoAction, { actionId: action._id });

    expect(repeated).toMatchObject({ actionId: action._id, status: "already_undone" });
  });

  test("group undo reverses committed members and skips failed and undone members", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    const groupKey = "undo-group";
    await writeMeal(t, groupKey, "first");
    await t.mutation(writerApi.writeMealAction, {
      group: group(groupKey),
      member: member({ name: "second", calories: 401, protein: 20, carbs: 40, fat: 15, time: "09:00", date: "2026-07-16", logSource: "test" }, "undo-group-second"),
    });
    await t.mutation(writerApi.writeMealAction, {
      group: group(groupKey),
      member: member({ name: "third", calories: 402, protein: 20, carbs: 40, fat: 15, time: "10:00", date: "2026-07-16", logSource: "test" }, "undo-group-third"),
    });
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    await asUser.mutation(undoApi.undoAction, { actionId: actions[1]._id });
    await t.run((ctx) => ctx.db.patch(actions[2]._id, { status: "failed" }));

    const result = await asUser.mutation(undoApi.undoGroup, { groupId: actions[0].groupId });
    const stored = await t.run((ctx) => ctx.db.query("actions").collect());

    expect(result.results).toHaveLength(3);
    expect(stored.map((action) => action.status).sort()).toEqual(["failed", "undone", "undone"]);
    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(1);
    expect(result.results.find((item: any) => item.actionId === actions[2]._id)).toMatchObject({ status: "skipped" });
  });

  test("undo recomputes workout calorie adjustment from active workouts", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, {
      weightKg: 80, heightCm: 178, age: 28, sex: "male",
      occupationType: "desk", workHoursPerDay: 8, lifestyleActivity: "moderate",
      weeklyWorkouts: [{ type: "strength", durationMin: 60, sessionsPerWeek: 4 }],
      goal: "moderate_loss", date: "2026-07-16",
    });
    const workoutId = await t.mutation(writerApi.writeWorkoutAction, {
      group: group("undo-workout"),
      member: member({ name: "Run", sets: "1", duration: "30", intensity: "MODERATE", date: "2026-07-16", timestamp: "09:00", caloriesBurned: plan.plannedEatPerTrainingDay + 250, logSource: "test" }, "undo-workout-member"),
    });
    const action = (await t.run((ctx) => ctx.db.query("actions").collect()))[0];
    expect((await asUser.query(api.goals.getDailyGoal, { date: "2026-07-16" })).calorieGoal).toBe(plan.calories + 250);

    await asUser.mutation(undoApi.undoAction, { actionId: action._id });

    expect((await asUser.query(api.goals.getDailyGoal, { date: "2026-07-16" })).calorieGoal).toBe(plan.calories);
    expect(await t.run((ctx) => ctx.db.get(workoutId))).toMatchObject({ undoneAt: expect.any(Number) });
  });

  test("undone meals and workouts are excluded from list and daily-total queries", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    await writeMeal(t, "undo-query-meal");
    await t.mutation(writerApi.writeWorkoutAction, {
      group: group("undo-query-workout"),
      member: member({ name: "Lift", sets: "3", duration: "20", intensity: "HIGH", date: "2026-07-16", timestamp: "11:00", caloriesBurned: 180, logSource: "test" }, "undo-query-workout-member"),
    });
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    for (const action of actions) await asUser.mutation(undoApi.undoAction, { actionId: action._id });

    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(0);
    expect(await asUser.query(api.workouts.getWorkouts, { date: "2026-07-16" })).toHaveLength(0);
    expect(await asUser.query(api.workouts.getTotalCaloriesBurned, { date: "2026-07-16" })).toMatchObject({ total: 0, count: 0 });
  });

  test("coach workout context excludes a soft-undone workout", async () => {
    const t = convexTest(schema, modules);
    const workoutId = await t.mutation(writerApi.writeWorkoutAction, {
      group: group("context-undone-workout"),
      member: member({ name: "Lift", sets: "3", duration: "20", intensity: "HIGH", date: "2026-07-16", timestamp: "11:00", caloriesBurned: 180, logSource: "test" }, "context-undone-workout-member"),
    });
    await t.run((ctx) => ctx.db.patch(workoutId, { undoneAt: Date.now() }));
    expect(await t.query((internal as any).workouts.getWorkoutsForContext, { userId: "undo-user", date: "2026-07-16" })).toEqual([]);
  });

  test("undoing a canonical workout preserves memory backed by an active actionless workout", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    await t.run((ctx) => ctx.db.insert("workouts", {
      userId: "undo-user",
      date: "2026-07-16",
      name: "Run",
      sets: "1",
      duration: "30",
      intensity: "MODERATE",
      timestamp: "09:00",
      caloriesBurned: 200,
    }));
    await t.mutation(writerApi.writeWorkoutAction, {
      group: group("memory-attributed-workout"),
      member: member({ name: "Run", sets: "1", duration: "30", intensity: "MODERATE", date: "2026-07-16", timestamp: "12:00", caloriesBurned: 220, logSource: "test" }, "memory-attributed-workout-member"),
    });
    const action = (await t.run((ctx) => ctx.db.query("actions").collect())).find((candidate) => candidate.memberIdempotencyKey === "memory-attributed-workout-member")!;
    await asUser.mutation(undoApi.undoAction, { actionId: action._id });
    const memory = await t.run((ctx) => ctx.db.query("workout_memory").first());
    expect(memory).toMatchObject({ timesLogged: 1, sourceActionIds: [] });
    expect(memory?.undoneAt).toBeUndefined();
  });

  test("upsert undo restores previous fields and clears the row undone marker", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    await t.mutation(writerApi.writeRecoveryAction, {
      group: group("undo-sleep-upsert-1"),
      member: member({ kind: "sleep", hours: 6, quality: "ok", note: "baseline", date: "2026-07-16" }, "undo-sleep-upsert-1"),
    });
    await t.mutation(writerApi.writeRecoveryAction, {
      group: group("undo-sleep-upsert-2"),
      member: member({ kind: "sleep", hours: 8, quality: "good", note: "changed", date: "2026-07-16" }, "undo-sleep-upsert-2"),
    });
    const action2 = (await t.run((ctx) => ctx.db.query("actions").collect())).find((action) => action.memberIdempotencyKey === "undo-sleep-upsert-2")!;
    const result = await asUser.mutation(undoApi.undoAction, { actionId: action2._id });
    const row = await t.run((ctx) => ctx.db.query("sleep_logs").first());
    expect(result.status).toBe("undone");
    const action1 = (await t.run((ctx) => ctx.db.query("actions").collect())).find((action) => action.memberIdempotencyKey === "undo-sleep-upsert-1")!;
    expect(row).toMatchObject({ hours: 6, quality: "ok", note: "baseline", sourceActionId: String(action1._id) });
    expect(row?.undoneAt).toBeUndefined();
  });

  test("undoing an older action after a newer update is skipped due to version mismatch", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "undo-user" });
    await t.mutation(writerApi.writeRecoveryAction, {
      group: group("undo-sleep-order-1"),
      member: member({ kind: "sleep", hours: 6, quality: "ok", date: "2026-07-16" }, "undo-sleep-order-1"),
    });
    const action1 = (await t.run((ctx) => ctx.db.query("actions").collect())).find((action) => action.memberIdempotencyKey === "undo-sleep-order-1")!;
    await t.mutation(writerApi.writeRecoveryAction, {
      group: group("undo-sleep-order-2"),
      member: member({ kind: "sleep", hours: 8, quality: "good", date: "2026-07-16" }, "undo-sleep-order-2"),
    });
    const result = await asUser.mutation(undoApi.undoAction, { actionId: action1._id });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("Row has changed");
  });
});

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const writer = (name: "writeMealAction" | "writeWorkoutAction" | "writeRecoveryAction") =>
  (internal as any).actions_writer[name];

function group(rawInput: string, key: string) {
  return { userId: "writer-user", groupIdempotencyKey: key, sourceSurface: "direct_ui" as const, rawInput };
}

function member(payload: any, key: string, provenance: "user_reported" | "ai_extracted" | "database_match" = "user_reported") {
  return {
    memberIdempotencyKey: key,
    payload,
    provenance,
    validation: { status: "valid" as const, messages: [] },
    reversible: true,
    resolvedDate: payload.date,
    resolvedTime: payload.time,
  };
}

describe("canonical action writers", () => {
  test("guards the AI action against public wellness and gamification calls", () => {
    const source = readFileSync(new URL("./ai.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/runMutation\s*\(\s*api\.(wellness|gamification)\./);
  });

  test("writes a meal, action envelope, behavior, and gamification exactly once on retry", async () => {
    const t = convexTest(schema, modules);
    const args = {
      group: group("writer meal", "writer-meal-group"),
      member: member({ name: "Oats", calories: 300, protein: 12, carbs: 45, fat: 8, time: "08:00", date: "2026-07-16", logSource: "test" }, "writer-meal-member"),
    };
    const first = await t.mutation(writer("writeMealAction"), args);
    const second = await t.mutation(writer("writeMealAction"), args);
    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    const behavior = await t.run((ctx) => ctx.db.query("user_behavior").collect());

    expect(first).toBe(second);
    expect(meals).toHaveLength(1);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ status: "committed", committedRowRef: { table: "meals" } });
    expect(behavior).toHaveLength(1);
  });

  test("writes a validated workout through the canonical domain path", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(writer("writeWorkoutAction"), {
      group: group("writer workout", "writer-workout-group"),
      member: member({ name: "Run", sets: "1", duration: "30", intensity: "MODERATE", date: "2026-07-16", timestamp: "09:00", caloriesBurned: 250, logSource: "test" }, "writer-workout-member", "ai_extracted"),
    });
    const workouts = await t.run((ctx) => ctx.db.query("workouts").collect());
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    expect(id).toBe(workouts[0]._id);
    expect(workouts[0]).toMatchObject({ name: "Run", caloriesBurned: 250 });
    expect(actions[0]).toMatchObject({ actionType: "workout", status: "committed", committedRowRef: { table: "workouts" } });
  });

  test("routes recovery kinds through one writer and preserves upsert results", async () => {
    const t = convexTest(schema, modules);
    const base = { group: group("writer recovery", "writer-recovery-group") };
    const sleep = await t.mutation(writer("writeRecoveryAction"), {
      ...base,
      member: member({ kind: "sleep", hours: 7, quality: "good", date: "2026-07-16" }, "writer-sleep-member"),
    });
    const steps = await t.mutation(writer("writeRecoveryAction"), {
      ...base,
      member: member({ kind: "steps", count: 5000, date: "2026-07-16" }, "writer-steps-member"),
    });
    const water = await t.mutation(writer("writeRecoveryAction"), {
      ...base,
      member: member({ kind: "water", ml: 500, time: "12:00", date: "2026-07-16" }, "writer-water-member"),
    });
    const mood = await t.mutation(writer("writeRecoveryAction"), {
      ...base,
      member: member({ kind: "mood", rating: 4, time: "12:05", date: "2026-07-16" }, "writer-mood-member"),
    });
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    const sleepRows = await t.run((ctx) => ctx.db.query("sleep_logs").collect());
    const stepRows = await t.run((ctx) => ctx.db.query("steps_logs").collect());
    const waterRows = await t.run((ctx) => ctx.db.query("water_logs").collect());
    const moodRows = await t.run((ctx) => ctx.db.query("mood_logs").collect());

    expect(sleep.previous).toBeUndefined();
    expect(steps.previous).toBeUndefined();
    expect([sleep.id, steps.id, water.id, mood.id]).toHaveLength(4);
    expect(actions).toHaveLength(4);
    expect(sleepRows).toHaveLength(1);
    expect(stepRows[0].count).toBe(5000);
    expect(waterRows[0].ml).toBe(500);
    expect(moodRows[0].rating).toBe(4);
  });

  test("water and mood appends create a new active row each time", async () => {
    const t = convexTest(schema, modules);
    const base = { group: group("writer water append", "writer-water-append-group") };
    await t.mutation(writer("writeRecoveryAction"), {
      ...base,
      member: member({ kind: "water", ml: 250, time: "08:00", date: "2026-07-16" }, "writer-water-append-1"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      ...base,
      member: member({ kind: "water", ml: 250, time: "09:00", date: "2026-07-16" }, "writer-water-append-2"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("writer mood append", "writer-mood-append-group"),
      member: member({ kind: "mood", rating: 3, time: "10:00", date: "2026-07-16" }, "writer-mood-append-1"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("writer mood append", "writer-mood-append-group"),
      member: member({ kind: "mood", rating: 4, time: "11:00", date: "2026-07-16" }, "writer-mood-append-2"),
    });
    const waterRows = await t.run((ctx) => ctx.db.query("water_logs").collect());
    const moodRows = await t.run((ctx) => ctx.db.query("mood_logs").collect());
    expect(waterRows).toHaveLength(2);
    expect(waterRows.reduce((sum, row) => sum + row.ml, 0)).toBe(500);
    expect(moodRows).toHaveLength(2);
  });

  test("water upsert from check-in replaces the active row and records a previous", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("writer water upsert", "writer-water-upsert-group"),
      member: member({ kind: "water", ml: 250, time: "08:00", date: "2026-07-16", mode: "upsert" }, "writer-water-upsert-1"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("writer water upsert 2", "writer-water-upsert-group-2"),
      member: member({ kind: "water", ml: 500, time: "09:00", date: "2026-07-16", mode: "upsert" }, "writer-water-upsert-2"),
    });
    const rows = await t.run((ctx) => ctx.db.query("water_logs").collect());
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].ml).toBe(500);
    expect(actions.find((action) => action.memberIdempotencyKey === "writer-water-upsert-2")?.payload?.previous).toMatchObject({
      ml: 250,
      time: "08:00",
      sourceActionId: expect.any(String),
    });
  });
});

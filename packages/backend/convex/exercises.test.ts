import type { ExerciseRecord } from "@stride/core";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

/** Creates one valid record matching the core exercise importer output. */
function exercise(overrides: Partial<ExerciseRecord> = {}): ExerciseRecord {
  return {
    sourceId: "barbell-bench",
    name: "Barbell Bench Press",
    category: "strength",
    equipment: "barbell",
    mechanic: "compound",
    level: "beginner",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    ...overrides,
  };
}

/** Creates a shared catalog and a signed-in reader. */
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await t.mutation(internal.exercises.upsertBatch, {
    exercises: [
      exercise(),
      exercise({ sourceId: "dumbbell-bench", name: "Dumbbell Bench Press", equipment: "dumbbell" }),
      exercise({ sourceId: "bench-stretch", name: "Bench Chest Stretch", category: "stretching" }),
      exercise({ sourceId: "squat", name: "Squat", primaryMuscles: ["quadriceps"] }),
    ],
  });
  return { t, user };
}

test("search matches exercise names and filters category through the search index", async () => {
  const { user } = await setup();
  const rows = await user.query(api.exercises.search, { query: " bench ", category: " strength " });
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.name.includes("Bench") && row.category === "strength")).toBe(true);
  expect(await user.query(api.exercises.search, { query: "unknown exercise" })).toEqual([]);
});

test("search browses empty text and applies category and result bounds", async () => {
  const { user } = await setup();
  expect(await user.query(api.exercises.search, { query: "", limit: 2 })).toHaveLength(2);
  const rows = await user.query(api.exercises.search, { query: "  ", category: "strength" });
  expect(rows.map((row) => row.name)).toEqual(["Barbell Bench Press", "Dumbbell Bench Press", "Squat"]);
  expect(await user.query(api.exercises.search, { query: "", category: "cardio" })).toEqual([]);
});

test("search caps the default result window at 30", async () => {
  const { t, user } = await setup();
  await t.mutation(internal.exercises.upsertBatch, {
    exercises: Array.from({ length: 35 }, (_, i) => exercise({ sourceId: `exercise-${i}`, name: `Bench Variation ${i}` })),
  });
  expect(await user.query(api.exercises.search, { query: "" })).toHaveLength(30);
  expect(await user.query(api.exercises.search, { query: "bench" })).toHaveLength(30);
});

test.each([0, -1, 31, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("search rejects invalid limit %s", async (limit) => {
  const { user } = await setup();
  await expect(user.query(api.exercises.search, { query: "bench", limit })).rejects.toThrow(/limit/);
});

test("search rejects oversized text and blank or oversized category", async () => {
  const { user } = await setup();
  await expect(user.query(api.exercises.search, { query: "x".repeat(201) })).rejects.toThrow(/query/);
  await expect(user.query(api.exercises.search, { query: "", category: " " })).rejects.toThrow(/category/);
  await expect(user.query(api.exercises.search, { query: "", category: "x".repeat(81) })).rejects.toThrow(/category/);
});

test("get returns a shared exercise and null after its deletion", async () => {
  const { t, user } = await setup();
  const rows = await user.query(api.exercises.search, { query: "squat" });
  const exerciseId = rows[0]._id;
  expect(await user.query(api.exercises.get, { exerciseId })).toMatchObject({ sourceId: "squat", name: "Squat" });
  const other = t.withIdentity({ subject: "user_b" });
  expect(await other.query(api.exercises.get, { exerciseId })).toMatchObject({ sourceId: "squat" });
  await t.run((ctx) => ctx.db.delete("exercises", exerciseId));
  expect(await user.query(api.exercises.get, { exerciseId })).toBeNull();
});

test("catalog queries require authentication", async () => {
  const { t, user } = await setup();
  const [row] = await user.query(api.exercises.search, { query: "squat" });
  await expect(t.query(api.exercises.search, { query: "bench" })).rejects.toThrow(/Unauthenticated/);
  await expect(t.query(api.exercises.get, { exerciseId: row._id })).rejects.toThrow(/Unauthenticated/);
});

test("upsertBatch preserves IDs, skips unchanged rows and updates sourceId matches", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(internal.exercises.upsertBatch, { exercises: [exercise()] })).toEqual({
    inserted: 1, updated: 0, unchanged: 0,
  });
  const [before] = await t.run((ctx) => ctx.db.query("exercises").take(2));
  expect(await t.mutation(internal.exercises.upsertBatch, { exercises: [exercise()] })).toEqual({
    inserted: 0, updated: 0, unchanged: 1,
  });
  expect(await t.mutation(internal.exercises.upsertBatch, {
    exercises: [exercise({ name: " Bench Press ", equipment: null })],
  })).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
  const rows = await t.run((ctx) => ctx.db.query("exercises").take(2));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ _id: before._id, name: "Bench Press", equipment: null });
  expect(rows[0]).not.toHaveProperty("images");
  expect(rows[0]).not.toHaveProperty("imageUrl");
});

test("upsertBatch handles repeated sourceIds in one batch with the last value", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(internal.exercises.upsertBatch, {
    exercises: [exercise(), exercise({ name: "Bench Press" }), exercise({ name: "Bench Press" })],
  })).toEqual({ inserted: 1, updated: 1, unchanged: 1 });
  const rows = await t.run((ctx) => ctx.db.query("exercises").take(2));
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Bench Press");
});

test("upsertBatch trims imported text and deduplicates muscles", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.exercises.upsertBatch, {
    exercises: [exercise({ sourceId: " bench ", primaryMuscles: [" chest ", "chest"], secondaryMuscles: [] })],
  });
  const [row] = await t.run((ctx) => ctx.db.query("exercises").take(1));
  expect(row).toMatchObject({ sourceId: "bench", primaryMuscles: ["chest"], secondaryMuscles: [] });
});

test("upsertBatch rejects empty and oversized batches", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(internal.exercises.upsertBatch, { exercises: [] })).rejects.toThrow(/1-100/);
  await expect(t.mutation(internal.exercises.upsertBatch, {
    exercises: Array.from({ length: 101 }, (_, i) => exercise({ sourceId: `exercise-${i}` })),
  })).rejects.toThrow(/1-100/);
});

test("upsertBatch rejects image fields instead of persisting them", async () => {
  const t = convexTest(schema, modules);
  const record = { ...exercise(), images: ["excluded-image"] };
  await expect(t.mutation(internal.exercises.upsertBatch, { exercises: [record] })).rejects.toThrow(/images/);
  expect(await t.run((ctx) => ctx.db.query("exercises").take(1))).toEqual([]);
});

test.each([
  ["sourceId", { sourceId: " " }],
  ["sourceId", { sourceId: "x".repeat(201) }],
  ["name", { name: "" }],
  ["name", { name: "x".repeat(201) }],
  ["category", { category: " " }],
  ["equipment", { equipment: " " }],
  ["mechanic", { mechanic: "x".repeat(81) }],
  ["level", { level: "" }],
  ["primaryMuscles", { primaryMuscles: [] }],
  ["primaryMuscles", { primaryMuscles: [" "] }],
  ["secondaryMuscles", { secondaryMuscles: Array.from({ length: 17 }, () => "chest") }],
] satisfies [string, Partial<ExerciseRecord>][])("upsertBatch rejects malformed %s without importing earlier rows", async (field, overrides) => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(internal.exercises.upsertBatch, {
    exercises: [exercise({ sourceId: "valid" }), exercise(overrides)],
  })).rejects.toThrow(field);
  expect(await t.run((ctx) => ctx.db.query("exercises").take(1))).toEqual([]);
});

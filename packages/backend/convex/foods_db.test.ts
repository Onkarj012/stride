import type { ExerciseRecord, FoodPortionRecord, FoodRecord } from "@stride/core";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const FOODS: FoodRecord[] = [
  {
    name: "Rice, white, long-grain, cooked",
    aliases: ["chawal", "bhaat"],
    per100g: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 },
    source: "fdc",
    sourceId: "168878",
    verified: true,
  },
  {
    name: "Ghee",
    aliases: [],
    per100g: { kcal: 876, protein: 0.28, carbs: 0, fat: 99.48, fiber: null, sugar: null, sodiumMg: null },
    source: "ifct",
    sourceId: "T001",
    verified: true,
  },
];

const PORTIONS: FoodPortionRecord[] = [
  { source: "fdc", sourceId: "168878", measure: "cup", description: "cup", gramsPerMeasure: 158 },
  { source: "fdc", sourceId: "999999", measure: "cup", description: "cup", gramsPerMeasure: 100 },
];

const EXERCISES: ExerciseRecord[] = [
  {
    sourceId: "Barbell_Squat",
    name: "Barbell Squat",
    category: "strength",
    equipment: "barbell",
    mechanic: "compound",
    level: "beginner",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "hamstrings"],
  },
];

test("food, portion and exercise upserts are idempotent on source ids", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(internal.foods_db.upsertFoods, { foods: FOODS })).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
  expect(await t.mutation(internal.foods_db.upsertFoods, { foods: FOODS })).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
  expect(await t.mutation(internal.foods_db.upsertFoodPortions, { portions: PORTIONS })).toEqual({
    inserted: 1,
    updated: 0,
    unchanged: 0,
    missingFood: 1,
  });
  expect(await t.mutation(internal.foods_db.upsertFoodPortions, { portions: PORTIONS })).toMatchObject({
    inserted: 0,
    unchanged: 1,
  });
  expect(await t.mutation(internal.foods_db.upsertExercises, { exercises: EXERCISES })).toEqual({
    inserted: 1,
    updated: 0,
    unchanged: 0,
  });
  expect(await t.mutation(internal.foods_db.upsertExercises, { exercises: EXERCISES })).toEqual({
    inserted: 0,
    updated: 0,
    unchanged: 1,
  });

  const counts = await t.run(async (ctx) => ({
    foods: (await ctx.db.query("foods").take(10)).length,
    portions: (await ctx.db.query("food_portions").take(10)).length,
    exercises: (await ctx.db.query("exercises").take(10)).length,
  }));
  expect(counts).toEqual({ foods: 2, portions: 1, exercises: 1 });
});

test("a changed source row updates in place", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.foods_db.upsertFoods, { foods: FOODS });
  const [rice] = FOODS;
  if (rice === undefined) throw new Error("fixture");
  const changed = { ...rice, per100g: { ...rice.per100g, kcal: 129 } };
  expect(await t.mutation(internal.foods_db.upsertFoods, { foods: [changed] })).toEqual({
    inserted: 0,
    updated: 1,
    unchanged: 0,
  });
  const stored = await t.run((ctx) =>
    ctx.db
      .query("foods")
      .withIndex("by_source_and_sourceId", (q) => q.eq("source", "fdc").eq("sourceId", "168878"))
      .unique(),
  );
  expect(stored?.per100g.kcal).toBe(129);
});

test("searchFoods matches names and aliases, bounded, signed-in only", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.foods_db.upsertFoods, { foods: FOODS });
  const user = t.withIdentity({ subject: "user_a" });
  const byAlias = await user.query(api.foods_db.searchFoods, { query: "chawal" });
  expect(byAlias.map((f) => f.name)).toEqual(["Rice, white, long-grain, cooked"]);
  const byName = await user.query(api.foods_db.searchFoods, { query: "ghee", limit: 500 });
  expect(byName.map((f) => f.name)).toEqual(["Ghee"]);
  expect(await user.query(api.foods_db.searchFoods, { query: "   " })).toEqual([]);
  await expect(t.query(api.foods_db.searchFoods, { query: "rice" })).rejects.toThrow(/Unauthenticated/);
});

test("import batches are capped", async () => {
  const t = convexTest(schema, modules);
  const rice = FOODS[0];
  if (rice === undefined) throw new Error("fixture");
  const tooMany = Array.from({ length: 501 }, (_, i) => ({ ...rice, sourceId: String(i) }));
  await expect(t.mutation(internal.foods_db.upsertFoods, { foods: tooMany })).rejects.toThrow(/at most 500/);
});

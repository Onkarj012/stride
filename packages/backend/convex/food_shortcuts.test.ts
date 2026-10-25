import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { normalizeLabelNutrients } from "./label_foods";

const modules = import.meta.glob("./**/*.*s");

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("normalizes label serving values only when serving mass is known", () => {
  expect(normalizeLabelNutrients({
    basis: "per_serving",
    servingAmount: 40,
    servingUnit: "g",
    densityGramsPer100ml: null,
    energy: 150,
    energyUnit: "kcal",
    protein: 5,
    carbs: 25,
    fat: 3,
    fiber: null,
    sugar: null,
    sodiumMg: null,
  })).toMatchObject({ kcal: 375, protein: 12.5, carbs: 62.5, fat: 7.5 });
  expect(() => normalizeLabelNutrients({
    basis: "per_serving",
    servingAmount: null,
    servingUnit: null,
    densityGramsPer100ml: null,
    energy: 150,
    energyUnit: "kcal",
    protein: 5,
    carbs: 25,
    fat: 3,
    fiber: null,
    sugar: null,
    sodiumMg: null,
  })).toThrow(/serving size/);
});

test("normalizes kJ and refuses incomplete macros and volume without mass", () => {
  const base = { basis: "per_100g" as const, servingAmount: null, servingUnit: null, densityGramsPer100ml: null, energy: 418.4, energyUnit: "kJ" as const, protein: 10, carbs: 20, fat: 5, fiber: null, sugar: null, sodiumMg: null };
  expect(normalizeLabelNutrients(base)?.kcal).toBeCloseTo(100);
  expect(() => normalizeLabelNutrients({ ...base, protein: null })).toThrow(/protein/);
  expect(() => normalizeLabelNutrients({ ...base, basis: "per_100ml" })).toThrow(/grams are in 100 ml/);
});

test("usual meals are private, use current food nutrients, and log as undoable entries", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "owner" });
  const other = t.withIdentity({ subject: "other" });
  await owner.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  await owner.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  await other.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const foodId = await t.run((ctx) => ctx.db.insert("foods", {
    name: "Rolled oats", aliases: [], searchText: "Rolled oats", per100g: { kcal: 380, protein: 13, carbs: 68, fat: 7, fiber: 10, sugar: 1, sodiumMg: 5 }, source: "fdc", sourceId: "oats", verified: true,
  }));
  const mealId = await owner.mutation(api.usual_meals.save, { name: "Breakfast", items: [{ foodId, grams: 40 }] });
  await expect(other.query(api.usual_meals.list, {})).resolves.toEqual([]);
  expect(await owner.query(api.usual_meals.list, {})).toMatchObject([{ _id: mealId, name: "Breakfast", items: [{ foodName: "Rolled oats", grams: 40 }] }]);
  await t.run(async (ctx) => ctx.db.patch("foods", foodId, { per100g: { kcal: 400, protein: 14, carbs: 70, fat: 8, fiber: 11, sugar: 1, sodiumMg: 5 } }));
  const ids = await owner.mutation(api.usual_meals.log, { mealId, submissionId: "usual-breakfast" });
  const entry = await t.run((ctx) => ctx.db.get("entries", ids[0]!));
  expect(entry).toMatchObject({ grams: 40, nutrients: { kcal: 160 }, source: "db", flags: [] });
  await owner.mutation(api.entries.undoRevision, { entryId: ids[0]!, submissionId: "undo-breakfast" });
  expect((await owner.query(api.entries.entriesForDay, {})).length).toBe(0);
});

test("usual meal logging blocks missing foods and disabled feature", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const foodId = await t.run((ctx) => ctx.db.insert("foods", {
    name: "Milk", aliases: [], searchText: "Milk", per100g: { kcal: 60, protein: 3, carbs: 5, fat: 3, fiber: null, sugar: null, sodiumMg: null }, source: "fdc", sourceId: "milk", verified: true,
  }));
  const mealId = await user.mutation(api.usual_meals.save, { name: "Milk", items: [{ foodId, grams: 100 }] });
  await t.run(async (ctx) => ctx.db.delete(foodId));
  await expect(user.mutation(api.usual_meals.log, { mealId, submissionId: "missing" })).rejects.toThrow(/no longer available/);
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: false });
  await expect(user.query(api.usual_meals.list, {})).rejects.toThrow(/Turn on saved meals/);
});

test("usual meals preserve estimate labels on logged entries", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const foodId = await t.run((ctx) => ctx.db.insert("foods", {
    name: "Estimated poha", aliases: [], searchText: "Estimated poha", per100g: { kcal: 180, protein: 4, carbs: 30, fat: 5, fiber: 3, sugar: null, sodiumMg: null }, source: "ai_estimate", sourceId: "user_a:poha", verified: false, ownerUserId: "user_a", note: "Model estimate",
  }));
  const mealId = await user.mutation(api.usual_meals.save, { name: "Poha", items: [{ foodId, grams: 200 }] });
  expect(await user.query(api.usual_meals.list, {})).toMatchObject([{ items: [{ estimated: true }] }]);
  const ids = await user.mutation(api.usual_meals.log, { mealId, submissionId: "estimate-usual" });
  const entry = await t.run((ctx) => ctx.db.get("entries", ids[0]!));
  expect(entry).toMatchObject({ source: "ai", flags: ["estimated"], grams: 200 });
});

test("a reviewed label food keeps serving provenance and remains unverified", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["label"], { type: "image/jpeg" }));
    await ctx.db.insert("uploads", { userId: "user_a", storageId: id, createdAt: Date.now() });
    return id;
  });
  const foodId = await user.mutation(api.label_foods.saveReviewedLabel, {
    storageId,
    name: "Rolled oats label",
    basis: "per_serving",
    servingAmount: 40,
    servingUnit: "g",
    densityGramsPer100ml: null,
    energy: 150,
    energyUnit: "kcal",
    protein: 5,
    carbs: 25,
    fat: 3,
    fiber: null,
    sugar: null,
    sodiumMg: null,
  });
  const food = await t.run((ctx) => ctx.db.get("foods", foodId));
  expect(food).toMatchObject({ source: "user", verified: false, per100g: { kcal: 375, protein: 12.5 }, labelProvenance: { storageId, basis: "per_serving", servingAmount: 40, servingUnit: "g" } });
  const other = t.withIdentity({ subject: "other" });
  await other.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  await expect(other.mutation(api.label_foods.saveReviewedLabel, {
    storageId,
    name: "Oats",
    basis: "per_100g",
    servingAmount: null,
    servingUnit: null,
    densityGramsPer100ml: null,
    energy: 300,
    energyUnit: "kcal",
    protein: 5,
    carbs: 25,
    fat: 3,
    fiber: null,
    sugar: null,
    sodiumMg: null,
  })).rejects.toThrow(/Label photo not found/);
});

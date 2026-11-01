import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { normalizeLabelNutrients } from "./label_foods";
import { assertImageContentType } from "./pipeline/log";
import { parseOffSearch } from "./pipeline/barcode";

const modules = import.meta.glob("./**/*.*s");

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
  const base = { basis: "per_100g" as const, servingAmount: null, servingUnit: null, densityGramsPer100ml: null, energy: 418.4, energyUnit: "kJ" as const, protein: 25, carbs: 0, fat: 0, fiber: null, sugar: null, sodiumMg: null };
  expect(normalizeLabelNutrients(base)?.kcal).toBeCloseTo(100);
  expect(() => normalizeLabelNutrients({ ...base, protein: null })).toThrow(/protein/);
  expect(() => normalizeLabelNutrients({ ...base, basis: "per_100ml" })).toThrow(/grams are in 100 ml/);
});

test("requires correction for implausible energy and rejects non-finite scaled values", () => {
  const base = { basis: "per_100g" as const, servingAmount: null, servingUnit: null, densityGramsPer100ml: null, energy: 999999, energyUnit: "kcal" as const, protein: 1, carbs: 1, fat: 1, fiber: null, sugar: null, sodiumMg: null };
  expect(() => normalizeLabelNutrients(base)).toThrow(/energy/i);
  expect(() => normalizeLabelNutrients({ ...base, energy: 10, basis: "per_serving", servingAmount: Number.MIN_VALUE, servingUnit: "g" })).toThrow(/serving amount/i);
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

test("replaying a usual meal submission returns the same multi-item entries", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const foodIds = await t.run(async (ctx) => Promise.all(["Oats", "Milk"].map((name) => ctx.db.insert("foods", {
    name, aliases: [], searchText: name, per100g: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: null, sugar: null, sodiumMg: null }, source: "fdc" as const, sourceId: name, verified: true,
  }))));
  const mealId = await user.mutation(api.usual_meals.save, { name: "Oats and milk", items: [{ foodId: foodIds[0]!, grams: 40 }, { foodId: foodIds[1]!, grams: 150 }] });
  const first = await user.mutation(api.usual_meals.log, { mealId, submissionId: "replay-oats-milk" });
  const replay = await user.mutation(api.usual_meals.log, { mealId, submissionId: "replay-oats-milk" });
  expect(replay).toEqual(first);
  expect(await t.run((ctx) => ctx.db.query("entries").collect())).toHaveLength(2);
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
  expect(await t.run((ctx) => ctx.db.query("food_portions").collect())).toMatchObject([{ foodId, source: "user", measure: "serving", description: "1 serving", gramsPerMeasure: 40 }]);
  const other = t.withIdentity({ subject: "other" });
  await other.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  await expect(other.mutation(api.label_foods.saveReviewedLabel, {
    storageId,
    name: "Oats",
    basis: "per_100g",
    servingAmount: null,
    servingUnit: null,
    densityGramsPer100ml: null,
    energy: 152,
    energyUnit: "kcal",
    protein: 5,
    carbs: 25,
    fat: 3,
    fiber: null,
    sugar: null,
    sodiumMg: null,
  })).rejects.toThrow(/Label photo not found/);
});

test("label reader rejects oversized and non-image uploads before model calls", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const storageId = await t.run(async (ctx) => {
    const oversized = await ctx.storage.store(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/jpeg" }));
    await ctx.db.insert("uploads", { userId: "user_a", storageId: oversized, createdAt: Date.now() });
    return oversized;
  });
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(user.action(api.label_foods.readNutritionLabel, { storageId })).rejects.toMatchObject({ data: { code: "PHOTO_TOO_LARGE" } });
  expect(() => assertImageContentType("application/pdf")).toThrow(/not an image/);
  expect(fetchMock).not.toHaveBeenCalled();
});

const pintola = {
  code: "8906136651968",
  brands: "Pintola",
  product_name: "High Protein Oats Chocolate",
  nutriments: { "energy-kcal_100g": 392, proteins_100g: 25, carbohydrates_100g: 54.6, fat_100g: 8, fiber_100g: 9.6, sugars_100g: 14, sodium_100g: 0.13 },
  serving_quantity: 50,
  serving_quantity_unit: "g",
};

test("product search keeps barcoded products with usable label values, once each", () => {
  const hits = parseOffSearch({ products: [
    pintola,
    pintola,
    { ...pintola, code: "not-a-code" },
    { ...pintola, code: "8906136650008", nutriments: { "energy-kcal_100g": 380 } },
  ] });
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ barcode: "8906136651968", name: "Pintola High Protein Oats Chocolate", servingGrams: 50, per100g: { kcal: 392, protein: 25, sodiumMg: 130 } });
  expect(parseOffSearch({ count: 0 })).toEqual([]);
});

test("product search needs the opt-in and caches nothing until a product is picked", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ products: [pintola] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(user.action(api.pipeline.barcode.searchProducts, { query: "pintola oats" })).rejects.toThrow(/Turn on saved meals/);
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  await expect(user.action(api.pipeline.barcode.searchProducts, { query: " " })).rejects.toMatchObject({ data: { code: "INVALID_PRODUCT_QUERY" } });
  expect(fetchMock).not.toHaveBeenCalled();
  const hits = await user.action(api.pipeline.barcode.searchProducts, { query: "pintola high protein oats" });
  expect(hits).toMatchObject([{ barcode: "8906136651968", servingGrams: 50 }]);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("search_terms=pintola+high+protein+oats");
  expect(await t.run((ctx) => ctx.db.query("foods").collect())).toEqual([]);
  fetchMock.mockImplementationOnce(async () => new Response("busy", { status: 503 }));
  await expect(user.action(api.pipeline.barcode.searchProducts, { query: "pintola" })).rejects.toMatchObject({ data: { code: "FOOD_DB_UNAVAILABLE" } });
});

test("a saved label food comes back with its serving grams only for its owner", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.food_shortcuts.setEnabled, { enabled: true });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["label"], { type: "image/jpeg" }));
    await ctx.db.insert("uploads", { userId: "user_a", storageId: id, createdAt: Date.now() });
    return id;
  });
  const foodId = await user.mutation(api.label_foods.saveReviewedLabel, {
    storageId, name: "Greek yoghurt", basis: "per_100g", servingAmount: 100, servingUnit: "g", densityGramsPer100ml: null,
    energy: 90, energyUnit: "kcal", protein: 10, carbs: 6, fat: 3, fiber: null, sugar: null, sodiumMg: null,
  });
  expect(await user.query(api.label_foods.labelFood, { foodId })).toMatchObject({ foodId, name: "Greek yoghurt", servingGrams: 100, per100g: { kcal: 90 } });
  expect(await t.withIdentity({ subject: "other" }).query(api.label_foods.labelFood, { foodId })).toBeNull();
});

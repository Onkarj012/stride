import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  buildDirectMealDraft,
  buildMealDraft,
  buildMealDraftFromParsed,
  FOOD_QUALITY_THRESHOLD,
  FOOD_RUNNER_UP_MARGIN,
  selectFoodCandidate,
  mealPayloadFromDraft,
} from "./nutrition_draft";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const base = { name: "Oats", date: "2026-07-16", time: "08:00", mealType: "breakfast" };
const macros = { kcal: 300, protein: 12, carbs: 45, fat: 8 };
const directArgs = { ...base, calories: macros.kcal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };

test("all meal sources converge on the same draft shape and totals", () => {
  const direct = buildDirectMealDraft(directArgs);
  const database = buildMealDraft({ ...base, ingredients: [{ foodText: "Oats", quantity: 1, unit: "serving", nutrition: macros, source: "database" }] });
  const recipe = buildMealDraft({ ...base, ingredients: [{ foodText: "Oats", quantity: 100, unit: "g", grams: 100, nutrition: macros, source: "database" }] });
  const memory = buildMealDraft({ ...base, ingredients: [{ foodText: "Oats", quantity: 1, unit: "serving", nutrition: macros, source: "memory" }] });
  expect(new Set([direct, database, recipe, memory].map((draft) => Object.keys(draft).sort().join("|"))).size).toBe(1);
  expect([direct, database, recipe, memory].map((draft) => draft.calories)).toEqual([300, 300, 300, 300]);
});

test("food memory is applied by the parsed meal path", async () => {
  const memory = { _id: "memory-1", normalizedName: "oats", displayName: "Usual oats", aliases: [], kcal: 310, protein: 14, carbs: 44, fat: 9, timesLogged: 3, source: "learned" };
  const ctx = { runQuery: async () => [memory] };
  const draft = await buildMealDraftFromParsed(ctx, { name: "my usual oats", description: "my usual oats", date: base.date, time: base.time }, { userId: "user-1" });
  expect(draft.foodMemoryId).toBe("memory-1");
  expect(draft.ingredients[0]).toMatchObject({ source: "memory", kcal: 310 });
});

test("quality threshold and runner-up margin use inclusive boundaries", () => {
  expect(selectFoodCandidate([{ name: "A", score: FOOD_QUALITY_THRESHOLD, source: "database" }])?.name).toBe("A");
  expect(selectFoodCandidate([
    { name: "A", score: 0.9, source: "database" },
    { name: "B", score: 0.9 - FOOD_RUNNER_UP_MARGIN, source: "database" },
  ])?.name).toBe("A");
  expect(selectFoodCandidate([
    { name: "A", score: 0.9, source: "database" },
    { name: "B", score: 0.9 - FOOD_RUNNER_UP_MARGIN + 0.01, source: "database" },
  ])).toBeNull();
});

test("ambiguous ingredients remain unresolved with scored candidates and zero contribution", () => {
  const draft = buildMealDraft({
    ...base,
    ingredients: [{
      foodText: "rice",
      quantity: 1,
      unit: "serving",
      candidates: [
        { name: "Cooked rice", score: 0.82, source: "database", caloriesPer100g: 130 },
        { name: "Rice noodles", score: 0.76, source: "database", caloriesPer100g: 109 },
      ],
    }],
  });
  expect(draft.ingredients[0]).toMatchObject({ unresolved: true, kcal: 0 });
  expect(draft.ingredients[0]?.candidates).toHaveLength(2);
  expect(draft.unresolved).toEqual(["rice"]);
});

test("reported and estimated calories stay separate", () => {
  const draft = buildMealDraft({ ...base, ingredients: [{ foodText: "meal", quantity: 1, unit: "serving", nutrition: macros, source: "database" }], reportedCalories: 450 });
  expect(draft).toMatchObject({ calories: 450, reportedCalories: 450, estimatedCalories: 300, calorieSource: "reported" });
  const estimated = buildMealDraft({ ...base, ingredients: [{ foodText: "meal", quantity: 1, unit: "serving", nutrition: macros, source: "database" }] });
  expect(estimated).toMatchObject({ calories: 300, reportedCalories: undefined, estimatedCalories: 300, calorieSource: "estimated" });
});

test("barcode grams, milliliters, and servings preserve original quantity and convert", () => {
  const grams = buildMealDraft({ ...base, ingredients: [{ foodText: "milk", quantity: 200, unit: "g", nutritionPer100g: { kcal: 50, protein: 3, carbs: 5, fat: 2 }, source: "database" }] });
  const ml = buildMealDraft({ ...base, ingredients: [{ foodText: "milk", quantity: 200, unit: "ml", nutritionPer100g: { kcal: 50, protein: 3, carbs: 5, fat: 2 }, source: "database" }] });
  const serving = buildMealDraft({ ...base, ingredients: [{ foodText: "milk", quantity: 2, unit: "servings", nutritionPer100g: { kcal: 50, protein: 3, carbs: 5, fat: 2 }, source: "database" }] });
  expect(grams.ingredients[0]).toMatchObject({ quantity: 200, unit: "g", grams: 200 });
  expect(ml.ingredients[0]).toMatchObject({ quantity: 200, unit: "ml", grams: 206 });
  expect(serving.ingredients[0]).toMatchObject({ quantity: 2, unit: "servings", grams: 200 });
});

test("unknown unit conversion stays unresolved in the canonical meal draft", () => {
  const draft = buildMealDraft({
    ...base,
    ingredients: [{
      foodText: "rice",
      quantity: 1,
      unit: "vati",
      nutritionPer100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      source: "database",
    }],
  });
  expect(draft.ingredients[0]).toMatchObject({ grams: 0, unresolved: true, kcal: 0 });
  expect(draft.unresolved).toEqual(["rice"]);
});

test("meal edits explicitly invalidate the prior ingredient detail", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "edit-user" });
  const id = await user.mutation(api.meals.addMeal, directArgs);
  await user.mutation(api.meals.updateMeal, { id, name: directArgs.name, time: directArgs.time, mealType: directArgs.mealType, calories: 420, protein: directArgs.protein, carbs: directArgs.carbs, fat: directArgs.fat });
  const meals = await user.query(api.meals.getMeals, { date: base.date });
  expect(meals[0]).toMatchObject({ calories: 420, reportedCalories: 420, calorieSource: "reported", ingredientBreakdownInvalidated: true });
});

test("calorie source can switch without deleting either value", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "source-user" });
  const id = await user.mutation(api.meals.addMeal, { ...directArgs, reportedCalories: 450 });
  await user.mutation((api as any).meals.setMealCalorieSource, { id, source: "estimated" });
  const meals = await user.query(api.meals.getMeals, { date: base.date });
  expect(meals[0]).toMatchObject({ calories: 300, reportedCalories: 450, estimatedCalories: 300, calorieSource: "estimated" });
});

test("canonical meal write then undo excludes the meal from queries", async () => {
  const t = convexTest(schema, modules);
  const draft = buildDirectMealDraft(directArgs);
  const id = await t.mutation((internal as any).actions_writer.writeMealAction, {
    group: { userId: "undo-user", groupIdempotencyKey: "nutrition-group", sourceSurface: "direct_ui", rawInput: "oats" },
    member: { memberIdempotencyKey: "nutrition-member", payload: mealPayloadFromDraft(draft, { logSource: "test" }), provenance: "user_reported", validation: { status: "valid", messages: [] }, reversible: true, resolvedDate: base.date, resolvedTime: base.time },
  });
  const action = await t.run((ctx) => ctx.db.query("actions").first());
  expect(id).toBeDefined();
  expect(action).toBeDefined();
  await t.withIdentity({ subject: "undo-user" }).mutation(api.actions_undo.undoAction, { actionId: action!._id });
  expect(await t.withIdentity({ subject: "undo-user" }).query(api.meals.getMeals, { date: base.date })).toHaveLength(0);
});

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { computeRecipeTotals } from "./recipes";

const modules = import.meta.glob("./**/*.*s");

const INGREDIENTS = [
  { name: "Oats", grams: 80, caloriesPer100g: 389, proteinPer100g: 17, carbsPer100g: 66, fatPer100g: 7 },
  { name: "Milk", grams: 200, caloriesPer100g: 42, proteinPer100g: 3.4, carbsPer100g: 5, fatPer100g: 1 },
];

describe("computeRecipeTotals (pure)", () => {
  test("totals and per-serving scale by servings", () => {
    const { total, perServing } = computeRecipeTotals(INGREDIENTS, 2);
    // Oats: 311.2 kcal, Milk: 84 kcal → 395
    expect(total.kcal).toBe(395);
    expect(perServing.kcal).toBe(198); // 395/2 rounded
  });
});

test("createRecipe computes totals, getRecipes returns them", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  await asUser.mutation(api.recipes.createRecipe, { name: "Oats", servings: 2, ingredients: INGREDIENTS });
  const recipes = await asUser.query(api.recipes.getRecipes, {});
  expect(recipes).toHaveLength(1);
  expect(recipes[0].total.kcal).toBe(395);
  expect(recipes[0].perServing.kcal).toBe(198);
});

test("updateRecipe recomputes; logRecipe scales into a meal", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const id = await asUser.mutation(api.recipes.createRecipe, { name: "Oats", servings: 2, ingredients: INGREDIENTS });

  await asUser.mutation(api.recipes.updateRecipe, { id, servings: 1 });
  let recipes = await asUser.query(api.recipes.getRecipes, {});
  expect(recipes[0].perServing.kcal).toBe(395); // now 1 serving

  await asUser.mutation(api.recipes.logRecipe, { id, servings: 2, date: "2026-05-29", time: "12:00" });
  const meals = await asUser.query(api.meals.getMeals, { date: "2026-05-29" });
  expect(meals).toHaveLength(1);
  expect(meals[0].calories).toBe(790); // 395 per serving × 2
  expect(meals[0].nutritionSource).toBe("recipe");
});

test("logRecipe appends user note to components, not aiSuggestion", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const id = await asUser.mutation(api.recipes.createRecipe, { name: "Oats", servings: 1, ingredients: INGREDIENTS });
  await asUser.mutation(api.recipes.logRecipe, {
    id,
    date: "2026-05-30",
    time: "12:00",
    note: "extra cheese, skipped the oil",
  });
  const meals = await asUser.query(api.meals.getMeals, { date: "2026-05-30" });
  expect(meals[0].aiSuggestion).toBeUndefined();
  expect(meals[0].components).toContain("extra cheese, skipped the oil");
  const breakdown = JSON.parse(meals[0].ingredientBreakdown!);
  expect(breakdown.items).toBeInstanceOf(Array);
  expect(breakdown.calories_kcal).toBeGreaterThan(0);
  expect(JSON.parse(meals[0].structuredItems!)).toEqual(breakdown.items);
});

test("logRecipe rounds fractional portions from raw totals once", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const id = await asUser.mutation(api.recipes.createRecipe, { name: "Oats", servings: 2, ingredients: INGREDIENTS });

  await asUser.mutation(api.recipes.logRecipe, { id, servings: 1.5, date: "2026-05-31", time: "12:00" });
  const meals = await asUser.query(api.meals.getMeals, { date: "2026-05-31" });
  expect(meals[0]).toMatchObject({ calories: 296, protein: 15.3, carbs: 47.1, fat: 5.7 });
});

test("meal and recipe relogs require paired client date and time", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const mealId = await asUser.mutation(api.meals.addMeal, {
    name: "Oats", calories: 200, protein: 10, carbs: 30, fat: 5, date: "2026-07-16", time: "12:00",
  });
  const recipeId = await asUser.mutation(api.recipes.createRecipe, { name: "Oats", servings: 1, ingredients: INGREDIENTS });

  await expect(asUser.mutation(api.meals.relogMeal, { id: mealId, time: "23:45" })).rejects.toThrow(/date and time must be provided together/);
  await expect(asUser.mutation(api.recipes.logRecipe, { id: recipeId, date: "2026-07-17" })).rejects.toThrow(/date and time must be provided together/);
  await expect(asUser.mutation(api.recipes.logRecipe, { id: recipeId, date: "2026-02-31", time: "23:45" })).rejects.toThrow(/valid calendar date/);
});

test("ownership enforced on update/delete/log", async () => {
  const t = convexTest(schema, modules);
  const id = await t.withIdentity({ subject: "owner" }).mutation(api.recipes.createRecipe, {
    name: "Oats", servings: 2, ingredients: INGREDIENTS,
  });
  const intruder = t.withIdentity({ subject: "intruder" });
  await expect(intruder.mutation(api.recipes.deleteRecipe, { id })).rejects.toThrow(/Not found/);
  await expect(intruder.mutation(api.recipes.logRecipe, { id })).rejects.toThrow(/Not found/);
});

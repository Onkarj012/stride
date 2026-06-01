import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  buildNutritionResult,
  computeNutrition,
  type ItemBreakdown,
  type NutritionResult,
} from "./nutrition_engine";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export interface RecipeIngredient {
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source?: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Match meals written by ai.ts: NutritionResult + structuredItems = items[]. */
function nutritionBreakdownFromRecipeIngredients(
  ings: RecipeIngredient[],
  scale = 1,
): NutritionResult {
  const items: ItemBreakdown[] = ings.map((ing) => {
    const grams = Math.max(0, ing.grams) * scale;
    const n = computeNutrition(
      {
        caloriesPer100g: ing.caloriesPer100g,
        proteinPer100g: ing.proteinPer100g,
        carbsPer100g: ing.carbsPer100g,
        fatPer100g: ing.fatPer100g,
      },
      grams,
    );
    return {
      food_text: ing.name,
      matched_food_name: ing.name,
      grams,
      calories_kcal: n.calories_kcal,
      protein_g: n.protein_g,
      carbs_g: n.carbs_g,
      fat_g: n.fat_g,
      source: ing.source ?? "recipe",
      confidence: 0.85,
    };
  });
  return buildNutritionResult(items, []);
}

/** Pure: sum ingredient macros (total) and divide by servings (per-serving). */
export function computeRecipeTotals(ingredients: RecipeIngredient[], servings: number) {
  const s = Math.max(1, servings || 1);
  const total = ingredients.reduce(
    (acc, ing) => {
      const ratio = Math.max(0, ing.grams) / 100;
      acc.kcal += Math.max(0, ing.caloriesPer100g || 0) * ratio;
      acc.p += Math.max(0, ing.proteinPer100g || 0) * ratio;
      acc.c += Math.max(0, ing.carbsPer100g || 0) * ratio;
      acc.f += Math.max(0, ing.fatPer100g || 0) * ratio;
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const round = (o: typeof total) => ({ kcal: Math.round(o.kcal), p: r1(o.p), c: r1(o.c), f: r1(o.f) });
  return {
    total: round(total),
    perServing: round({ kcal: total.kcal / s, p: total.p / s, c: total.c / s, f: total.f / s }),
  };
}

const ingredientValidator = v.array(
  v.object({
    name: v.string(),
    grams: v.number(),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatPer100g: v.number(),
    source: v.optional(v.string()),
  }),
);

export const getRecipes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return ctx.db.query("recipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  },
});

export const getRecipe = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const recipe = await ctx.db.get(id);
    if (!recipe || recipe.userId !== userId) return null;
    return recipe;
  },
});

export const createRecipe = mutation({
  args: {
    name: v.string(),
    servings: v.number(),
    ingredients: ingredientValidator,
    steps: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { name, servings, ingredients, steps, source }) => {
    const userId = await requireUserId(ctx);
    const { total, perServing } = computeRecipeTotals(ingredients, servings);
    return ctx.db.insert("recipes", {
      userId,
      name,
      servings: Math.max(1, servings),
      ingredients: JSON.stringify(ingredients),
      total,
      perServing,
      steps: steps?.filter((s) => s.trim()),
      source,
    });
  },
});

export const updateRecipe = mutation({
  args: {
    id: v.id("recipes"),
    name: v.optional(v.string()),
    servings: v.optional(v.number()),
    ingredients: v.optional(ingredientValidator),
    steps: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, name, servings, ingredients, steps }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    const nextIngredients: RecipeIngredient[] = ingredients ?? JSON.parse(existing.ingredients);
    const nextServings = servings ?? existing.servings;
    const { total, perServing } = computeRecipeTotals(nextIngredients, nextServings);
    await ctx.db.patch(id, {
      name: name ?? existing.name,
      servings: Math.max(1, nextServings),
      ingredients: JSON.stringify(nextIngredients),
      total,
      perServing,
      steps: steps ? steps.filter((s) => s.trim()) : existing.steps,
    });
  },
});

export const deleteRecipe = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

/** Task 11: log a saved recipe as a meal, scaled to chosen servings.
 *  Optional `ingredients` override + `note` let the user tweak this one log
 *  for accuracy without mutating the saved recipe. */
export const logRecipe = mutation({
  args: {
    id: v.id("recipes"),
    servings: v.optional(v.number()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    ingredients: v.optional(ingredientValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, servings, date, time, ingredients, note }) => {
    const userId = await requireUserId(ctx);
    const recipe = await ctx.db.get(id);
    if (!recipe || recipe.userId !== userId) throw new Error("Not found");
    const portions = Math.max(0.25, servings ?? 1);
    const ings: RecipeIngredient[] = ingredients ?? JSON.parse(recipe.ingredients);
    const { perServing: ps } = computeRecipeTotals(ings, recipe.servings);
    const ingredientList = ings.map((i) => `${i.name} (${i.grams}g)`).join(", ");
    const trimmedNote = note?.trim();
    const components = trimmedNote
      ? `${ingredientList} — ${trimmedNote}`
      : ingredientList;
    const scale = portions / recipe.servings;
    const breakdown = nutritionBreakdownFromRecipeIngredients(ings, scale);

    return ctx.db.insert("meals", {
      userId,
      date: date ?? new Date().toISOString().split("T")[0],
      name: recipe.name,
      calories: Math.round(ps.kcal * portions),
      protein: r1(ps.p * portions),
      carbs: r1(ps.c * portions),
      fat: r1(ps.f * portions),
      time: time ?? new Date().toISOString().slice(11, 16),
      mealType: "unspecified",
      nutritionSource: "recipe",
      components,
      structuredItems: JSON.stringify(breakdown.items),
      ingredientBreakdown: JSON.stringify(breakdown),
    });
  },
});

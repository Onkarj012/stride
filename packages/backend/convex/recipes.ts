import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { deriveGroupKey, deriveMemberKey } from "./actions_idempotency";
import { finalizeActionGroupAfterWrite } from "./actions_group";
import { findBestMatch } from "./food_memory_match";
import { buildMealDraft, mealPayloadFromDraft } from "./nutrition_draft";
import {
  buildNutritionResult,
  computeNutrition,
  type ItemBreakdown,
  type NutritionResult,
} from "./nutrition_engine";
import {
  buildIdempotencyKey,
  mealContentHash,
  normalizeLogSource,
  timeWindowKey,
} from "./validation";
import { resolveTargetDateTime } from "./time_resolve";

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

/** Pure: sum ingredient macros without rounding. */
export function computeRawRecipeTotal(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
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
}

/** Pure: sum ingredient macros (total) and divide by servings (per-serving). */
export function computeRecipeTotals(ingredients: RecipeIngredient[], servings: number) {
  const s = Math.max(1, servings || 1);
  const total = computeRawRecipeTotal(ingredients);
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
  handler: async (ctx, { id, servings, date, time, ingredients, note }): Promise<any> => {
    const userId = await requireUserId(ctx);
    const recipe = await ctx.db.get(id);
    if (!recipe || recipe.userId !== userId) throw new Error("Not found");
    const portions = Math.max(0.25, servings ?? 1);
    const ings: RecipeIngredient[] = ingredients ?? JSON.parse(recipe.ingredients);
    const rawTotal = computeRawRecipeTotal(ings);
    const ingredientList = ings.map((i) => `${i.name} (${i.grams}g)`).join(", ");
    const trimmedNote = note?.trim();
    const components = trimmedNote
      ? `${ingredientList} — ${trimmedNote}`
      : ingredientList;
    const scale = portions / recipe.servings;
    const { date: targetDate, time: targetTime } = resolveTargetDateTime({ date, time }, true);
    const memories = await ctx.db.query("food_memory").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const draft = buildMealDraft({
      name: recipe.name,
      date: targetDate,
      time: targetTime,
      mealType: "unspecified",
      ingredients: ings.map((ing) => ({
        foodText: ing.name,
        quantity: Math.max(0, ing.grams) * scale,
        unit: "g",
        grams: Math.max(0, ing.grams) * scale,
        nutritionPer100g: {
          kcal: ing.caloriesPer100g,
          protein: ing.proteinPer100g,
          carbs: ing.carbsPer100g,
          fat: ing.fatPer100g,
        },
        source: ing.source ?? "database",
        confidence: 0.85,
      })),
      rawTotals: {
        kcal: rawTotal.kcal * scale,
        protein: rawTotal.p * scale,
        carbs: rawTotal.c * scale,
        fat: rawTotal.f * scale,
      },
      memoryMatch: findBestMatch(recipe.name, memories as any[]) ?? undefined,
      nutritionSource: "recipe",
    });
    const logSource = normalizeLogSource("recipe", "recipe");
    const idempotencyKey = buildIdempotencyKey({
      userId,
      date: targetDate,
      source: logSource,
      contentHash: mealContentHash(draft),
      timeWindow: timeWindowKey(targetTime),
    });
    const rawInput = JSON.stringify({ id, portions, targetDate, targetTime, ingredients: ings, note: trimmedNote });
    const groupKey = deriveGroupKey({ userId, sourceSurface: "recipe", rawInput });
    const payload = mealPayloadFromDraft(draft, { components, logSource });
    const mealId = await ctx.runMutation((internal as any).actions_writer.writeMealAction, {
      group: { userId, groupIdempotencyKey: groupKey, sourceSurface: "recipe", rawInput },
      member: {
        memberIdempotencyKey: deriveMemberKey({ groupKey, actionType: "meal", payloadFingerprint: idempotencyKey, ordinal: 0 }),
        payload: {
          ...payload,
        },
        provenance: "database_match",
        confidence: draft.confidence,
        validation: { status: "valid", messages: [] },
        reversible: true,
        resolvedDate: targetDate,
        resolvedTime: targetTime,
      },
    });
    await finalizeActionGroupAfterWrite(ctx, userId, groupKey);
    return mealId;
  },
});

export const getTopRecipesForContext = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit = 8 }) => {
    const rows = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.slice(0, limit).map((r) => ({
      name: r.name,
      servings: r.servings,
      kcalPerServing: r.perServing.kcal,
      proteinPerServing: r.perServing.p,
      carbsPerServing: r.perServing.c,
      fatPerServing: r.perServing.f,
    }));
  },
});

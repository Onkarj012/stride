/**
 * Canonical nutrition contract.
 *
 * Every meal entry point normalizes into this shape before it reaches the
 * canonical meal writer.  Totals are deliberately calculated from ingredient
 * contributions only.  An unresolved ingredient contributes zero.
 */

import { internal } from "./_generated/api";
import { findBestMatch, type FoodMemoryEntry, type MatchResult } from "./food_memory_match";
import { computeNutrition, type NormalizedFood } from "./nutrition_engine";
import { toGrams } from "./unit_converter";
import { assertInRange } from "./validation";

export const FOOD_QUALITY_THRESHOLD = 0.7;
export const FOOD_RUNNER_UP_MARGIN = 0.15;

// Short aliases make the policy easy to reference from tests and callers.
export const QUALITY_THRESHOLD = FOOD_QUALITY_THRESHOLD;
export const RUNNER_UP_MARGIN = FOOD_RUNNER_UP_MARGIN;

export type IngredientSource = "user_reported" | "database" | "ai_estimate" | "memory";
export type CalorieSource = "reported" | "estimated";

export type MacroValues = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealCandidate = {
  name: string;
  score: number;
  source: "database" | "memory";
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  verified?: boolean;
};

export type MealDraftIngredient = {
  foodText: string;
  matchedFoodName?: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: IngredientSource;
  confidence: number;
  unresolved: boolean;
  candidates: MealCandidate[];
};

export type MealDraft = {
  kind: "meal";
  name: string;
  date: string;
  time: string;
  mealType: string;
  ingredients: MealDraftIngredient[];
  /** Compatibility alias for existing nutrition detail consumers. */
  items: MealDraftIngredient[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  estimatedCalories?: number;
  reportedCalories?: number;
  calorieSource?: CalorieSource;
  unresolved: string[];
  confidence: number;
  nutritionSource: string;
  foodMemoryId?: string;
  detailInvalidated?: boolean;
  rawTotals?: MacroValues;
  validationFlags: string[];
};

export type MealDraftIngredientInput = {
  name?: string;
  foodText?: string;
  quantity?: number;
  amount?: number;
  unit?: string;
  grams?: number;
  source?: IngredientSource | string;
  confidence?: number;
  nutrition?: MacroValues;
  nutritionPer100g?: MacroValues;
  candidates?: MealCandidate[];
  unresolved?: boolean;
  matchedFoodName?: string;
};

export type MealDraftInput = {
  name: string;
  date: string;
  time: string;
  mealType?: string;
  ingredients?: MealDraftIngredientInput[];
  reportedCalories?: number;
  estimatedCalories?: number;
  calorieSource?: CalorieSource;
  foodMemoryId?: string;
  detailInvalidated?: boolean;
  memoryMatch?: MatchResult;
  nutritionSource?: string;
  rawTotals?: MacroValues;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

const INGREDIENT_QUANTITY_BORDERLINE = 1_000;
const INGREDIENT_QUANTITY_REJECT_MAX = 10_000;
const INGREDIENT_GRAMS_BORDERLINE = 2_000;
const INGREDIENT_GRAMS_REJECT_MAX = 10_000;
const INGREDIENT_KCAL_BORDERLINE = 3_500;
const INGREDIENT_KCAL_REJECT_MAX = 5_000;
const INGREDIENT_MACRO_BORDERLINE = { protein: 600, carbs: 900, fat: 450 } as const;
const INGREDIENT_MACRO_REJECT_MAX = { protein: 1_000, carbs: 1_500, fat: 750 } as const;

function boundedNonNegative(
  field: string,
  value: unknown,
  borderlineMax: number,
  rejectMax: number,
  flags: string[],
): number {
  const number = nonNegative(value);
  assertInRange(field, number, 0, rejectMax);
  if (number > borderlineMax) {
    flags.push(`${field}_clamped`);
    return borderlineMax;
  }
  return number;
}

function hasCompleteMacros(value: unknown): value is MacroValues {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return [candidate.kcal, candidate.protein, candidate.carbs, candidate.fat]
    .every((field) => typeof field === "number" && Number.isFinite(field) && field >= 0);
}

function normalizeSource(source: string | undefined): IngredientSource {
  const value = (source ?? "user_reported").toLowerCase();
  if (value === "memory") return "memory";
  if (value === "ai" || value === "ai_estimated" || value === "estimate") return "ai_estimate";
  if (value === "database" || value === "recipe" || value === "barcode" || value.includes("usda") || value.includes("off")) {
    return "database";
  }
  return "user_reported";
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
}

function candidateScore(query: string, name: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.startsWith(q) || q.startsWith(n)) return 0.88;
  if (n.includes(q) || q.includes(n)) return 0.78;
  const qWords = new Set(q.split(" "));
  const nWords = new Set(n.split(" "));
  const common = [...qWords].filter((word) => nWords.has(word)).length;
  return common === 0 ? 0 : common / (qWords.size + nWords.size - common);
}

export function rankFoodCandidates(query: string, foods: Array<NormalizedFood & { _id?: string }>): MealCandidate[] {
  return foods
    .map((food) => ({
      name: food.name,
      score: Math.round(candidateScore(query, food.name) * 100) / 100,
      source: "database" as const,
      caloriesPer100g: food.caloriesPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
      verified: food.verified,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function selectFoodCandidate(candidates: MealCandidate[]): MealCandidate | null {
  const [best, runnerUp] = [...candidates].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (!best || best.score < FOOD_QUALITY_THRESHOLD) return null;
  if (runnerUp && best.score - runnerUp.score < FOOD_RUNNER_UP_MARGIN) return null;
  return best;
}

function ingredientMacros(input: MealDraftIngredientInput, grams: number, flags: string[]): MacroValues {
  if (input.nutrition) {
    return {
      kcal: boundedNonNegative("ingredient.kcal", input.nutrition.kcal, INGREDIENT_KCAL_BORDERLINE, INGREDIENT_KCAL_REJECT_MAX, flags),
      protein: boundedNonNegative("ingredient.protein", input.nutrition.protein, INGREDIENT_MACRO_BORDERLINE.protein, INGREDIENT_MACRO_REJECT_MAX.protein, flags),
      carbs: boundedNonNegative("ingredient.carbs", input.nutrition.carbs, INGREDIENT_MACRO_BORDERLINE.carbs, INGREDIENT_MACRO_REJECT_MAX.carbs, flags),
      fat: boundedNonNegative("ingredient.fat", input.nutrition.fat, INGREDIENT_MACRO_BORDERLINE.fat, INGREDIENT_MACRO_REJECT_MAX.fat, flags),
    };
  }
  if (input.nutritionPer100g) {
    const result = computeNutrition({
      caloriesPer100g: boundedNonNegative("nutritionPer100g.kcal", input.nutritionPer100g.kcal, INGREDIENT_KCAL_BORDERLINE, INGREDIENT_KCAL_REJECT_MAX, flags),
      proteinPer100g: boundedNonNegative("nutritionPer100g.protein", input.nutritionPer100g.protein, INGREDIENT_MACRO_BORDERLINE.protein, INGREDIENT_MACRO_REJECT_MAX.protein, flags),
      carbsPer100g: boundedNonNegative("nutritionPer100g.carbs", input.nutritionPer100g.carbs, INGREDIENT_MACRO_BORDERLINE.carbs, INGREDIENT_MACRO_REJECT_MAX.carbs, flags),
      fatPer100g: boundedNonNegative("nutritionPer100g.fat", input.nutritionPer100g.fat, INGREDIENT_MACRO_BORDERLINE.fat, INGREDIENT_MACRO_REJECT_MAX.fat, flags),
    }, grams);
    return { kcal: result.calories_kcal, protein: result.protein_g, carbs: result.carbs_g, fat: result.fat_g };
  }
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

function sourceForDraft(ingredients: MealDraftIngredient[]): IngredientSource | "mixed" {
  const sources = [...new Set(ingredients.filter((item) => !item.unresolved).map((item) => item.source))];
  return sources.length === 1 ? sources[0]! : "mixed";
}

function averageConfidence(ingredients: MealDraftIngredient[]): number {
  if (ingredients.length === 0) return 0.1;
  const total = ingredients.reduce((sum, item) => sum + (item.unresolved ? 0 : item.confidence), 0);
  return Math.max(0.1, round1(total / ingredients.length));
}

/** Build the one canonical meal draft used by all meal sources. */
export function buildMealDraft(input: MealDraftInput): MealDraft {
  const validationFlags: string[] = [];
  const sourceMemory = input.memoryMatch && input.memoryMatch.entry.timesLogged >= 2 ? input.memoryMatch : undefined;
  const rawIngredients = input.ingredients ?? [];
  const ingredients = rawIngredients.map((raw): MealDraftIngredient => {
    const foodText = (raw.foodText ?? raw.name ?? "Ingredient").trim() || "Ingredient";
    const quantity = boundedNonNegative("ingredient.quantity", raw.quantity ?? raw.amount ?? (raw.grams != null ? raw.grams : 1), INGREDIENT_QUANTITY_BORDERLINE, INGREDIENT_QUANTITY_REJECT_MAX, validationFlags);
    const unit = (raw.unit ?? (raw.grams != null ? "g" : "serving")).trim() || "serving";
    const conversion = raw.grams != null
      ? { grams: boundedNonNegative("ingredient.grams", raw.grams, INGREDIENT_GRAMS_BORDERLINE, INGREDIENT_GRAMS_REJECT_MAX, validationFlags), confidence: 1, method: "exact" as const }
      : toGrams(quantity, unit, foodText);
    const candidates = [...(raw.candidates ?? [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const hasContribution = hasCompleteMacros(raw.nutrition) || hasCompleteMacros(raw.nutritionPer100g);
    const selected = raw.unresolved ? null : selectFoodCandidate(candidates);
    const selectedHasNutrition = !selected || (
      selected.caloriesPer100g != null
      && selected.proteinPer100g != null
      && selected.carbsPer100g != null
      && selected.fatPer100g != null
    ) || hasContribution;
    const unresolved = raw.unresolved === true || conversion.method === "unresolved" || (!hasContribution && (!selected || !selectedHasNutrition));
    const source = selected?.source === "memory" ? "memory" : normalizeSource(raw.source ?? selected?.source);
    const macros = unresolved
      ? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      : selected && selected.caloriesPer100g != null
        ? ingredientMacros({ nutritionPer100g: {
          kcal: selected.caloriesPer100g,
          protein: selected.proteinPer100g!,
          carbs: selected.carbsPer100g!,
          fat: selected.fatPer100g!,
        } }, conversion.grams, validationFlags)
        : ingredientMacros(raw, conversion.grams, validationFlags);
    const confidence = Math.max(0, Math.min(1, raw.confidence ?? Math.min(conversion.confidence, selected?.score ?? 1)));
    return {
      foodText,
      matchedFoodName: selected?.name ?? raw.matchedFoodName,
      quantity,
      unit,
      grams: Math.round(conversion.grams * 100) / 100,
      kcal: Math.round(macros.kcal),
      protein: round1(macros.protein),
      carbs: round1(macros.carbs),
      fat: round1(macros.fat),
      source,
      confidence,
      unresolved,
      candidates,
    };
  });

  const resolvedTotals = ingredients.reduce((total, item) => ({
    kcal: total.kcal + item.kcal,
    protein: total.protein + item.protein,
    carbs: total.carbs + item.carbs,
    fat: total.fat + item.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const completeRawTotals = input.rawTotals != null && hasCompleteMacros(input.rawTotals)
    ? input.rawTotals
    : undefined;
  const hasRawTotals = completeRawTotals != null;
  const totals = completeRawTotals ? {
    kcal: boundedNonNegative("meal.kcal", completeRawTotals.kcal, INGREDIENT_KCAL_BORDERLINE, INGREDIENT_KCAL_REJECT_MAX, validationFlags),
    protein: boundedNonNegative("meal.protein", completeRawTotals.protein, INGREDIENT_MACRO_BORDERLINE.protein, INGREDIENT_MACRO_REJECT_MAX.protein, validationFlags),
    carbs: boundedNonNegative("meal.carbs", completeRawTotals.carbs, INGREDIENT_MACRO_BORDERLINE.carbs, INGREDIENT_MACRO_REJECT_MAX.carbs, validationFlags),
    fat: boundedNonNegative("meal.fat", completeRawTotals.fat, INGREDIENT_MACRO_BORDERLINE.fat, INGREDIENT_MACRO_REJECT_MAX.fat, validationFlags),
  } : resolvedTotals;
  // Never accept a whole-meal estimate as a substitute for ingredient math.
  // Unresolved ingredients therefore contribute zero by construction.
  const reportedCalories = input.reportedCalories == null ? undefined : Math.round(nonNegative(input.reportedCalories));
  const unresolved = ingredients.filter((item) => item.unresolved).map((item) => item.foodText);
  const hasUsableIngredients = rawIngredients.length > 0;
  const hasExplicitNutrition = reportedCalories != null || hasRawTotals;
  const nutritionUnavailable = !hasUsableIngredients && !hasExplicitNutrition;
  if (nutritionUnavailable) unresolved.push("meal nutrition");
  if (input.rawTotals != null && !hasRawTotals) unresolved.push("meal nutrition");
  const hasResolvedNutrition = hasRawTotals || (rawIngredients.length > 0 && unresolved.length === 0) || reportedCalories != null;
  const estimatedCalories = hasResolvedNutrition ? Math.round(totals.kcal) : undefined;
  const calorieSource: CalorieSource | undefined = input.calorieSource === "reported" && reportedCalories != null
    ? "reported"
    : input.calorieSource === "estimated" && estimatedCalories != null
      ? "estimated"
      : reportedCalories != null
        ? "reported"
        : estimatedCalories != null
          ? "estimated"
          : undefined;
  const draft: MealDraft = {
    kind: "meal",
    name: input.name,
    date: input.date,
    time: input.time,
    mealType: input.mealType ?? "unspecified",
    ingredients,
    items: ingredients,
    calories: calorieSource === "reported" && reportedCalories != null ? reportedCalories : Math.round(totals.kcal),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat),
    calories_kcal: calorieSource === "reported" && reportedCalories != null ? reportedCalories : Math.round(totals.kcal),
    protein_g: round1(totals.protein),
    carbs_g: round1(totals.carbs),
    fat_g: round1(totals.fat),
    estimatedCalories,
    reportedCalories,
    calorieSource,
    unresolved,
    confidence: validationFlags.length ? Math.min(0.35, averageConfidence(ingredients)) : averageConfidence(ingredients),
    nutritionSource: input.nutritionSource ?? (nutritionUnavailable ? "parse_error" : sourceForDraft(ingredients)),
    foodMemoryId: input.foodMemoryId ?? sourceMemory?.entry._id,
    detailInvalidated: input.detailInvalidated,
    rawTotals: input.rawTotals,
    validationFlags,
  };
  return draft;
}

export function mealPayloadFromDraft(draft: MealDraft, extras: Record<string, unknown> = {}) {
  const totals = draft.rawTotals;
  return {
    ...extras,
    name: draft.name,
    date: draft.date,
    calories: totals ? totals.kcal : draft.calories,
    protein: totals ? totals.protein : draft.protein,
    carbs: totals ? totals.carbs : draft.carbs,
    fat: totals ? totals.fat : draft.fat,
    time: draft.time,
    mealType: draft.mealType,
    confidence: draft.confidence,
    nutritionSource: draft.nutritionSource,
    reportedCalories: draft.reportedCalories,
    estimatedCalories: draft.estimatedCalories,
    calorieSource: draft.calorieSource,
    foodMemoryId: draft.foodMemoryId,
    structuredItems: JSON.stringify(draft.ingredients),
    ingredientBreakdown: JSON.stringify(draft),
    ingredientBreakdownInvalidated: draft.detailInvalidated,
    draft,
  };
}

export function buildDirectMealDraft(args: {
  name: string;
  date: string;
  time: string;
  mealType?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutritionSource?: string;
  reportedCalories?: number;
  estimatedCalories?: number;
  calorieSource?: CalorieSource;
  ingredientBreakdown?: string;
  foodMemoryId?: string;
  memoryMatch?: MatchResult;
}): MealDraft {
  let fromDetail: MealDraftIngredientInput[] | undefined;
  if (args.ingredientBreakdown) {
    try {
      const detail = JSON.parse(args.ingredientBreakdown) as { ingredients?: MealDraftIngredient[]; items?: MealDraftIngredient[] };
      const items = detail.ingredients ?? detail.items;
      if (Array.isArray(items) && items.length > 0) {
        fromDetail = items.map((item) => ({
          foodText: item.foodText ?? (item as any).food_text ?? "Ingredient",
          quantity: item.quantity ?? item.grams,
          unit: item.unit ?? "g",
          grams: item.grams,
          nutrition: { kcal: item.kcal ?? (item as any).calories_kcal ?? 0, protein: item.protein ?? (item as any).protein_g ?? 0, carbs: item.carbs ?? (item as any).carbs_g ?? 0, fat: item.fat ?? (item as any).fat_g ?? 0 },
          source: item.source,
          confidence: item.confidence,
          candidates: item.candidates,
          unresolved: item.unresolved,
          matchedFoodName: item.matchedFoodName ?? (item as any).matched_food_name,
        }));
      }
    } catch {
      // Fall through to the single direct-entry ingredient.
    }
  }
  const databaseSource = args.nutritionSource && args.nutritionSource !== "manual" && args.nutritionSource !== "user_reported";
  return buildMealDraft({
    name: args.name,
    date: args.date,
    time: args.time,
    mealType: args.mealType,
    ingredients: fromDetail ?? [{
      foodText: args.name,
      quantity: 1,
      unit: "serving",
      nutrition: { kcal: args.calories, protein: args.protein, carbs: args.carbs, fat: args.fat },
      source: databaseSource ? "database" : "user_reported",
      confidence: args.nutritionSource ? undefined : 1,
    }],
    reportedCalories: args.reportedCalories ?? (!databaseSource ? args.calories : undefined),
    estimatedCalories: args.estimatedCalories,
    calorieSource: args.calorieSource,
    foodMemoryId: args.foodMemoryId,
    memoryMatch: args.memoryMatch,
  });
}

type ParsedMeal = {
  name?: string;
  description?: string;
  date?: string;
  time?: string;
  mealType?: string;
  ingredients?: Array<{ food_text?: string; amount?: number; unit?: string; confidence?: number; is_oil_or_fat?: boolean }>;
  reportedCalories?: number;
  foodMemoryId?: string;
  parseError?: string;
};

/** Resolve database candidates, apply food memory, then use the pure builder. */
export async function buildMealDraftFromParsed(
  ctx: any,
  parsedMeal: ParsedMeal,
  options: { userId?: string; source?: string; useMemory?: boolean } = {},
): Promise<MealDraft> {
  const userId = options.userId ?? (await ctx.auth.getUserIdentity())?.subject;
  const memories = userId
    ? await ctx.runQuery(internal.food_memory.getForUser, { userId }) as FoodMemoryEntry[]
    : [];
  const description = parsedMeal.description ?? parsedMeal.name ?? "meal";
  const memoryMatch = options.useMemory === false ? undefined : findBestMatch(description, memories);
  const memory = memoryMatch && memoryMatch.entry.timesLogged >= 2 ? memoryMatch : undefined;
  const date = parsedMeal.date ?? new Date().toISOString().split("T")[0];
  const time = parsedMeal.time ?? new Date().toTimeString().slice(0, 5);

  if (memory) {
    const entry = memory.entry;
    return buildMealDraft({
      name: entry.displayName,
      date,
      time,
      mealType: parsedMeal.mealType,
      ingredients: [{
        foodText: entry.displayName,
        quantity: 1,
        unit: "serving",
        nutrition: { kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat },
        source: "memory",
        confidence: Math.min(0.95, 0.7 + memory.score * 0.25),
        matchedFoodName: entry.displayName,
      }],
      foodMemoryId: entry._id,
      memoryMatch: memory,
    });
  }

  const ingredients: MealDraftIngredientInput[] = [];
  for (const ingredient of parsedMeal.ingredients ?? []) {
    const foodText = ingredient.food_text?.trim() ?? "";
    const amount = nonNegative(ingredient.amount ?? 0);
    if (!foodText || amount <= 0) continue;
    const cached = await ctx.runQuery(internal.foods.searchFoodsInCache, { query: foodText }) as Array<NormalizedFood & { _id?: string }>;
    const live = cached.length === 0 && typeof ctx.runAction === "function"
      ? await ctx.runAction(internal.foods.searchFoodsLive, { query: foodText, limit: 8 }).catch(() => []) as Array<NormalizedFood & { _id?: string }>
      : [];
    const candidates = rankFoodCandidates(foodText, [...cached, ...live]);
    ingredients.push({
      foodText,
      quantity: amount,
      unit: ingredient.unit ?? "g",
      candidates,
      source: options.source ?? "ai_estimate",
      confidence: ingredient.confidence,
    });
  }

  return buildMealDraft({
    name: parsedMeal.name ?? description.slice(0, 50),
    date,
    time,
    mealType: parsedMeal.mealType,
    ingredients,
    reportedCalories: parsedMeal.reportedCalories,
    foodMemoryId: parsedMeal.foodMemoryId,
  });
}

/**
 * Nutrition Engine
 * Deterministic nutrition calculation from structured meal data.
 * Leverages the existing USDA/OFF integration in foods.ts.
 *
 * This file exports pure helper functions used by Convex actions.
 */

export interface NormalizedFood {
  name: string;
  brand?: string;
  barcode?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: number;
  servingUnit?: string;
  ingredients?: string;
  imageUrl?: string;
  source: string;
  verified?: boolean;
  fdcId?: string;
}

export interface IngredientInput {
  food_text: string; // "paneer", "olive oil"
  amount: number; // 150
  unit: string; // "g", "tbsp", "piece"
  is_oil_or_fat: boolean;
  confidence: number;
}

export interface ItemBreakdown {
  food_text: string;
  matched_food_name: string;
  grams: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  verified?: boolean;
  confidence: number;
}

export interface NutritionResult {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  items: ItemBreakdown[];
  unresolved: string[];
}

/**
 * Search cache results type — matches what searchFoodsInCache returns.
 */
interface CachedFoodDoc {
  _id?: string;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: string;
  verified?: boolean;
}

/**
 * Compute nutrition for a given food and amount in grams.
 */
export function computeNutrition(
  food: { caloriesPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number },
  grams: number,
): { calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number } {
  const ratio = grams / 100;
  return {
    calories_kcal: Math.round(food.caloriesPer100g * ratio),
    protein_g: Math.round(food.proteinPer100g * ratio * 10) / 10,
    carbs_g: Math.round(food.carbsPer100g * ratio * 10) / 10,
    fat_g: Math.round(food.fatPer100g * ratio * 10) / 10,
  };
}

/**
 * Match a food text to the best cached food result.
 * Uses simple scoring: exact name match > starts-with > contains.
 */
export function matchBestFood(
  foodText: string,
  cachedFoods: CachedFoodDoc[],
): CachedFoodDoc | null {
  if (cachedFoods.length === 0) return null;

  const q = foodText.toLowerCase().trim();

  let best: CachedFoodDoc | null = null;
  let bestScore = -1;

  for (const food of cachedFoods) {
    const name = food.name.toLowerCase();
    let score = 0;

    if (name === q) score = 100;
    else if (name.includes(q) || q.includes(name)) score = 60;
    else {
      // Word-level matching
      const foodWords = name.split(/\s+/);
      const queryWords = q.split(/\s+/);
      const common = queryWords.filter((w) => foodWords.some((fw) => fw.includes(w)));
      score = common.length * 20;
    }

    // Bonus for verified
    if (food.verified) score += 10;

    // Bonus for USDA
    if (food.source === "usda") score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = food;
    }
  }

  // Only match if score is reasonable
  return bestScore >= 30 ? best : null;
}

/**
 * Calculate cooking oil adjustment based on cooking method.
 * Returns additional calories/fat grams from oil.
 */
export function cookingMethodAdjustment(
  cookingMethod: string,
): { oil_calories: number; oil_fat_g: number } {
  const method = (cookingMethod || "").toLowerCase().trim();

  // No adjustment for these methods
  if (["raw", "boiled", "steamed", "grilled", "baked", "roasted"].some((m) => method.includes(m))) {
    return { oil_calories: 0, oil_fat_g: 0 };
  }

  // Fried / deep fried — heavy oil
  if (method.includes("fried") || method.includes("deep") || method.includes("tawa")) {
    const oilGrams = 15; // ~1 tbsp per serving
    return { oil_calories: Math.round(oilGrams * 8.84), oil_fat_g: oilGrams };
  }

  // Sautéed / stir-fried — moderate oil
  if (method.includes("sauté") || method.includes("saute") || method.includes("stir")) {
    const oilGrams = 7; // ~0.5 tbsp
    return { oil_calories: Math.round(oilGrams * 8.84), oil_fat_g: oilGrams };
  }

  // Curry / gravy — some oil
  if (method.includes("curry") || method.includes("gravy") || method.includes("masala")) {
    const oilGrams = 8;
    return { oil_calories: Math.round(oilGrams * 8.84), oil_fat_g: oilGrams };
  }

  // Tadka / tempering — oil
  if (method.includes("tadka") || method.includes("temper") || method.includes("baghar")) {
    const oilGrams = 5;
    return { oil_calories: Math.round(oilGrams * 8.84), oil_fat_g: oilGrams };
  }

  // Default for unknown methods — assume some oil
  return { oil_calories: 45, oil_fat_g: 5 };
}

/**
 * Build a deterministic nutrition result from matched ingredients.
 */
export function buildNutritionResult(
  items: ItemBreakdown[],
  unresolved: string[],
): NutritionResult {
  const total = items.reduce(
    (acc, item) => ({
      calories_kcal: acc.calories_kcal + item.calories_kcal,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  // Round totals
  total.calories_kcal = Math.round(total.calories_kcal);
  total.protein_g = Math.round(total.protein_g * 10) / 10;
  total.carbs_g = Math.round(total.carbs_g * 10) / 10;
  total.fat_g = Math.round(total.fat_g * 10) / 10;

  // Confidence: average of item confidences, weighted by matched vs unresolved
  const matchedCount = items.length;
  const totalCount = matchedCount + unresolved.length;
  const itemConfidence =
    matchedCount > 0
      ? items.reduce((sum, i) => sum + i.confidence, 0) / matchedCount
      : 0;
  const matchRatio = totalCount > 0 ? matchedCount / totalCount : 0;
  const confidence = Math.round((itemConfidence * matchRatio) * 100) / 100;

  return {
    ...total,
    confidence: Math.max(0.1, confidence),
    items,
    unresolved,
  };
}

/**
 * Scale nutrition result by portion factor.
 * e.g., if user ate 0.75 of the recipe.
 */
export function scaleResult(
  result: NutritionResult,
  portionFactor: number,
): NutritionResult {
  return {
    ...result,
    calories_kcal: Math.round(result.calories_kcal * portionFactor),
    protein_g: Math.round(result.protein_g * portionFactor * 10) / 10,
    carbs_g: Math.round(result.carbs_g * portionFactor * 10) / 10,
    fat_g: Math.round(result.fat_g * portionFactor * 10) / 10,
    items: result.items.map((item) => ({
      ...item,
      grams: Math.round(item.grams * portionFactor),
      calories_kcal: Math.round(item.calories_kcal * portionFactor),
      protein_g: Math.round(item.protein_g * portionFactor * 10) / 10,
      carbs_g: Math.round(item.carbs_g * portionFactor * 10) / 10,
      fat_g: Math.round(item.fat_g * portionFactor * 10) / 10,
    })),
  };
}

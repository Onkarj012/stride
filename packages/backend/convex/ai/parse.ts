/**
 * ai/parse.ts — meal/workout NL parsing + deterministic nutrition engine glue.
 *
 * Extracted from ai.ts. These are LLM + engine orchestrators called by the
 * public actions in ai.ts (parseMeal, logMeal, chat, homepageInput, etc.).
 */

import { internal } from "../_generated/api";
import { callAI, parseJSON } from "./llm";
import {
  calculateWorkoutCalories,
  parseDurationMinutes,
} from "../calorie_engine";
import {
  matchExercises,
  getWeightedMET,
} from "../exercise_db";
import {
  mapAIIntensity,
  inferDensity,
  countCompoundRatio,
} from "../workout_scorer";
import { toGrams } from "../unit_converter";
import {
  matchBestFood,
  computeNutrition,
  cookingMethodAdjustment,
  buildNutritionResult,
  scaleResult,
  type ItemBreakdown,
  type NutritionResult,
} from "../nutrition_engine";

export const NUTRITION_ACCURACY_RULES = `Nutrition accuracy rules:
- Extract portions before calories. Prefer explicit grams/ml/servings over generic meal-size guesses.
- If the user gives "bowl", "plate", "serving", "handful", "scoop", or "piece", convert to a realistic edible gram estimate and set confidence <= 0.65 unless the size is specified.
- Distinguish cooked vs dry weights. Cooked rice/pasta/oats are much lower kcal per 100g than dry.
- Include calorie-dense additions: oil, ghee, butter, cream, cheese, nuts, nut butter, avocado, sauces, dressings, sugar, honey.
- For Indian foods, include tadka/cooking oil unless explicitly oil-free; estimate conservatively but do not ignore it.
- Do not use restaurant/large portions unless the user says restaurant, takeaway, large, extra, or similar.
- Macro calories should be plausible: calories should roughly match protein*4 + carbs*4 + fat*9 within 25%.
- If key portion details are missing, put the missing fields in missing_fields and use a middle-of-range estimate, not an extreme low/high.`;

export interface UserPhysique {
  weight?: number; // kg
  height?: number; // cm
  age?: number;
  sex?: string;
  fitnessLevel?: string;
  metabolicFactor?: number;
}

export interface ParsedWorkoutResult {
  name: string;
  sets: string;
  duration: string;
  intensity: string;
  caloriesBurned: number;
  rationale: string;
  exercises: Array<{ name: string; sets: Array<{ weight: string; reps: string }> }> | null;
  description: string;
  // Calorie engine results
  calorieResult?: {
    total_kcal: number;
    confidence: number;
    range_low: number;
    range_high: number;
    breakdown: Record<string, number>;
  } | null;
}

export async function parseMealDescription(
  description: string,
  mealType: string,
  time: string,
  model?: string,
  apiKey?: string,
  userIngredients?: Array<{ name: string; caloriesPer100g?: number; proteinPer100g?: number; carbsPer100g?: number; fatPer100g?: number; notes?: string }>,
) {
  const ingredientContext = userIngredients && userIngredients.length > 0
    ? `\nUSER'S PERSONAL INGREDIENT DATABASE (use these values instead of generic database values when the ingredient name matches):\n` +
      userIngredients.map((i) => {
        const macros = [
          i.caloriesPer100g != null ? `${i.caloriesPer100g} kcal/100g` : null,
          i.proteinPer100g != null ? `${i.proteinPer100g}g protein/100g` : null,
          i.fatPer100g != null ? `${i.fatPer100g}g fat/100g` : null,
          i.carbsPer100g != null ? `${i.carbsPer100g}g carbs/100g` : null,
        ].filter(Boolean).join(", ");
        return `- ${i.name}: ${macros || "custom"}${i.notes ? ` (${i.notes})` : ""}`;
      }).join("\n")
    : "";

  const prompt = `You are a professional nutritionist. Extract structured ingredients from this meal description AND estimate total macros.

Meal type: ${mealType || "unspecified"}
User's description:
"""
${description}
"""
${ingredientContext}

${NUTRITION_ACCURACY_RULES}

Instructions:
1. Identify EVERY ingredient, condiment, and cooking addition (oils, butter, ghee, sauces, etc.).
2. For each ingredient, extract: food_text (the ingredient name), amount (number), unit ("g", "ml", "tbsp", "cup", "piece", etc.), and flag is_oil_or_fat (true for oils, butter, ghee, etc.).
3. Deduce the cooking_method from description: "raw", "boiled", "steamed", "grilled", "baked", "roasted", "fried", "sautéed", "stir-fried", "curry", "tadka", or "unknown".
4. Estimate portion_scale (0.0-1.0) — what fraction of the total recipe did the user eat? Default 1.0.
5. Estimate total_recipe_servings if mentioned.
6. In "components", list the key ingredients detected (e.g. "paneer, rice, ghee"). Be specific.
7. In "suggestion", give ONE forward-looking sentence about what the user should focus on in their NEXT meal (not criticism of this meal).
8. ALSO estimate total calories, protein (g), carbs (g), and fat (g) for the user's consumed portion. These serve as fallback values when the food database doesn't have complete data for every ingredient.
9. If the portion is ambiguous, choose a realistic middle estimate and add the ambiguity to missing_fields (for example "rice_amount", "oil_amount", "serving_size").

Return ONLY a JSON object (no other text, no markdown):
{"name":"short descriptive name (max 4 words)","calories":450,"protein":35,"carbs":40,"fat":18,"components":"comma-separated ingredient list","suggestion":"one forward-looking next-meal tip (max 20 words)","ingredients":[{"food_text":"paneer","amount":150,"unit":"g","is_oil_or_fat":false,"confidence":0.9}],"cooking_method":"fried","portion_scale":1.0,"total_recipe_servings":2,"missing_fields":["oil_amount"]}`;

  const content = await callAI([{ role: "user", content: prompt }], 1000, model, apiKey);
  const result = parseJSON<any>(content, {
    name: description.slice(0, 50),
    calories: 400,
    protein: 20,
    carbs: 35,
    fat: 15,
    components: "",
    suggestion: "",
    ingredients: [],
    cooking_method: "unknown",
    portion_scale: 1.0,
    total_recipe_servings: 1,
    missing_fields: [],
  });
  const mealTime = time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return {
    name: result.name || description.slice(0, 50),
    calories: result.calories || 400,
    protein: result.protein || 20,
    carbs: result.carbs || 35,
    fat: result.fat || 15,
    time: mealTime,
    aiSuggestion: result.suggestion || undefined,
    components: result.components || undefined,
    mealType: mealType || "unspecified",
    description,
    // Structured data for deterministic nutrition engine
    ingredients: Array.isArray(result.ingredients) ? result.ingredients : [],
    cooking_method: result.cooking_method || "unknown",
    portion_scale: typeof result.portion_scale === "number" ? result.portion_scale : 1.0,
    total_recipe_servings: typeof result.total_recipe_servings === "number" ? result.total_recipe_servings : 1,
    missing_fields: Array.isArray(result.missing_fields) ? result.missing_fields : [],
  };
}

export async function parseWorkoutDescription(description: string, duration?: string, intensity?: string, model?: string, apiKey?: string, userPhysique?: UserPhysique): Promise<ParsedWorkoutResult> {
  const physiqueInfo = userPhysique?.weight
    ? `\nUser physique: ${userPhysique.weight}kg${userPhysique.height ? `, ${userPhysique.height}cm` : ""}${userPhysique.age ? `, ${userPhysique.age}yo` : ""}${userPhysique.sex ? `, ${userPhysique.sex}` : ""}${userPhysique.fitnessLevel ? `, fitness: ${userPhysique.fitnessLevel}` : ""}`
    : "";

  const prompt = `You are a professional fitness trainer. Parse this workout log precisely.

User's workout:
"""
${description}
"""

User-provided duration: ${duration || "not specified"}
User-provided intensity: ${intensity || "not specified"}${physiqueInfo}

Rules:
1. Extract EVERY exercise. Each exercise gets its own entry in "exercises".
2. For each exercise, create one entry in "sets" per set with exact weight and reps.
3. Include "muscle_group": primary muscle targeted (e.g. "chest", "triceps", "back", "legs", "shoulders", "cardio", "core").
4. Include "weight_unit": "kg" | "lbs" | "bodyweight" | "machine_kg" | "machine_lbs".
5. For cardio, use a single set with "distance_km", "duration_min", "incline", "pace", "calories_per_hr" fields instead of weight/reps.
6. Estimate total session duration if not provided. Determine intensity from volume/load.
7. If the user explicitly states calories burned (e.g. "75 kcal burned", "75cal burned"), set caloriesBurned to that value. Otherwise set caloriesBurned to 0 — do NOT estimate.
8. Use the exact exercise names the user typed.
9. Session name: max 3 words.
10. Look for rest pattern clues.

Return ONLY valid JSON:
{"name":"session name","exercises":[{"name":"exercise name","muscle_group":"chest","weight_unit":"kg","sets":[{"weight":"12.5","reps":"15"}]},{"name":"cardio name","muscle_group":"cardio","weight_unit":"bodyweight","sets":[{"distance_km":"0.75","duration_min":"10","incline":"11","pace":"13.2","calories_per_hr":"425"}]}],"duration":"estimated total duration","intensity":"LOW|MEDIUM|HIGH|MAX","caloriesBurned":0,"rationale":"one coaching tip (max 15 words)","restClues":"any rest pattern info"}`;

  const content = await callAI([{ role: "user", content: prompt }], 1200, model, apiKey);
  const result = parseJSON<any>(content, { name: description.slice(0, 30), exercises: [], duration: duration || "30 min", intensity: intensity || "HIGH", caloriesBurned: 0, rationale: "", restClues: "" });

  const exercises = (result.exercises || []).map((ex: any) => ({
    name: ex.name || "Exercise",
    muscle_group: ex.muscle_group || "",
    weight_unit: ex.weight_unit || "kg",
    sets: Array.isArray(ex.sets) ? ex.sets.map((s: any) => ({
      weight: String(s.weight || ""),
      reps: String(s.reps || ""),
      // cardio fields
      distance_km: s.distance_km != null ? String(s.distance_km) : undefined,
      duration_min: s.duration_min != null ? String(s.duration_min) : undefined,
      incline: s.incline != null ? String(s.incline) : undefined,
      pace: s.pace != null ? String(s.pace) : undefined,
      calories_per_hr: s.calories_per_hr != null ? String(s.calories_per_hr) : undefined,
    })) : [],
  }));
  const totalSets = exercises.reduce((sum: number, ex: any) => sum + ex.sets.length, 0);
  const setsVal = exercises.length > 0 ? `${exercises.length} exercise${exercises.length !== 1 ? "s" : ""} · ${totalSets} sets` : "–";

  // Deterministic calorie calculation
  let calorieResult: ParsedWorkoutResult["calorieResult"] = null;
  if (userPhysique?.weight && exercises.length > 0) {
    try {
      const durationMin = parseDurationMinutes(result.duration || duration || "30 min");
      const engineIntensity = mapAIIntensity(result.intensity || intensity || "HIGH");
      const engineDensity = inferDensity(exercises, durationMin);
      const exerciseMetas = matchExercises(exercises);
      const compoundRatio = countCompoundRatio(exerciseMetas);
      const weightedMet = getWeightedMET(exercises);

      const calcResult = calculateWorkoutCalories(
        {
          duration_min: durationMin,
          intensity: engineIntensity,
          density: engineDensity,
          compound_ratio: compoundRatio,
          exercises,
          weighted_met: weightedMet,
        },
        {
          weight_kg: userPhysique?.weight ?? 70,
          age: userPhysique?.age ?? 30,
          sex: (userPhysique?.sex === "female" ? "female" : "male"),
          fitness_level: ((userPhysique?.fitnessLevel ?? "beginner") as "beginner" | "intermediate" | "advanced"),
          metabolic_factor: userPhysique?.metabolicFactor ?? 1.0,
        },
      );

      calorieResult = {
        total_kcal: calcResult.total_kcal,
        confidence: calcResult.confidence,
        range_low: calcResult.range_low,
        range_high: calcResult.range_high,
        breakdown: calcResult.breakdown as unknown as Record<string, number>,
      };
    } catch {
      // Fall back to AI estimate if engine fails
    }
  }

  return {
    name: result.name || description.slice(0, 30),
    sets: setsVal,
    duration: result.duration || duration || "30 min",
    intensity: result.intensity || intensity || "HIGH",
    caloriesBurned: calorieResult?.total_kcal ?? result.caloriesBurned ?? 0,
    rationale: result.rationale || "",
    exercises: exercises.length > 0 ? exercises : null,
    description,
    calorieResult,
  };
}

// ─── Deterministic Nutrition Engine ───────────────────────────────────────────

export async function runNutritionEngine(
  ctx: any,
  parsedMeal: any,
): Promise<{
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  nutritionSource: string;
  ingredientBreakdown: NutritionResult | null;
}> {
  let nutritionResult: NutritionResult | null = null;
  const breakdownItems: ItemBreakdown[] = [];
  const unresolved: string[] = [];
  const ingredients = parsedMeal.ingredients || [];

  if (ingredients.length > 0) {
    try {
      for (const ingredient of ingredients) {
        const foodText: string = ingredient.food_text || "";
        const amount: number = ingredient.amount || 0;
        const unit: string = ingredient.unit || "g";

        if (!foodText || amount <= 0) continue;

        const conversion = toGrams(amount, unit, foodText);
        const grams = conversion.grams;

        const cachedResults: any[] = await ctx.runQuery(internal.foods.searchFoodsInCache, { query: foodText });
        const bestMatch = matchBestFood(foodText, cachedResults);

        if (bestMatch) {
          const nutrition = computeNutrition(bestMatch, grams);
          breakdownItems.push({
            food_text: foodText,
            matched_food_name: bestMatch.name,
            grams,
            calories_kcal: nutrition.calories_kcal,
            protein_g: nutrition.protein_g,
            carbs_g: nutrition.carbs_g,
            fat_g: nutrition.fat_g,
            source: bestMatch.source || "cache",
            confidence: conversion.confidence,
          });
          ctx.runMutation(internal.foods.bumpSearchCount, { id: bestMatch._id }).catch(() => {});
        } else if (ingredient.is_oil_or_fat) {
          const oilCals = Math.round(grams * 8.84);
          breakdownItems.push({
            food_text: foodText,
            matched_food_name: foodText,
            grams,
            calories_kcal: oilCals,
            protein_g: 0,
            carbs_g: 0,
            fat_g: grams,
            source: "standard",
            confidence: 0.85,
          });
        } else {
          unresolved.push(foodText);
        }
      }

      const hasOil = ingredients.some((i: any) => i.is_oil_or_fat);
      if (!hasOil && breakdownItems.length > 0) {
        const oilAdjustment = cookingMethodAdjustment(parsedMeal.cooking_method || "unknown");
        if (oilAdjustment.oil_calories > 0) {
          const method = parsedMeal.cooking_method || "unknown";
          breakdownItems.push({
            food_text: `cooking oil (${method})`,
            matched_food_name: `cooking oil (${method})`,
            grams: 0,
            calories_kcal: oilAdjustment.oil_calories,
            protein_g: 0,
            carbs_g: 0,
            fat_g: oilAdjustment.oil_fat_g,
            source: "estimated",
            confidence: 0.5,
          });
        }
      }

      nutritionResult = buildNutritionResult(breakdownItems, unresolved);

      if (parsedMeal.portion_scale < 1.0) {
        nutritionResult = scaleResult(nutritionResult, parsedMeal.portion_scale);
      }
    } catch {
      // Fall back to AI-estimated values on error
    }
  }

  // Blend engine result with AI fallback when the engine result is incomplete
  const hasUnresolved = unresolved.length > 0;
  const aiCals = parsedMeal.calories || 400;
  const aiProtein = parsedMeal.protein || 20;
  const aiCarbs = parsedMeal.carbs || 35;
  const aiFat = parsedMeal.fat || 15;

  let finalCalories: number;
  let finalProtein: number;
  let finalCarbs: number;
  let finalFat: number;
  let finalConfidence: number;
  let finalSource: string;

  if (nutritionResult && nutritionResult.items.length > 0) {
    const engine = nutritionResult;

    if (!hasUnresolved) {
      // All ingredients resolved → pure deterministic result
      finalCalories = engine.calories_kcal;
      finalProtein = engine.protein_g;
      finalCarbs = engine.carbs_g;
      finalFat = engine.fat_g;
      finalConfidence = engine.confidence;
      finalSource = "database";
    } else {
      // Some ingredients unresolved → blend cautiously. The database total is
      // trustworthy for matched ingredients; the AI fallback is only a guardrail
      // for missing pieces, not an automatic override to a larger whole-meal guess.
      const unresolvedShare = Math.min(0.45, Math.max(0.15, unresolved.length / Math.max(ingredients.length, 1)));
      const aiMissingCalories = Math.max(0, aiCals - engine.calories_kcal) * unresolvedShare;
      const aiMissingProtein = Math.max(0, aiProtein - engine.protein_g) * unresolvedShare;
      const aiMissingCarbs = Math.max(0, aiCarbs - engine.carbs_g) * unresolvedShare;
      const aiMissingFat = Math.max(0, aiFat - engine.fat_g) * unresolvedShare;
      finalCalories = engine.calories_kcal > 0 ? engine.calories_kcal + aiMissingCalories : aiCals;
      finalProtein = engine.protein_g + aiMissingProtein;
      finalCarbs = engine.carbs_g + aiMissingCarbs;
      finalFat = engine.fat_g + aiMissingFat;
      finalConfidence = Math.max(0.3, engine.confidence * 0.7);
      finalSource = "mixed";
    }
  } else {
    // Nothing resolved → pure AI fallback
    finalCalories = aiCals;
    finalProtein = aiProtein;
    finalCarbs = aiCarbs;
    finalFat = aiFat;
    finalConfidence = 0.3;
    finalSource = "ai";
  }

  return {
    calories: Math.round(finalCalories),
    protein: Math.round(finalProtein * 10) / 10,
    carbs: Math.round(finalCarbs * 10) / 10,
    fat: Math.round(finalFat * 10) / 10,
    confidence: finalConfidence,
    nutritionSource: finalSource,
    ingredientBreakdown: nutritionResult,
  };
}

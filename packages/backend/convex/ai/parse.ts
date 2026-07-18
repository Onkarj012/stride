/**
 * ai/parse.ts — meal/workout NL parsing + deterministic nutrition engine glue.
 *
 * Extracted from ai.ts. These are LLM + engine orchestrators called by the
 * public actions in ai.ts (parseMeal, logMeal, chat, homepageInput, etc.).
 */

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { callAI, tryParseJSON } from "./llm";
import { AI_INPUT_LIMITS, assertMaxChars, assertIngredients } from "../ai_guard";
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
  caloriesBurned?: number;
  rationale: string;
  exercises: Array<{ name: string; sets: Array<{ weight: string; reps: string }> }> | null;
  description: string;
  // Calorie engine results
  calorieResult?: {
    total_kcal: number;
    confidence: number;
    range_low: number;
    range_high: number;
    rough: boolean;
    breakdown: Record<string, number>;
  } | null;
  parseError?: string;
}

export function extractStatedWorkoutCalories(description: string): number | null {
  const match = description.match(/(\d+(?:\.\d+)?)\s*(?:kcal|cal(?:ories?)?)(?:\s*burned)?/i);
  return match ? Math.round(parseFloat(match[1])) : null;
}

function adjustedCalorieResult(
  calcResult: ReturnType<typeof calculateWorkoutCalories>,
  hasKnownWeight: boolean,
  roughDuration: boolean,
): NonNullable<ParsedWorkoutResult["calorieResult"]> {
  const confidence = Math.max(
    0.1,
    Math.round((calcResult.confidence - (hasKnownWeight ? 0 : 0.25) - (roughDuration ? 0.2 : 0)) * 100) / 100,
  );
  const rangeWidth = Math.round(calcResult.total_kcal * (1 - confidence) * 0.25);

  return {
    total_kcal: calcResult.total_kcal,
    confidence,
    range_low: Math.max(0, calcResult.total_kcal - rangeWidth),
    range_high: calcResult.total_kcal + rangeWidth,
    rough: roughDuration,
    breakdown: calcResult.breakdown as unknown as Record<string, number>,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedTimeOrNow(time: string): string {
  const trimmed = time.trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
  const loose = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (loose) {
    const hours = Number(loose[1]);
    const minutes = Number(loose[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return new Date().toTimeString().slice(0, 5);
}

function providerSourceFromItems(items: ItemBreakdown[]): string {
  const sources = [...new Set(items.map((item) => item.source).filter(Boolean))];
  if (sources.length === 1) return sources[0]!;
  if (sources.length > 1) return "database";
  return "database";
}

export async function parseMealDescription(
  description: string,
  mealType: string,
  time: string,
  ctx: ActionCtx,
  userId: string,
  model?: string,
  apiKey?: string,
  userIngredients?: Array<{ name: string; caloriesPer100g?: number; proteinPer100g?: number; carbsPer100g?: number; fatPer100g?: number; notes?: string }>,
) {
  assertMaxChars(description, AI_INPUT_LIMITS.textChars, "meal description");
  assertMaxChars(mealType, AI_INPUT_LIMITS.textChars, "meal type");
  assertMaxChars(time, AI_INPUT_LIMITS.textChars, "meal time");
  assertIngredients(userIngredients, "user ingredients");
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
8. ALSO estimate total calories, protein (g), carbs (g), and fat (g) for the user's consumed portion. These are AI-estimated values used only when the food database cannot resolve every ingredient.
9. If the portion is ambiguous, choose a realistic middle estimate and add the ambiguity to missing_fields (for example "rice_amount", "oil_amount", "serving_size").

Return ONLY a JSON object (no other text, no markdown):
{"name":"short descriptive name (max 4 words)","calories":450,"protein":35,"carbs":40,"fat":18,"components":"comma-separated ingredient list","suggestion":"one forward-looking next-meal tip (max 20 words)","ingredients":[{"food_text":"paneer","amount":150,"unit":"g","is_oil_or_fat":false,"confidence":0.9}],"cooking_method":"fried","portion_scale":1.0,"total_recipe_servings":2,"missing_fields":["oil_amount"]}`;

  const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 1000, model, apiKey);
  const mealTime = normalizedTimeOrNow(time);
  const result = tryParseJSON<any>(content);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      name: description.slice(0, 50) || "Unparsed meal",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      time: mealTime,
      aiSuggestion: "Couldn't parse reliably — confirm or edit portions.",
      components: undefined,
      mealType: mealType || "unspecified",
      description,
      ingredients: [],
      cooking_method: "unknown",
      portion_scale: 1.0,
      total_recipe_servings: 1,
      missing_fields: ["parse_error"],
      parseError: "Couldn't parse reliably — confirm or edit portions.",
      confidence: 0.1,
      nutritionSource: "parse_error",
    };
  }

  const numberOrZero = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const calories = numberOrZero(result.calories);
  const protein = numberOrZero(result.protein);
  const carbs = numberOrZero(result.carbs);
  const fat = numberOrZero(result.fat);
  const ingredients = Array.isArray(result.ingredients) ? result.ingredients : [];
  const missingFields = Array.isArray(result.missing_fields) ? result.missing_fields : [];
  const resultParseError = typeof result.parseError === "string" && result.parseError.trim()
    ? result.parseError.trim()
    : undefined;
  const zeroMacroParseError = !resultParseError && (
    [calories, protein, carbs, fat].every((value) => value === 0)
    || ingredients.filter((ingredient: any) => ingredient && typeof ingredient.food_text === "string" && Number(ingredient.amount) > 0).length === 0
  )
    ? "Couldn't parse reliably — confirm or edit portions."
    : undefined;
  const parseError = resultParseError ?? zeroMacroParseError;

  return {
    name: result.name || description.slice(0, 50),
    calories,
    protein,
    carbs,
    fat,
    time: mealTime,
    aiSuggestion: result.suggestion || undefined,
    components: result.components || undefined,
    mealType: mealType || "unspecified",
    description,
    // Structured data for deterministic nutrition engine
    ingredients,
    cooking_method: result.cooking_method || "unknown",
    portion_scale: typeof result.portion_scale === "number" ? result.portion_scale : 1.0,
    total_recipe_servings: typeof result.total_recipe_servings === "number" ? result.total_recipe_servings : 1,
    missing_fields: parseError && !missingFields.includes("parse_error") ? [...missingFields, "parse_error"] : missingFields,
    parseError,
    confidence: parseError ? 0.1 : undefined,
    nutritionSource: parseError ? "parse_error" : undefined,
  };
}

export async function parseWorkoutDescription(description: string, ctx: ActionCtx, userId: string, duration?: string, intensity?: string, model?: string, apiKey?: string, userPhysique?: UserPhysique): Promise<ParsedWorkoutResult> {
  assertMaxChars(description, AI_INPUT_LIMITS.textChars, "workout description");
  if (duration) assertMaxChars(duration, AI_INPUT_LIMITS.textChars, "workout duration");
  if (intensity) assertMaxChars(intensity, AI_INPUT_LIMITS.textChars, "workout intensity");
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
7. If the user explicitly states calories burned (e.g. "75 kcal burned", "75cal burned"), set caloriesBurned to that value. Otherwise set caloriesBurned to 0; the app calculates a visible calorie range separately.
8. Use the exact exercise names the user typed.
9. Session name: max 3 words.
10. Look for rest pattern clues.

Return ONLY valid JSON:
{"name":"session name","exercises":[{"name":"exercise name","muscle_group":"chest","weight_unit":"kg","sets":[{"weight":"12.5","reps":"15"}]},{"name":"cardio name","muscle_group":"cardio","weight_unit":"bodyweight","sets":[{"distance_km":"0.75","duration_min":"10","incline":"11","pace":"13.2","calories_per_hr":"425"}]}],"duration":"estimated total duration","intensity":"LOW|MEDIUM|HIGH|MAX","caloriesBurned":0,"rationale":"one coaching tip (max 15 words)","restClues":"any rest pattern info"}`;

  const content = await callAI(ctx, userId, [{ role: "user", content: prompt }], 1200, model, apiKey);
  const parsedJson = tryParseJSON<any>(content);
  const result = parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
    ? parsedJson
    : { name: description.slice(0, 30), exercises: [], duration, intensity, caloriesBurned: 0, rationale: "", restClues: "", parseError: "Couldn't parse reliably — confirm or edit duration/intensity." };

  const parsedExercises = (Array.isArray(result.exercises) ? result.exercises : []).flatMap((ex: unknown) => {
    if (!isRecord(ex)) return [];
    const sets = Array.isArray(ex.sets)
      ? ex.sets.flatMap((s: unknown) => {
          if (!isRecord(s)) return [];
          return [{
            weight: String(s.weight || ""),
            reps: String(s.reps || ""),
            // cardio fields
            distance_km: s.distance_km != null ? String(s.distance_km) : undefined,
            duration_min: s.duration_min != null ? String(s.duration_min) : undefined,
            incline: s.incline != null ? String(s.incline) : undefined,
            pace: s.pace != null ? String(s.pace) : undefined,
            calories_per_hr: s.calories_per_hr != null ? String(s.calories_per_hr) : undefined,
          }];
        })
      : [];
    return [{
      name: typeof ex.name === "string" && ex.name.trim() ? ex.name : "Exercise",
      muscle_group: typeof ex.muscle_group === "string" ? ex.muscle_group : "",
      weight_unit: typeof ex.weight_unit === "string" ? ex.weight_unit : "kg",
      sets,
    }];
  });
  const parseError = typeof result.parseError === "string" && result.parseError.trim()
    ? result.parseError.trim()
    : parsedExercises.length === 0
      ? "Couldn't identify an exercise — tell me what you did."
      : undefined;
  const exercises = parsedExercises;
  const totalSets = exercises.reduce((sum: number, ex: any) => sum + ex.sets.length, 0);
  const setsVal = exercises.length > 0 ? `${exercises.length} exercise${exercises.length !== 1 ? "s" : ""} · ${totalSets} sets` : "–";
  const userProvidedDurationMin = parseDurationMinutes(duration);
  const parsedDurationMin = parseDurationMinutes(result.duration || duration);
  const roughDuration = userProvidedDurationMin <= 0;
  const durationMin = parsedDurationMin > 0 ? parsedDurationMin : undefined;
  const durationLabel = durationMin != null ? (result.duration || duration || `${durationMin} min`) : undefined;
  const roughCalorieEstimate = roughDuration || !intensity || !!parseError;

  // Deterministic calorie calculation. Use a conservative default weight when
  // onboarding has not captured weight yet, so detailed workouts never show 0.
  let calorieResult: ParsedWorkoutResult["calorieResult"] = null;
  if (exercises.length > 0 && durationMin != null) {
    try {
      const hasKnownWeight = typeof userPhysique?.weight === "number" && userPhysique.weight > 0;
      if (!hasKnownWeight) throw new Error("Workout calorie estimate unavailable without profile weight");
      const engineIntensity = mapAIIntensity(result.intensity || intensity || "HIGH");
      const engineDensity = inferDensity(exercises, durationMin);
      const exerciseMetas = matchExercises(exercises);
      const compoundRatio = countCompoundRatio(exerciseMetas);
      const weightedMet = getWeightedMET(exercises);
      const roughExerciseMatch = exerciseMetas.some((meta) => meta.rough === true);

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
          weight_kg: userPhysique.weight!,
          age: userPhysique?.age ?? 30,
          sex: (userPhysique?.sex === "female" ? "female" : "male"),
          fitness_level: ((userPhysique?.fitnessLevel ?? "beginner") as "beginner" | "intermediate" | "advanced"),
          metabolic_factor: userPhysique?.metabolicFactor ?? 1.0,
        },
      );

      calorieResult = adjustedCalorieResult(
        calcResult,
        hasKnownWeight,
        roughCalorieEstimate || roughExerciseMatch,
      );
    } catch {
      // Fall back to AI estimate if engine fails
    }
  }

  const explicitCalories =
    extractStatedWorkoutCalories(description) ??
    (typeof result.caloriesBurned === "number" && result.caloriesBurned > 0
      ? Math.round(result.caloriesBurned)
      : null);

  return {
    name: result.name || description.slice(0, 30),
    sets: setsVal,
    duration: durationLabel,
    intensity: result.intensity || intensity || "HIGH",
    caloriesBurned: explicitCalories ?? calorieResult?.total_kcal ?? 0,
    rationale: result.rationale || "",
    exercises: exercises.length > 0 ? exercises : null,
    description,
    calorieResult,
    parseError,
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
  assertIngredients(ingredients);

  if (parsedMeal.parseError) {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: 0.1,
      nutritionSource: "parse_error",
      ingredientBreakdown: null,
    };
  }

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
        let bestMatch = matchBestFood(foodText, cachedResults);
        if (!bestMatch && typeof ctx.runAction === "function") {
          const liveResults = await ctx.runAction(internal.foods.searchFoodsLive, { query: foodText, limit: 8 }).catch(() => []);
          bestMatch = matchBestFood(foodText, liveResults as any[]);
        }

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
            verified: bestMatch.verified,
            confidence: conversion.confidence,
          });
          if ((bestMatch as any)._id) {
            ctx.runMutation(internal.foods.bumpSearchCount, { id: (bestMatch as any)._id }).catch(() => {});
          }
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
  const numberOrZero = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const aiCals = numberOrZero(parsedMeal.calories);
  const aiProtein = numberOrZero(parsedMeal.protein);
  const aiCarbs = numberOrZero(parsedMeal.carbs);
  const aiFat = numberOrZero(parsedMeal.fat);

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
      finalSource = providerSourceFromItems(engine.items);
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
    // Nothing resolved -> pure AI estimate, if the parser produced one.
    finalCalories = aiCals;
    finalProtein = aiProtein;
    finalCarbs = aiCarbs;
    finalFat = aiFat;
    finalConfidence = aiCals > 0 || aiProtein > 0 || aiCarbs > 0 || aiFat > 0 ? 0.3 : 0.1;
    finalSource = aiCals > 0 || aiProtein > 0 || aiCarbs > 0 || aiFat > 0 ? "ai_estimated" : "parse_error";
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

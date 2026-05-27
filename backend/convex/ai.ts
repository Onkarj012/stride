import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getCoach, classifyCoachType, COACHES, type CoachType } from "./coaches";
import {
  calculateWorkoutCalories,
  scoreDensity,
  scoreCompoundRatio,
  parseDurationMinutes,
  type CalorieResult,
} from "./calorie_engine";
import {
  lookupExercise,
  matchExercises,
  getWeightedMET,
  getDominantCategory,
} from "./exercise_db";
import {
  mapAIIntensity,
  inferDensity,
  countCompoundRatio,
  generateSetsSummary,
} from "./workout_scorer";
import {
  toGrams,
} from "./unit_converter";
import {
  matchBestFood,
  computeNutrition,
  cookingMethodAdjustment,
  buildNutritionResult,
  scaleResult,
  type ItemBreakdown,
  type NutritionResult,
} from "./nutrition_engine";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const FALLBACK_MODEL = "anthropic/claude-3-haiku";

const VISION_MODELS = new Set([
  "openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-4-turbo",
  "anthropic/claude-3-opus", "anthropic/claude-3-sonnet", "anthropic/claude-3-haiku",
  "anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-haiku",
  "google/gemini-1.5-pro", "google/gemini-1.5-flash", "google/gemini-2.0-flash",
  "meta-llama/llama-3.2-11b-vision", "meta-llama/llama-3.2-90b-vision",
]);

interface AIMessage { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }

async function callAI(messages: AIMessage[], maxTokens = 500, model?: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const primaryModel = model || DEFAULT_MODEL;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const useFallback = attempt >= 2;
    const currentModel = useFallback ? FALLBACK_MODEL : primaryModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: currentModel, messages, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const status = res.status;
        const errBody = await res.text();
        if (status >= 500 || status === 429) {
          lastError = new Error(`OpenRouter error ${status}: ${errBody}`);
          continue;
        }
        throw new Error(`OpenRouter error ${status}: ${errBody}`);
      }
      const data = await res.json() as any;
      if (data.error) {
        lastError = new Error(`OpenRouter API error: ${data.error.message}`);
        continue;
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error("OpenRouter returned empty response");
        continue;
      }
      return content;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error("OpenRouter request timed out after 60s");
        continue;
      }
      const error = err as Error;
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("network")
      ) {
        lastError = error;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("OpenRouter failed after maximum retries");
}

function parseJSON<T>(text: string, fallback: T): T {
  const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\s\S]*\]/);
  try { return JSON.parse(match ? match[0] : text) as T; } catch { return fallback; }
}

async function parseMealDescription(description: string, mealType: string, time: string, model?: string, apiKey?: string) {
  const prompt = `You are a professional nutritionist. Extract structured ingredients from this meal description AND estimate total macros.

Meal type: ${mealType || "unspecified"}
User's description:
"""
${description}
"""

Instructions:
1. Identify EVERY ingredient, condiment, and cooking addition (oils, butter, ghee, sauces, etc.).
2. For each ingredient, extract: food_text (the ingredient name), amount (number), unit ("g", "ml", "tbsp", "cup", "piece", etc.), and flag is_oil_or_fat (true for oils, butter, ghee, etc.).
3. Deduce the cooking_method from description: "raw", "boiled", "steamed", "grilled", "baked", "roasted", "fried", "sautéed", "stir-fried", "curry", "tadka", or "unknown".
4. Estimate portion_scale (0.0-1.0) — what fraction of the total recipe did the user eat? Default 1.0.
5. Estimate total_recipe_servings if mentioned.
6. In "components", list the key ingredients detected (e.g. "paneer, rice, ghee"). Be specific.
7. In "suggestion", give ONE forward-looking sentence about what the user should focus on in their NEXT meal (not criticism of this meal).
8. ALSO estimate total calories, protein (g), carbs (g), and fat (g) for the entire meal. These serve as fallback values when the food database doesn't have complete data for every ingredient.

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

interface UserPhysique {
  weight?: number; // kg
  height?: number; // cm
  age?: number;
  sex?: string;
  fitnessLevel?: string;
  metabolicFactor?: number;
}

interface ParsedWorkoutResult {
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

async function parseWorkoutDescription(description: string, duration?: string, intensity?: string, model?: string, apiKey?: string, userPhysique?: UserPhysique): Promise<ParsedWorkoutResult> {
  const physiqueInfo = userPhysique?.weight
    ? `\nUser physique: ${userPhysique.weight}kg${userPhysique.height ? `, ${userPhysique.height}cm` : ""}${userPhysique.age ? `, ${userPhysique.age}yo` : ""}${userPhysique.sex ? `, ${userPhysique.sex}` : ""}${userPhysique.fitnessLevel ? `, fitness: ${userPhysique.fitnessLevel}` : ""}`
    : "";

  const prompt = `You are a professional fitness trainer. Parse this workout log precisely. Do NOT estimate calories.

User's workout:
"""
${description}
"""

User-provided duration: ${duration || "not specified"}
User-provided intensity: ${intensity || "not specified"}${physiqueInfo}

Rules:
1. Extract EVERY exercise. Each exercise gets its own entry in "exercises".
2. For each exercise, create one entry in "sets" per set with exact weight and reps. Use the specific weight/reps the user provided.
3. For cardio, use a single set with duration and calories as the reps field.
4. Estimate total session duration if not provided. Determine intensity from volume/load.
5. Do NOT estimate calories burned. Set caloriesBurned to 0.
6. Use the exact exercise names the user typed (preserve capitalization and spelling).
7. Session name: max 3 words.
8. Look for rest pattern clues: "giant set", "superset", "circuit", "minimal rest", "heavy rest", "EMOM", "AMRAP".

Return ONLY valid JSON:
{"name":"session name","exercises":[{"name":"exercise name","sets":[{"weight":"41kg","reps":"15"}]}],"duration":"estimated total duration","intensity":"LOW|MEDIUM|HIGH|MAX","caloriesBurned":0,"rationale":"one coaching tip (max 15 words)","restClues":"any rest pattern info from description"}`;

  const content = await callAI([{ role: "user", content: prompt }], 1200, model, apiKey);
  const result = parseJSON<any>(content, { name: description.slice(0, 30), exercises: [], duration: duration || "30 min", intensity: intensity || "HIGH", caloriesBurned: 0, rationale: "", restClues: "" });

  const exercises = (result.exercises || []).map((ex: any) => ({
    name: ex.name || "Exercise",
    sets: Array.isArray(ex.sets) ? ex.sets.map((s: any) => ({ weight: String(s.weight || ""), reps: String(s.reps || "") })) : [],
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
          weight_kg: userPhysique.weight ?? 70,
          age: userPhysique.age ?? 30,
          sex: (userPhysique.sex === "female" ? "female" : "male"),
          fitness_level: (userPhysique.fitnessLevel as "beginner" | "intermediate" | "advanced") || "beginner",
          metabolic_factor: userPhysique.metabolicFactor ?? 1.0,
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
    caloriesBurned: calorieResult?.total_kcal ?? 0,
    rationale: result.rationale || "",
    exercises: exercises.length > 0 ? exercises : null,
    description,
    calorieResult,
  };
}

// ─── Deterministic Nutrition Engine ───────────────────────────────────────────

async function runNutritionEngine(
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
      // Some ingredients unresolved → blend: use engine for what matched, AI for missing macros
      finalCalories = engine.calories_kcal > 0 ? Math.max(engine.calories_kcal, aiCals) : aiCals;
      finalProtein = engine.protein_g > 0 ? engine.protein_g : aiProtein;
      finalCarbs = engine.carbs_g > 0 ? engine.carbs_g : aiCarbs;
      finalFat = engine.fat_g > 0 ? engine.fat_g : aiFat;
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

// ─── Public actions ───────────────────────────────────────────────────────────

export const estimateMeal = action({
  args: { mealName: v.string() },
  handler: async (ctx, { mealName }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const prompt = `Estimate the nutritional values for this meal: "${mealName}". Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
    const content = await callAI([{ role: "user", content: prompt }], 200, model, apiKey);
    const result = parseJSON<any>(content, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return { calories: result.calories || 0, protein: result.protein || 0, carbs: result.carbs || 0, fat: result.fat || 0 };
  },
});

export const parseMeal = action({
  args: {
    description: v.string(),
    mealType: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { description, mealType, time }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const parsedMeal = await parseMealDescription(description, mealType || "unspecified", time || "", model, apiKey);

    // Run deterministic nutrition calculation
    const nutrition = await runNutritionEngine(ctx, parsedMeal);

    return {
      ...parsedMeal,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      confidence: nutrition.confidence,
      nutritionSource: nutrition.nutritionSource,
      ingredientBreakdown: nutrition.ingredientBreakdown,
    };
  },
});

export const parseWorkout = action({
  args: {
    description: v.string(),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
  },
  handler: async (ctx, { description, duration, intensity }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    let userPhysique: UserPhysique | undefined;
    if (userId) {
      const [settings, profile, metabolicProfile] = await Promise.all([
        ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
        ctx.runQuery(internal.profile.getProfileForContext, { userId }),
        ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {}),
      ]);
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
      if (profile) {
        userPhysique = {
          weight: profile.weight,
          height: profile.height,
          age: profile.age,
          sex: profile.sex,
          fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
          metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
        };
      }
    }
    const result = await parseWorkoutDescription(description, duration, intensity, model, apiKey, userPhysique);
    return result;
  },
});

export const logMeal = action({
  args: {
    description: v.optional(v.string()),
    mealType: v.optional(v.string()),
    time: v.optional(v.string()),
    parsedData: v.optional(v.any()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { description, mealType, time, parsedData, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = date ?? new Date().toISOString().split("T")[0];

    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;

    let data: any;
    let parsedMeal: any;
    if (parsedData) {
      parsedMeal = {
        ...parsedData,
        mealType: parsedData.mealType || mealType || "unspecified",
        time: parsedData.time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        ingredients: parsedData.ingredients || [],
        cooking_method: parsedData.cooking_method || "unknown",
        portion_scale: parsedData.portion_scale ?? 1.0,
        missing_fields: parsedData.missing_fields || [],
      };
    } else if (description) {
      parsedMeal = await parseMealDescription(description, mealType || "unspecified", time || "", model, apiKey);
    } else {
      throw new Error("description or parsedData required");
    }

    // Run deterministic nutrition calculation from structured ingredients
    const nutrition = await runNutritionEngine(ctx, parsedMeal);
    const structuredItems = nutrition.ingredientBreakdown ? JSON.stringify(nutrition.ingredientBreakdown.items) : undefined;
    const ingredientBreakdownStr = nutrition.ingredientBreakdown ? JSON.stringify(nutrition.ingredientBreakdown) : undefined;

    const id = await ctx.runMutation(internal.meals.addMealFromAI, {
      userId, date: today,
      name: parsedMeal.name || "Meal",
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      time: parsedMeal.time,
      aiSuggestion: parsedMeal.aiSuggestion,
      mealType: parsedMeal.mealType || mealType || "unspecified",
      components: parsedMeal.components,
      confidence: nutrition.confidence,
      nutritionSource: nutrition.nutritionSource,
      structuredItems,
      ingredientBreakdown: ingredientBreakdownStr,
    });
    data = {
      _id: id,
      name: parsedMeal.name,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      time: parsedMeal.time,
      aiSuggestion: parsedMeal.aiSuggestion,
      mealType: parsedMeal.mealType || mealType || "unspecified",
      components: parsedMeal.components,
      confidence: nutrition.confidence,
      nutritionSource: nutrition.nutritionSource,
      ingredientBreakdown: nutrition.ingredientBreakdown,
    };
    return data;
  },
});

export const logWorkout = action({
  args: {
    description: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
    parsedData: v.optional(v.any()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { description, duration, intensity, parsedData, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = date ?? new Date().toISOString().split("T")[0];

    const [settings, profile, metabolicProfile] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {}),
    ]);
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const userPhysique: UserPhysique | undefined = profile ? {
      weight: profile.weight,
      height: profile.height,
      age: profile.age,
      sex: profile.sex,
      fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
      metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
    } : undefined;

    let data: any;
    if (parsedData) {
      // If passed parsed data, run through calorie engine if it has exercises
      let calorieFields: any = {};
      if (parsedData.calorieResult) {
        calorieFields = {
          calorieConfidence: parsedData.calorieResult.confidence,
          calorieRangeLow: parsedData.calorieResult.range_low,
          calorieRangeHigh: parsedData.calorieResult.range_high,
          calorieBreakdown: JSON.stringify(parsedData.calorieResult.breakdown),
          calculationVersion: 1,
        };
      }
      const id = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
        userId, date: today,
        name: parsedData.name || "Workout",
        sets: parsedData.sets || "–",
        duration: parsedData.duration || duration || "30 min",
        intensity: parsedData.intensity || intensity || "HIGH",
        exercises: parsedData.exercises,
        rationale: parsedData.rationale,
        caloriesBurned: parsedData.caloriesBurned ?? (parsedData.calorieResult?.total_kcal ?? 0),
        ...calorieFields,
      });
      data = { _id: id, ...parsedData };
    } else if (description) {
      const parsed = await parseWorkoutDescription(description, duration, intensity, model, apiKey, userPhysique);
      const calorieFields = parsed.calorieResult ? {
        calorieConfidence: parsed.calorieResult.confidence,
        calorieRangeLow: parsed.calorieResult.range_low,
        calorieRangeHigh: parsed.calorieResult.range_high,
        calorieBreakdown: JSON.stringify(parsed.calorieResult.breakdown),
        calculationVersion: 1,
      } : {};
      const id = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
        userId, date: today,
        name: parsed.name,
        sets: parsed.sets,
        duration: parsed.duration,
        intensity: parsed.intensity,
        exercises: parsed.exercises,
        rationale: parsed.rationale,
        caloriesBurned: parsed.caloriesBurned,
        ...calorieFields,
      });
      data = { _id: id, ...parsed };
    } else {
      throw new Error("description or parsedData required");
    }

    // Increment workout count for calibration
    try {
      await ctx.runMutation(internal.calibration.incrementWorkoutCount, { userId });
    } catch { /* ignore */ }

    return data;
  },
});

export const chat = action({
  args: {
    message: v.string(),
    sessionId: v.optional(v.id("chat_sessions")),
    coachType: v.optional(v.string()),
    today: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, { message, sessionId, coachType, today: todayArg, image }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const userName = identity.name ?? "Athlete";
    const today = todayArg ?? new Date().toISOString().split("T")[0];

    // Gather context
    const [profile, todayMeals, todayWorkouts, recentCals, settings] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
      ctx.runQuery(internal.meals.getRecentCalories, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
    ]);

    const totalCals = todayMeals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = todayMeals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalBurned = todayWorkouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);

    let contextBlock = `USER PROFILE:\nName: ${userName}\n`;
    if (profile?.weight) contextBlock += `Weight: ${profile.weight}kg\n`;
    if (profile?.height) contextBlock += `Height: ${profile.height}cm\n`;
    if (profile?.age) contextBlock += `Age: ${profile.age}\n`;
    if (profile?.sex) contextBlock += `Sex: ${profile.sex}\n`;
    contextBlock += `Activity Level: ${profile?.activityLevel || "moderate"}\n`;
    if (profile?.goal) contextBlock += `Goal: ${profile.goal}\n`;
    if (profile?.dietaryPreference && profile.dietaryPreference !== "none") {
      contextBlock += `Dietary Preference: ${profile.dietaryPreference} (IMPORTANT: Only suggest foods that comply with this diet)\n`;
    }
    if (profile?.allergies) {
      contextBlock += `Allergies/Avoid: ${profile.allergies} (CRITICAL: Never suggest foods containing these)\n`;
    }
    if (profile?.calorieTarget) contextBlock += `Daily Calorie Target: ${profile.calorieTarget}\n`;
    if (profile?.proteinTarget) contextBlock += `Daily Protein Target: ${profile.proteinTarget}g\n`;
    const totalCarbs = todayMeals.reduce((s: number, m: any) => s + (m.carbs ?? 0), 0);
    const totalFat = todayMeals.reduce((s: number, m: any) => s + (m.fat ?? 0), 0);
    contextBlock += `\nTODAY'S LOG (${today}):\nCalories consumed: ${totalCals}\nCalories burned: ${totalBurned}\nNet calories: ${totalCals - totalBurned}\nProtein: ${totalProtein}g | Carbs: ${totalCarbs}g | Fat: ${totalFat}g\nMeals logged: ${todayMeals.length}\n`;
    if (todayMeals.length > 0) {
      contextBlock += `Meals:\n`;
      todayMeals.forEach((m: any) => {
        contextBlock += `- ${m.name} at ${m.time}: ${m.calories}cal, P:${m.protein}g C:${m.carbs}g F:${m.fat}g`;
        if (m.mealType) contextBlock += ` (${m.mealType})`;
        contextBlock += `\n`;
      });
    }
    contextBlock += `Workouts logged: ${todayWorkouts.length}\n`;
    if (todayWorkouts.length > 0) {
      contextBlock += `Workouts:\n`;
      todayWorkouts.forEach((w: any) => {
        contextBlock += `- ${w.name}: ${w.duration || "?"}, ${w.intensity}, ${w.caloriesBurned ?? 0}kcal burned`;
        if (w.exercises?.length) {
          contextBlock += ` [${w.exercises.map((e: any) => e.name).join(", ")}]`;
        }
        contextBlock += `\n`;
      });
    }
    contextBlock += `\nRECENT 7-DAY TREND:\n${recentCals.map((d: any) => `${d.date}: ${d.cals}cal`).join(", ")}`;

    const loggingPrompt = `\n\nDIRECT LOGGING CAPABILITY:
You can log meals and workouts directly when the user describes them. When a user tells you what they ate or what workout they did, append ONE action block at the very end of your response:

For meals: ⟦LOG_MEAL⟧{"description":"full meal description with ingredients and amounts","mealType":"breakfast|lunch|dinner|snack","time":"HH:MM or empty string"}⟦/LOG_MEAL⟧
For workouts: ⟦LOG_WORKOUT⟧{"description":"full workout description with exercises, sets, reps, weights"}⟦/LOG_WORKOUT⟧

Rules:
- ONLY append a log block when the user is clearly reporting what they ate/did
- Do NOT append log blocks for questions, advice requests, or general discussion
- Your message text (before the block) should confirm what you logged and give a brief analysis
- YOU MUST include the markers exactly as shown.`;

    // Load session history
    let history: { role: string; content: string }[] = [];
    let isFirstMessage = false;
    if (sessionId) {
      const [msgs, count] = await Promise.all([
        ctx.runQuery(internal.chat.getMessagesForContext, { userId, sessionId }),
        ctx.runQuery(internal.chat.getMessageCount, { sessionId }),
      ]);
      history = msgs;
      isFirstMessage = count === 0;
    }

    // Save user message
    await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "user", content: message });

    // Detect coach
    let detectedCoach: CoachType = (coachType as CoachType) ?? "overall";
    if (!coachType || coachType === "auto") detectedCoach = classifyCoachType(message);
    const coach = getCoach(detectedCoach);

    const messages: AIMessage[] = [
      { role: "system", content: `${coach.systemPrompt}\n\n${contextBlock}${loggingPrompt}` },
      ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content })),
      image
        ? {
            role: "user",
            content: [
              { type: "text", text: message || "What do you see in this image? If it's food, estimate the macros and offer to log it." },
              { type: "image_url", image_url: { url: image } },
            ],
          }
        : { role: "user", content: message },
    ];

    const settingsModel = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    // When image is present, force a vision-capable model
    const model = image
      ? (settingsModel && VISION_MODELS.has(settingsModel) ? settingsModel : DEFAULT_MODEL)
      : settingsModel;
    const reply = await callAI(messages, 800, model, apiKey);

    // Parse log blocks
    let cleanReply = reply;
    let loggedItem: any = null;

    const mealMatch = reply.match(/⟦LOG_MEAL⟧([\s\S]*?)⟦\/LOG_MEAL⟧/);
    const workoutMatch = reply.match(/⟦LOG_WORKOUT⟧([\s\S]*?)⟦\/LOG_WORKOUT⟧/);

    if (mealMatch) {
      cleanReply = reply.replace(/⟦LOG_MEAL⟧[\s\S]*?⟦\/LOG_MEAL⟧/, "").trim();
      try {
        const logData = JSON.parse(mealMatch[1].trim());
        const parsed = await parseMealDescription(logData.description || message, logData.mealType || "unspecified", logData.time || "", model, apiKey);

        // Run deterministic nutrition calculation
        const nutrition = await runNutritionEngine(ctx, parsed);
        const finalStructuredItems = nutrition.ingredientBreakdown ? JSON.stringify(nutrition.ingredientBreakdown.items) : undefined;
        const finalIngredientBreakdown = nutrition.ingredientBreakdown ? JSON.stringify(nutrition.ingredientBreakdown) : undefined;

        const mealId = await ctx.runMutation(internal.meals.addMealFromAI, {
          userId, date: today,
          name: parsed.name,
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          time: parsed.time,
          aiSuggestion: parsed.aiSuggestion,
          mealType: parsed.mealType,
          components: parsed.components,
          confidence: nutrition.confidence,
          nutritionSource: nutrition.nutritionSource,
          structuredItems: finalStructuredItems,
          ingredientBreakdown: finalIngredientBreakdown,
        });
        loggedItem = { type: "meal", data: { _id: mealId, ...parsed, calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat } };
      } catch (err) {
        console.error("Failed to log meal from AI:", err);
      }
    } else if (workoutMatch) {
      cleanReply = reply.replace(/⟦LOG_WORKOUT⟧[\s\S]*?⟦\/LOG_WORKOUT⟧/, "").trim();
      try {
        const logData = JSON.parse(workoutMatch[1].trim());
        // Get metabolic profile for workout
        const metabolicProfile: any = await ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {});
        const userPhysique: UserPhysique | undefined = profile ? {
          weight: profile.weight,
          height: profile.height,
          age: profile.age,
          sex: profile.sex,
          fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
          metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
        } : undefined;
        const parsed = await parseWorkoutDescription(logData.description || message, undefined, undefined, model, apiKey, userPhysique);
        const calorieFields = parsed.calorieResult ? {
          calorieConfidence: parsed.calorieResult.confidence,
          calorieRangeLow: parsed.calorieResult.range_low,
          calorieRangeHigh: parsed.calorieResult.range_high,
          calorieBreakdown: JSON.stringify(parsed.calorieResult.breakdown),
          calculationVersion: 1,
        } : {};
        const workoutId = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
          userId, date: today,
          name: parsed.name,
          sets: parsed.sets,
          duration: parsed.duration,
          intensity: parsed.intensity,
          exercises: parsed.exercises,
          rationale: parsed.rationale,
          caloriesBurned: parsed.caloriesBurned,
          ...calorieFields,
        });
        loggedItem = { type: "workout", data: { _id: workoutId, ...parsed } };
      } catch (err) {
        console.error("Failed to log workout from AI:", err);
      }
    }

    // Save AI reply
    await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "ai", content: cleanReply });

    // Update session
    if (sessionId) {
      if (isFirstMessage) {
        try {
          const title = await callAI(
            [
              { role: "system", content: "Generate a short, descriptive title (max 6 words, 40 characters) for a fitness coaching conversation based on the user's first message. Return ONLY the title, no quotes, no punctuation." },
              { role: "user", content: message },
            ],
            40,
            model,
            apiKey,
          );
          const cleanTitle = title.replace(/^["']|["']$/g, "").trim().slice(0, 60);
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { sessionId, title: cleanTitle || message.slice(0, 50) });
        } catch {
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { sessionId, title: message.slice(0, 50) });
        }
      } else {
        await ctx.runMutation(internal.chat.touchSession, { sessionId });
      }
    }

    return { reply: cleanReply, loggedItem, coachType: detectedCoach };
  },
});

export const generateDailyInsights = action({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const [meals, workouts, goal, settings, profile] = await Promise.all([
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ctx.runQuery(internal.goals.getDailyGoalForContext, { userId, date }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    const totalCals = meals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = meals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalCarbs = meals.reduce((s: number, m: any) => s + (m.carbs ?? 0), 0);
    const totalFat = meals.reduce((s: number, m: any) => s + (m.fat ?? 0), 0);
    const totalBurned = workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);

    let userContext = "";
    if (profile?.goal) userContext += `User goal: ${profile.goal}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;
    if (profile?.trainingStyle) userContext += `Training style: ${profile.trainingStyle}. `;

    const mealsList = meals.length > 0 ? `\nMeals today: ${meals.map((m: any) => m.name).join(", ")}` : "";

    const prompt = `${userContext}Today's nutrition & workout data:
- Calories consumed: ${totalCals} (goal: ${goal?.calorieGoal || 2400})
- Calories burned: ${totalBurned}
- Net calories: ${totalCals - totalBurned}
- Protein: ${totalProtein}g (goal: ${goal?.proteinGoal || 180}g)
- Carbs: ${totalCarbs}g | Fat: ${totalFat}g
- Meals logged: ${meals.length}
- Workouts logged: ${workouts.length}${mealsList}

Give 3 short, punchy insights (one sentence each) about their day. Tailor advice to their goal (${profile?.goal || "general fitness"}). Be motivating but direct. Return ONLY a JSON array of 3 strings. Example: ["Protein intake on target. Stay locked in.", "Caloric deficit detected. Fuel up, soldier.", "Zero training logged. The iron doesn't lift itself."]`;

    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    let insights: string[] = [];
    try {
      const match = content.match(/\[[\s\S]*\]/);
      insights = JSON.parse(match ? match[0] : content) as string[];
      if (!Array.isArray(insights)) insights = [];
    } catch {
      insights = [content.slice(0, 100), "Keep pushing forward.", "Data logged successfully."];
    }

    await ctx.runMutation(internal.insights.saveInsights, { userId, date, insights });
    return { insights };
  },
});

export const generateWeeklySummary = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    const weekStart = monday.toISOString().split("T")[0];

    const history = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const date = d.toISOString().split("T")[0];
      const [meals, workouts] = await Promise.all([
        ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
        ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ]);
      history.push({ date, calories: Math.round(meals.reduce((s: number, m: any) => s + m.calories, 0)), burned: Math.round(workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0)), workouts: workouts.length });
    }

    const avgCals = Math.round(history.reduce((s, d) => s + d.calories, 0) / 7);
    const avgBurned = Math.round(history.reduce((s, d) => s + d.burned, 0) / 7);
    const totalWorkouts = history.reduce((s, d) => s + d.workouts, 0);
    const dailyBreakdown = history.map((d) => `${d.date.split("-")[2]}: ${d.calories}cal/${d.burned}burned/${d.workouts}wkt`).join(", ");

    const [settings, profile] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    let userContext = "";
    if (profile?.goal) userContext += `User goal: ${profile.goal}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;
    if (profile?.trainingStyle) userContext += `Training: ${profile.trainingStyle}. `;
    if (profile?.calorieTarget) userContext += `Target: ${profile.calorieTarget}cal/day. `;

    const prompt = `${userContext}Weekly fitness summary:
- Average daily calories: ${avgCals}
- Average daily burned: ${avgBurned}
- Total workouts: ${totalWorkouts}/7 days
- Daily breakdown: ${dailyBreakdown}

Give a brief (2-3 sentences) weekly summary and recommendation tailored to their goal (${profile?.goal || "general fitness"}). Be direct and actionable.`;
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    await ctx.runMutation(internal.insights.saveWeeklySummary, { userId, weekStart, content });
    return { content };
  },
});

export const suggestWorkout = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const [recentWorkouts, settings, profile, metabolicProfile] = await Promise.all([
      ctx.runQuery(internal.workouts.getRecentWorkoutsDetailed, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {}),
    ]);

    let userContext = "";
    if (profile?.goal) userContext += `Goal: ${profile.goal}. `;
    if (profile?.trainingStyle) userContext += `Training style: ${profile.trainingStyle}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;

    const recentSummary = (recentWorkouts as any[]).length > 0
      ? (recentWorkouts as any[]).map((w: any) => {
          const exNames = w.exercises?.map((e: any) => e.name).join(", ") || "";
          return `${w.date}: ${w.name}${exNames ? ` (${exNames})` : ""} — ${w.intensity}`;
        }).join("; ")
      : "no recent workouts";

    const prompt = `${userContext}Last 7 days of workouts: ${recentSummary}

Suggest a workout for today based on their recent training history. Consider muscle group rotation — if they trained chest yesterday, suggest back or legs today. If they had a rest day, suggest a balanced session.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "name": "session name (2-3 words)",
  "exercises": [
    {"name": "Exercise Name", "sets": [{"reps": "12", "weight": "80kg"}, {"reps": "10", "weight": "85kg"}, {"reps": "8", "weight": "90kg"}]},
    {"name": "Another Exercise", "sets": [{"reps": "15", "weight": "bodyweight"}, {"reps": "12", "weight": "bodyweight"}]}
  ],
  "duration": "45 min",
  "intensity": "HIGH",
  "rationale": "one sentence why this suits their goal and training history"
}
Include 3-6 exercises with 3-4 sets each. For cardio, use duration as reps field and omit weight. Be specific with exercise names. Do NOT include caloriesBurned — calories are calculated separately.`;
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 800, model, apiKey);
    const result = parseJSON<any>(content, {});

    // Deterministic calorie calculation
    const exercises = (result.exercises || []).map((ex: any) => ({
      name: ex.name || "Exercise",
      sets: Array.isArray(ex.sets) ? ex.sets.map((s: any) => ({ weight: String(s.weight || ""), reps: String(s.reps || "") })) : [],
    }));
    let calorieResult: any = null;
    if (profile?.weight && exercises.length > 0) {
      try {
        const durationMin = parseDurationMinutes(result.duration || "45 min");
        const engineIntensity = mapAIIntensity(result.intensity || "HIGH");
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
            weight_kg: profile.weight ?? 70,
            age: profile.age ?? 30,
            sex: (profile.sex === "female" ? "female" : "male"),
            fitness_level: (metabolicProfile?.fitnessLevel as "beginner" | "intermediate" | "advanced") || "beginner",
            metabolic_factor: metabolicProfile?.metabolicFactor ?? 1.0,
          },
        );
        calorieResult = {
          total_kcal: calcResult.total_kcal,
          confidence: calcResult.confidence,
          range_low: calcResult.range_low,
          range_high: calcResult.range_high,
          breakdown: calcResult.breakdown,
        };
      } catch { /* ignore */ }
    }

    return {
      ...result,
      exercises,
      caloriesBurned: calorieResult?.total_kcal ?? 0,
      calorieResult,
    };
  },
});

export const parseNutritionImage = action({
  args: {
    imageDataUrl: v.string(),
    userDescription: v.optional(v.string()),
  },
  handler: async (ctx, { imageDataUrl, userDescription }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const visionModel = model && VISION_MODELS.has(model) ? model : DEFAULT_MODEL;

    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");

    const portionClause = userDescription
      ? ` The user says they have: "${userDescription}". If possible, estimate userPortionGrams for this description.`
      : "";

    const prompt = `This is a nutrition label image.${portionClause} Extract nutritional values per 100g (convert from per-serving using serving size if needed). Return ONLY a JSON object, no markdown:
{"name":"product name","caloriesPer100g":number,"proteinPer100g":number,"carbsPer100g":number,"fatPer100g":number,"servingSize":number_or_null,"servingUnit":"g","userPortionGrams":number_or_null}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: visionModel,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          }],
          max_tokens: 400,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Vision API error ${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty vision response");
      const result = parseJSON<any>(content, null);
      if (!result) throw new Error("Could not parse nutrition from image");
      return {
        name: result.name || "Scanned Product",
        caloriesPer100g: Number(result.caloriesPer100g) || 0,
        proteinPer100g: Number(result.proteinPer100g) || 0,
        carbsPer100g: Number(result.carbsPer100g) || 0,
        fatPer100g: Number(result.fatPer100g) || 0,
        servingSize: result.servingSize ? Number(result.servingSize) : undefined,
        servingUnit: result.servingUnit || "g",
        userPortionGrams: result.userPortionGrams ? Number(result.userPortionGrams) : undefined,
        source: "scan" as const,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("Vision request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
});

export const estimatePortion = action({
  args: {
    baseName: v.string(),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatPer100g: v.number(),
    servingSize: v.optional(v.number()),
    servingUnit: v.optional(v.string()),
    portionDescription: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const servingClause = args.servingSize
      ? `Serving size: ${args.servingSize}${args.servingUnit || "g"}.`
      : "";

    const prompt = `Product: ${args.baseName}
Nutrition per 100g: ${args.caloriesPer100g} cal, ${args.proteinPer100g}g protein, ${args.carbsPer100g}g carbs, ${args.fatPer100g}g fat.
${servingClause}
User portion description: "${args.portionDescription}"

Estimate the total grams the user consumed based on their description, then calculate exact macros from the per-100g data. Return ONLY a JSON object (no markdown, no explanation):
{"grams":number,"calories":number,"protein":number,"carbs":number,"fat":number}`;

    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    const result = parseJSON<any>(content, {});
    const ratio = (result.grams || 0) / 100;
    return {
      grams: result.grams || 0,
      calories: result.calories || Math.round(args.caloriesPer100g * ratio),
      protein: result.protein || Math.round(args.proteinPer100g * ratio * 10) / 10,
      carbs: result.carbs || Math.round(args.carbsPer100g * ratio * 10) / 10,
      fat: result.fat || Math.round(args.fatPer100g * ratio * 10) / 10,
    };
  },
});

export const calculateProfileMacros = action({
  args: {
    weight: v.number(),
    height: v.number(),
    age: v.number(),
    activityLevel: v.optional(v.string()),
  },
  handler: async (ctx, { weight, height, age, activityLevel }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const prompt = `Calculate optimal daily macronutrient targets for:
- Weight: ${weight}kg
- Height: ${height}cm
- Age: ${age}
- Activity Level: ${activityLevel || "moderate"}

Return ONLY a JSON object with these keys (numbers only, no text):
- calories: daily calorie target
- protein: grams of protein
- carbs: grams of carbs
- fat: grams of fat
- explanation: one sentence explaining the reasoning (max 15 words)`;

    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    const result = parseJSON<any>(content, {});
    if (!result.calories) {
      const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, intense: 1.9 };
      const tdee = Math.round(bmr * (multipliers[activityLevel || "moderate"] || 1.55));
      return { calories: tdee, protein: Math.round(weight * 2), carbs: Math.round((tdee * 0.45) / 4), fat: Math.round((tdee * 0.25) / 9), explanation: "Calculated using Mifflin-St Jeor equation." };
    }
    return { calories: result.calories || 2000, protein: result.protein || Math.round(weight * 2), carbs: result.carbs || 250, fat: result.fat || 65, explanation: result.explanation || "" };
  },
});

export const regenerateSuggestion = action({
  args: {
    mealName: v.string(),
    mealComponents: v.optional(v.string()),
    mealCalories: v.number(),
    mealProtein: v.number(),
    mealCarbs: v.number(),
    mealFat: v.number(),
    remainingCalories: v.optional(v.number()),
    remainingProtein: v.optional(v.number()),
    remainingCarbs: v.optional(v.number()),
    remainingFat: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required to use AI features.");
    }
    const userId = identity.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const budgetContext = args.remainingCalories != null
      ? `\nDaily remaining: ${args.remainingCalories} kcal, ${args.remainingProtein}g protein, ${args.remainingCarbs}g carbs, ${args.remainingFat}g fat.`
      : "";

    const prompt = `You are a professional nutritionist. Give ONE forward-looking sentence about what the user should focus on in their NEXT meal (not criticism of this meal).

Meal: "${args.mealName}"
Components: ${args.mealComponents || "unknown"}
Macros: ${args.mealCalories} kcal, ${args.mealProtein}g protein, ${args.mealCarbs}g carbs, ${args.mealFat}g fat${budgetContext}

Return ONLY a short JSON object: {"suggestion":"one forward-looking next-meal tip (max 25 words)"}`;

    const content = await callAI([{ role: "user", content: prompt }], 400, model, apiKey);
    const result = parseJSON<any>(content, { suggestion: "" });
    return { suggestion: result.suggestion || "" };
  },
});

export const getCoaches = query({
  args: {},
  handler: async () => {
    const list = Object.values(COACHES).map(({ id, name, tagline }) => ({ id, name, tagline }));
    return [{ id: "auto", name: "Auto", tagline: "Automatically route to the right coach" }, ...list];
  },
});

export const transcribe = action({
  args: { audio: v.string(), mimeType: v.optional(v.string()) },
  handler: async (_ctx, { audio, mimeType }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in Convex environment");

    const mime = mimeType || "audio/webm";
    const ext = mime === "audio/mp4" ? "mp4" : mime === "audio/wav" ? "wav" : "webm";

    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    formData.append("model", "whisper-large-v3-turbo");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") throw new Error("Groq transcription timed out after 30s");
      throw err;
    }
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Groq transcription error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { text?: string; error?: { message?: string } };
    if (data.error) throw new Error(`Groq error: ${data.error.message}`);
    if (!data.text) throw new Error("Groq returned empty transcription");
    return { transcript: data.text.trim() };
  },
});


/**
 * Homepage quick-input action.
 *
 * Detects intent in the user's message:
 *   - "meal" → returns parsed meal draft (no logging) for the UI to confirm
 *   - "workout" → returns parsed workout draft (no logging) for the UI to confirm
 *   - "question" → routes to chat coach and returns reply
 *
 * Two-tier response:
 *   - tier1Summary: short, concise — for the homepage reply slot (always under 25 words)
 *   - tier2Detail: full analysis with calories burned / next-meal suggestion / etc. — to be
 *     stored on the entry's `aiSuggestion` field after the user confirms the draft
 */
export const homepageInput = action({
  args: {
    message: v.string(),
    image: v.optional(v.string()),
    today: v.optional(v.string()),
  },
  handler: async (ctx, { message, image, today: todayArg }): Promise<
    | { kind: "meal"; draft: any; tier1Summary: string; tier2Detail: string }
    | { kind: "workout"; draft: any; tier1Summary: string; tier2Detail: string }
    | { kind: "reply"; reply: string; coachType: CoachType }
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = todayArg ?? new Date().toISOString().split("T")[0];

    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const settingsModel = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;

    // Step 1: Intent classification (use vision-capable model when image is present)
    const visionModel = settingsModel && VISION_MODELS.has(settingsModel) ? settingsModel : DEFAULT_MODEL;
    const intentModel = image ? visionModel : settingsModel;

    const intentSystem = `You are an intent classifier for a fitness/wellness app.
Given the user's message (and optional image), decide if they are:
  - "meal" — describing a meal they ate or are about to eat (food photos count)
  - "workout" — describing a workout they did
  - "question" — asking a question, seeking advice, chatting

Return ONLY a single word: meal, workout, or question.`;

    const intentMessages: AIMessage[] = [
      { role: "system", content: intentSystem },
      image
        ? {
            role: "user",
            content: [
              { type: "text", text: message || "Classify this image." },
              { type: "image_url", image_url: { url: image } },
            ],
          }
        : { role: "user", content: message },
    ];

    const intentRaw = await callAI(intentMessages, 8, intentModel, apiKey);
    const intent = intentRaw.toLowerCase().trim().replace(/[^a-z]/g, "").slice(0, 10);

    // ── Path A: meal ──
    if (intent.startsWith("meal")) {
      // Use AI to parse the meal description (with image if provided)
      let mealDescription = message;
      if (image && !message.trim()) {
        // Vision: describe the food in the image first
        const describePrompt = "Describe this food in 1-2 sentences (what it is, approximate portion). Be specific about ingredients you can see.";
        const describeMessages: AIMessage[] = [{
          role: "user",
          content: [
            { type: "text", text: describePrompt },
            { type: "image_url", image_url: { url: image } },
          ],
        }];
        mealDescription = await callAI(describeMessages, 200, visionModel, apiKey);
      }

      const parsed = await parseMealDescription(mealDescription, "unspecified", "", settingsModel, apiKey);
      const nutrition = await runNutritionEngine(ctx, parsed);

      // Tier 1: short summary
      const tier1 = `${parsed.name || "Meal"} — ~${nutrition.calories} kcal, ${Math.round(nutrition.protein)}g protein. Confirm to log.`;

      // Tier 2: detailed analysis (one fetch — async would be cleaner but blocking is fine here)
      const profile = await ctx.runQuery(internal.profile.getProfileForContext, { userId });
      const tier2Prompt = `Give a brief but specific analysis (3-4 sentences) of this meal. Focus on: macro balance, what's good, what could be added/swapped next time. Be encouraging.

Meal: ${parsed.name}
Macros: ${nutrition.calories} kcal, ${Math.round(nutrition.protein)}g protein, ${Math.round(nutrition.carbs)}g carbs, ${Math.round(nutrition.fat)}g fat
${profile?.calorieTarget ? `Daily targets: ${profile.calorieTarget} kcal, ${profile.proteinTarget}g protein` : ""}`;
      const tier2 = await callAI([{ role: "user", content: tier2Prompt }], 200, settingsModel, apiKey).catch(() => "");

      return {
        kind: "meal",
        draft: {
          kind: "meal",
          description: parsed.name || mealDescription,
          name: parsed.name,
          kcal: nutrition.calories,
          protein: Math.round(nutrition.protein),
          carbs: Math.round(nutrition.carbs),
          fat: Math.round(nutrition.fat),
          items: parsed.components ? parsed.components.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          components: parsed.components,
          mealType: parsed.mealType ?? "unspecified",
          time: parsed.time,
          aiSuggestion: parsed.aiSuggestion,
          confidence: nutrition.confidence,
          nutritionSource: nutrition.nutritionSource,
        },
        tier1Summary: tier1,
        tier2Detail: tier2,
      };
    }

    // ── Path B: workout ──
    if (intent.startsWith("workout") || intent.startsWith("exercise") || intent.startsWith("train")) {
      const metabolicProfile: any = await ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {});
      const profile = await ctx.runQuery(internal.profile.getProfileForContext, { userId });
      const userPhysique: UserPhysique | undefined = profile ? {
        weight: profile.weight,
        height: profile.height,
        age: profile.age,
        sex: profile.sex,
        fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
        metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
      } : undefined;

      const parsed = await parseWorkoutDescription(message, undefined, undefined, settingsModel, apiKey, userPhysique);

      const tier1 = `${parsed.name} — ${parsed.duration ?? "?"}, ~${parsed.caloriesBurned} kcal burned. Confirm to log.`;
      const tier2Prompt = `Give a brief specific analysis (3-4 sentences) of this workout. Focus on: training stimulus, what's good, recovery/protein needs, suggestion for next session. Be specific.

Workout: ${parsed.name}, ${parsed.duration ?? "?"}, intensity ${parsed.intensity}
Calories burned: ${parsed.caloriesBurned}
${parsed.exercises ? `Exercises: ${JSON.stringify(parsed.exercises).slice(0, 500)}` : ""}`;
      const tier2 = await callAI([{ role: "user", content: tier2Prompt }], 200, settingsModel, apiKey).catch(() => "");

      return {
        kind: "workout",
        draft: {
          kind: "workout",
          description: parsed.name,
          name: parsed.name,
          type: parsed.name,
          duration: parseDurationMinutes(parsed.duration ?? "30 min") || 30,
          kcal: parsed.caloriesBurned ?? 0,
          intensity: (parsed.intensity?.toLowerCase() === "high" ? "high" : parsed.intensity?.toLowerCase() === "low" ? "light" : "medium"),
          sets: parsed.sets,
          rationale: parsed.rationale,
          exercises: parsed.exercises,
          calorieResult: parsed.calorieResult,
        },
        tier1Summary: tier1,
        tier2Detail: tier2,
      };
    }

    // ── Path C: question — full chat coach response (no logging) ──
    const coachType: CoachType = classifyCoachType(message);
    const coach = getCoach(coachType);

    const [todayMealsList, todayWorkoutsList, profile] = await Promise.all([
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);
    const userName = identity.name ?? "Athlete";
    let context = `USER: ${userName}\n`;
    if (profile?.calorieTarget) context += `Calorie target: ${profile.calorieTarget}\n`;
    context += `Today: ${todayMealsList.length} meals, ${todayWorkoutsList.length} workouts logged.\n`;

    const replyMessages: AIMessage[] = [
      { role: "system", content: `${coach.systemPrompt}\n\n${context}\n\nKeep your reply concise — under 60 words. The user is on the homepage with limited space.` },
      image
        ? {
            role: "user",
            content: [
              { type: "text", text: message },
              { type: "image_url", image_url: { url: image } },
            ],
          }
        : { role: "user", content: message },
    ];

    const reply = await callAI(replyMessages, 250, image ? visionModel : settingsModel, apiKey);
    return { kind: "reply", reply, coachType };
  },
});

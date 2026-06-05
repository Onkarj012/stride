import { action, query, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getCoach, classifyCoachType, COACHES, behaviorSummary, toneInstruction, type CoachType } from "./coaches";
import { findBestMatch, AUTO_APPLY_MIN_LOGGED } from "./food_memory_match";
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
  "openai/gpt-5-mini",
  "anthropic/claude-3-opus", "anthropic/claude-3-sonnet", "anthropic/claude-3-haiku",
  "anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-haiku",
  "google/gemini-1.5-pro", "google/gemini-1.5-flash", "google/gemini-2.0-flash",
  "google/gemini-3.5-flash", "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "meta-llama/llama-3.2-11b-vision", "meta-llama/llama-3.2-90b-vision",
  "x-ai/grok-build-0.1",
]);

const NUTRITION_ACCURACY_RULES = `Nutrition accuracy rules:
- Extract portions before calories. Prefer explicit grams/ml/servings over generic meal-size guesses.
- If the user gives "bowl", "plate", "serving", "handful", "scoop", or "piece", convert to a realistic edible gram estimate and set confidence <= 0.65 unless the size is specified.
- Distinguish cooked vs dry weights. Cooked rice/pasta/oats are much lower kcal per 100g than dry.
- Include calorie-dense additions: oil, ghee, butter, cream, cheese, nuts, nut butter, avocado, sauces, dressings, sugar, honey.
- For Indian foods, include tadka/cooking oil unless explicitly oil-free; estimate conservatively but do not ignore it.
- Do not use restaurant/large portions unless the user says restaurant, takeaway, large, extra, or similar.
- Macro calories should be plausible: calories should roughly match protein*4 + carbs*4 + fat*9 within 25%.
- If key portion details are missing, put the missing fields in missing_fields and use a middle-of-range estimate, not an extreme low/high.`;

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

async function parseMealDescription(
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
      // Some ingredients unresolved → blend cautiously. The database total is
      // trustworthy for matched ingredients; the AI fallback is only a guardrail
      // for missing pieces, not an automatic override to a larger whole-meal guess.
      const unresolvedShare = Math.min(0.45, Math.max(0.15, unresolved.length / Math.max(ingredients.length, 1)));
      const aiMissingCalories = Math.max(0, aiCals - engine.calories_kcal) * unresolvedShare;
      finalCalories = engine.calories_kcal > 0 ? engine.calories_kcal + aiMissingCalories : aiCals;
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

export const parseOnboarding = action({
  args: { field: v.string(), text: v.string() },
  handler: async (ctx, { field, text }): Promise<Record<string, unknown>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });

    const SCHEMAS: Record<string, string> = {
      stats: `{"age": number|null, "weightKg": number|null, "heightCm": number|null, "sex": "male"|"female"|null, "bodyFat": number|null}. Convert lbs→kg (÷2.205), ft/in→cm. Example: "28yo male, 176lb, 5'10\\"" → {"age":28,"weightKg":79.8,"heightCm":177.8,"sex":"male","bodyFat":null}`,
      goal: `{"goal": one of "aggressive_loss"|"moderate_loss"|"mild_loss"|"maintain"|"recomp"|"lean_gain"|"muscle_gain"}. "lose fat fast"→aggressive_loss, "lose weight"→moderate_loss, "tone up / build muscle while losing fat"→recomp, "bulk / gain muscle"→muscle_gain, "lean bulk"→lean_gain, "stay the same"→maintain.`,
      work: `{"occupationType": "desk"|"mixed"|"standing"|"physical"|null, "workHoursPerDay": number|null, "lifestyleActivity": "sedentary"|"light"|"moderate"|"active"|null}. "office job 9 hours, lazy otherwise" → {"occupationType":"desk","workHoursPerDay":9,"lifestyleActivity":"sedentary"}`,
      training: `{"weeklyWorkouts": [{"type": one of "strength"|"run_slow"|"run_fast"|"cycling"|"hiit"|"yoga"|"swim"|"walk"|"sport", "durationMin": number, "sessionsPerWeek": number}]}. "lift 4x/week ~1h, run twice for 30min" → {"weeklyWorkouts":[{"type":"strength","durationMin":60,"sessionsPerWeek":4},{"type":"run_slow","durationMin":30,"sessionsPerWeek":2}]}`,
      diet: `{"dietaryPreference": "none"|"vegetarian"|"vegan"|"pescatarian"|"keto"|null, "allergies": string|null}. "veggie, allergic to peanuts and shellfish" → {"dietaryPreference":"vegetarian","allergies":"peanuts, shellfish"}`,
      name: `{"firstName": string}. Extract just the first name.`,
    };
    const schema = SCHEMAS[field];
    if (!schema) throw new Error(`Unknown field: ${field}`);

    const prompt = `Extract structured data from the user's message. Return ONLY a JSON object matching this schema, no prose:\n${schema}\n\nUser message: "${text}"\n\nUse null for anything not mentioned. Return only valid JSON.`;
    const content = await callAI(
      [{ role: "user", content: prompt }],
      300,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
    try {
      const match = content.match(/\{[\s\S]*\}/);
      return JSON.parse(match ? match[0] : content) as Record<string, unknown>;
    } catch {
      return {};
    }
  },
});
export const recipeInsight = action({
  args: {
    name: v.string(),
    perServing: v.object({ kcal: v.number(), p: v.number(), c: v.number(), f: v.number() }),
    ingredients: v.array(v.string()),
  },
  handler: async (ctx, { name, perServing, ingredients }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `You are a friendly nutrition coach. In 1-2 short sentences, give one specific, encouraging insight about this recipe — name a nutritional strength and (optionally) one small tweak. No preamble.\nRecipe: ${name}\nPer serving: ${perServing.kcal} kcal, ${perServing.p}g protein, ${perServing.c}g carbs, ${perServing.f}g fat\nIngredients: ${ingredients.join(", ")}`;
    return callAI(
      [{ role: "user", content: prompt }],
      140,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
  },
});

/** Frictionless recipe ingredient entry: parse a free-text ingredient list
 *  (natural portions, any units) into structured per-100g ingredients with an
 *  AI-estimated gram weight for each portion. One AI round-trip, no DB lookups. */
export const parseIngredients = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<Array<{ name: string; grams: number; caloriesPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number; source: string }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `You are a nutrition database. Parse this ingredient list (natural language, any units or portions) into structured JSON. For EACH ingredient: estimate the realistic edible weight in grams of the stated portion (e.g. "1 large banana"≈120, "1 tbsp olive oil"≈14, "2 eggs"≈100, "a handful of almonds"≈30, "1 cup cooked rice"≈195), and give standard per-100g macros. Return ONLY a JSON array, no prose:\n[{"name": string, "grams": number, "caloriesPer100g": number, "proteinPer100g": number, "carbsPer100g": number, "fatPer100g": number}]\n\nIngredients: "${text}"`;
    const content = await callAI(
      [{ role: "user", content: prompt }],
      700,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
    try {
      const match = content.match(/\[[\s\S]*\]/);
      const raw = JSON.parse(match ? match[0] : content) as any[];
      return raw
        .filter((r) => r && typeof r.name === "string" && r.name.trim())
        .map((r) => ({
          name: String(r.name).trim(),
          grams: Math.max(0, Number(r.grams) || 0),
          caloriesPer100g: Math.max(0, Number(r.caloriesPer100g) || 0),
          proteinPer100g: Math.max(0, Number(r.proteinPer100g) || 0),
          carbsPer100g: Math.max(0, Number(r.carbsPer100g) || 0),
          fatPer100g: Math.max(0, Number(r.fatPer100g) || 0),
          source: "ai",
        }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Malformed AI output parsing ingredients: ${message} - content: ${content}`);
    }
  },
});


/** Turn a free-text method into clean, ordered recipe steps. */
export const parseSteps = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<string[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId: identity.subject });
    const prompt = `Turn this cooking method into clear, concise, ordered recipe steps. One action per step, imperative voice, no numbering or prose. Return ONLY a JSON array of strings.\n\nMethod: "${text}"`;
    const content = await callAI(
      [{ role: "user", content: prompt }],
      500,
      settings?.openRouterModel ?? undefined,
      settings?.openRouterKey ?? undefined,
    );
    try {
      const match = content.match(/\[[\s\S]*\]/);
      const raw = JSON.parse(match ? match[0] : content) as any[];
      return raw.map((s) => String(s).trim()).filter(Boolean);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Malformed AI output parsing steps: ${message} - content: ${content}`);
    }
  },
});


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
    const prompt = `Estimate the nutritional values for this meal: "${mealName}".

${NUTRITION_ACCURACY_RULES}

Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
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
        structuredSets: parsedData.exercises ? JSON.stringify(parsedData.exercises) : undefined,
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
        name: parsed.name, sets: parsed.sets, duration: parsed.duration,
        intensity: parsed.intensity, exercises: parsed.exercises, rationale: parsed.rationale,
        caloriesBurned: parsed.caloriesBurned,
        structuredSets: parsed.exercises ? JSON.stringify(parsed.exercises) : undefined,
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
    const [profile, todayMeals, todayWorkouts, recentCals, settings, behavior, topMemories, lastSleep, patterns, topRecipes, topWorkoutMemory, userIngredients] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
      ctx.runQuery(internal.meals.getRecentCalories, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.behavior.getBehaviorProfileForContext, { userId }),
      ctx.runQuery(internal.food_memory.getTopForContext, { userId, limit: 8 }),
      ctx.runQuery(internal.wellness.getLastSleepForContext, { userId }),
      ctx.runQuery(internal.patterns.getPatternsForContext, { userId }),
      ctx.runQuery(internal.recipes.getTopRecipesForContext, { userId }),
      ctx.runQuery(internal.workout_memory.getTopForContext, { userId, limit: 6 }),
      ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
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
You can log multiple items directly when the user describes them. Append log blocks at the very end of your response.

Today's date is ${today}. Each log block can include an optional "date" field (YYYY-MM-DD). If the user says "yesterday", "2 days ago", or names a specific past day, set the date accordingly. Default is today.

For meals: ⟦LOG_MEAL⟧{"description":"full meal description","mealType":"breakfast|lunch|dinner|snack","time":"HH:MM or empty string","date":"YYYY-MM-DD (optional)"}⟦/LOG_MEAL⟧
For workouts: ⟦LOG_WORKOUT⟧{"description":"full workout description with exercises, sets, reps, weights","date":"YYYY-MM-DD (optional)"}⟦/LOG_WORKOUT⟧
For sleep: ⟦LOG_SLEEP⟧{"hours":6.5,"quality":"poor|ok|good|great","date":"YYYY-MM-DD (optional)"}⟦/LOG_SLEEP⟧
For water: ⟦LOG_WATER⟧{"ml":500,"date":"YYYY-MM-DD (optional)"}⟦/LOG_WATER⟧
For mood: ⟦LOG_MOOD⟧{"rating":3,"note":"optional note","date":"YYYY-MM-DD (optional)"}⟦/LOG_MOOD⟧
For steps: ⟦LOG_STEPS⟧{"count":8000,"date":"YYYY-MM-DD (optional)"}⟦/LOG_STEPS⟧

Rules:
- Append ALL relevant log blocks when the user reports multiple activities (e.g. meal + water → append both blocks)
- ONLY append log blocks when the user is clearly reporting what they did/ate/slept
- If user says "yesterday I had X" → use yesterday's date in the log block
- Sleep descriptions ("slept X hours", "went to bed at X", "woke up at Y") → LOG_SLEEP, NOT LOG_WORKOUT
- Your message text (before the blocks) should confirm what you logged AND mention the date if it's not today
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

    // Detect coach (keyword routing, biased toward the user's preferred coach)
    let detectedCoach: CoachType = (coachType as CoachType) ?? "overall";
    if (!coachType || coachType === "auto") detectedCoach = classifyCoachType(message, behavior?.preferredCoach);
    const coach = getCoach(detectedCoach);

    // Known food memory context
    if (Array.isArray(topMemories) && topMemories.length > 0) {
      contextBlock += `\nUSER'S KNOWN FOODS (from memory — use these when the user mentions their usual meals):\n`;
      for (const m of topMemories as any[]) {
        contextBlock += `- ${m.name}: ~${m.kcal} kcal, P:${m.protein}g C:${m.carbs}g F:${m.fat}g (logged ${m.timesLogged}×${m.components ? `, ingredients: ${m.components}` : ""})\n`;
      }
    }

    // Personal ingredient database
    if (Array.isArray(userIngredients) && userIngredients.length > 0) {
      contextBlock += `\nUSER'S PERSONAL INGREDIENTS (use these instead of generic values when estimating nutrition):\n`;
      for (const ing of userIngredients as any[]) {
        const macros = [
          ing.caloriesPer100g != null ? `${ing.caloriesPer100g} kcal/100g` : null,
          ing.proteinPer100g != null ? `${ing.proteinPer100g}g P/100g` : null,
          ing.fatPer100g != null ? `${ing.fatPer100g}g F/100g` : null,
        ].filter(Boolean).join(", ");
        contextBlock += `- ${ing.name}: ${macros || "custom"}${ing.notes ? ` (${ing.notes})` : ""}\n`;
      }
    }

    // Known workout memory
    if (Array.isArray(topWorkoutMemory) && topWorkoutMemory.length > 0) {
      contextBlock += `\nUSER'S KNOWN WORKOUTS (from memory):\n`;
      for (const w of topWorkoutMemory as any[]) {
        const parts = [`${w.name} (logged ${w.timesLogged}×)`];
        if (w.intensity) parts.push(w.intensity);
        if (w.durationMin) parts.push(`~${Math.round(w.durationMin)} min`);
        if (w.caloriesBurned) parts.push(`~${Math.round(w.caloriesBurned)} kcal`);
        contextBlock += `- ${parts.join(", ")}\n`;
      }
    }

    // Saved recipes
    if (Array.isArray(topRecipes) && topRecipes.length > 0) {
      contextBlock += `\nUSER'S SAVED RECIPES:\n`;
      for (const r of topRecipes as any[]) {
        contextBlock += `- ${r.name} (${r.servings} servings): ${r.kcalPerServing} kcal/serving, P:${r.proteinPerServing}g C:${r.carbsPerServing}g F:${r.fatPerServing}g\n`;
      }
    }

    // Last night's sleep (Phase 3: cross-domain)
    if (lastSleep) {
      const sleepLabel = (lastSleep as any).date === today ? "Today" : "Last night";
      contextBlock += `\nSLEEP: ${sleepLabel} — ${(lastSleep as any).hours}h, quality: ${(lastSleep as any).quality}\n`;
    }

    // Behavioral patterns (Phase 1b)
    if (Array.isArray(patterns) && patterns.length > 0) {
      contextBlock += `\nBEHAVIORAL PATTERNS (last 28 days):\n`;
      for (const p of patterns as string[]) contextBlock += `- ${p}\n`;
    }

    // Behavioral memory + tone layer (Phase 3+4: sleep + acceptance rate)
    const behaviorLine = behaviorSummary({ ...(behavior ?? {}), acceptRate: (behavior as any)?.acceptRate ?? null });
    const toneLine = toneInstruction(settings?.coachingStyle, {
      sleepHours: lastSleep ? (lastSleep as any).hours : undefined,
      sleepQuality: lastSleep ? (lastSleep as any).quality : undefined,
      acceptRate: (behavior as any)?.acceptRate ?? undefined,
    });
    const personaSuffix = [behaviorLine, toneLine].filter(Boolean).join("\n");

    const messages: AIMessage[] = [
      { role: "system", content: `${coach.systemPrompt}${personaSuffix ? `\n\n${personaSuffix}` : ""}\n\n${contextBlock}${loggingPrompt}` },
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

    // Parse log blocks — support multiple items and new types
    let cleanReply = reply;
    const loggedItems: any[] = [];

    // Strip all log blocks from the reply text
    cleanReply = reply
      .replace(/⟦LOG_MEAL⟧[\s\S]*?⟦\/LOG_MEAL⟧/g, "")
      .replace(/⟦LOG_WORKOUT⟧[\s\S]*?⟦\/LOG_WORKOUT⟧/g, "")
      .replace(/⟦LOG_SLEEP⟧[\s\S]*?⟦\/LOG_SLEEP⟧/g, "")
      .replace(/⟦LOG_WATER⟧[\s\S]*?⟦\/LOG_WATER⟧/g, "")
      .replace(/⟦LOG_MOOD⟧[\s\S]*?⟦\/LOG_MOOD⟧/g, "")
      .replace(/⟦LOG_STEPS⟧[\s\S]*?⟦\/LOG_STEPS⟧/g, "")
      .trim();

    // Meal
    const mealMatches = [...reply.matchAll(/⟦LOG_MEAL⟧([\s\S]*?)⟦\/LOG_MEAL⟧/g)];
    for (const mealMatch of mealMatches) {
      try {
        const logData = JSON.parse(mealMatch[1].trim());
        const targetDate = typeof logData.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(logData.date) ? logData.date : today;
        const parsed = await parseMealDescription(logData.description || message, logData.mealType || "unspecified", logData.time || "", model, apiKey);
        const nutrition = await runNutritionEngine(ctx, parsed);
        const finalStructuredItems = nutrition.ingredientBreakdown ? JSON.stringify(nutrition.ingredientBreakdown.items) : undefined;
        const finalIngredientBreakdown = nutrition.ingredientBreakdown ? JSON.stringify(nutrition.ingredientBreakdown) : undefined;
        const mealId = await ctx.runMutation(internal.meals.addMealFromAI, {
          userId, date: targetDate,
          name: parsed.name, calories: nutrition.calories, protein: nutrition.protein,
          carbs: nutrition.carbs, fat: nutrition.fat, time: parsed.time,
          aiSuggestion: parsed.aiSuggestion, mealType: parsed.mealType, components: parsed.components,
          confidence: nutrition.confidence, nutritionSource: nutrition.nutritionSource,
          structuredItems: finalStructuredItems, ingredientBreakdown: finalIngredientBreakdown,
        });
        loggedItems.push({ type: "meal", data: { _id: mealId, ...parsed, calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat } });
      } catch (err) { console.error("Failed to log meal from AI:", err); }
    }

    // Workout
    const workoutMatches = [...reply.matchAll(/⟦LOG_WORKOUT⟧([\s\S]*?)⟦\/LOG_WORKOUT⟧/g)];
    for (const workoutMatch of workoutMatches) {
      try {
        const logData = JSON.parse(workoutMatch[1].trim());
        const targetDate = typeof logData.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(logData.date) ? logData.date : today;
        const metabolicProfile: any = await ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {});
        const userPhysique: UserPhysique | undefined = profile ? {
          weight: profile.weight, height: profile.height, age: profile.age, sex: profile.sex,
          fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
          metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
        } : undefined;
        const parsed = await parseWorkoutDescription(logData.description || message, undefined, undefined, model, apiKey, userPhysique);
        const calorieFields = parsed.calorieResult ? {
          calorieConfidence: parsed.calorieResult.confidence, calorieRangeLow: parsed.calorieResult.range_low,
          calorieRangeHigh: parsed.calorieResult.range_high, calorieBreakdown: JSON.stringify(parsed.calorieResult.breakdown), calculationVersion: 1,
        } : {};
        const workoutId = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
          userId, date: targetDate, name: parsed.name, sets: parsed.sets, duration: parsed.duration,
          intensity: parsed.intensity, exercises: parsed.exercises, rationale: parsed.rationale,
          caloriesBurned: parsed.caloriesBurned,
          structuredSets: parsed.exercises ? JSON.stringify(parsed.exercises) : undefined,
          ...calorieFields,
        });
        loggedItems.push({ type: "workout", data: { _id: workoutId, ...parsed } });
      } catch (err) { console.error("Failed to log workout from AI:", err); }
    }

    // Sleep
    const sleepMatches = [...reply.matchAll(/⟦LOG_SLEEP⟧([\s\S]*?)⟦\/LOG_SLEEP⟧/g)];
    for (const sleepMatch of sleepMatches) {
      try {
        const logData = JSON.parse(sleepMatch[1].trim());
        const targetDate = typeof logData.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(logData.date) ? logData.date : today;
        const hours = Math.max(0.5, Math.min(24, Number(logData.hours) || 7));
        const quality = ["poor", "ok", "good", "great"].includes(logData.quality) ? logData.quality : "ok";
        const sleepId = await ctx.runMutation(api.wellness.upsertSleep, { hours, quality, date: targetDate });
        loggedItems.push({ type: "sleep", data: { _id: sleepId, hours, quality } });
      } catch (err) { console.error("Failed to log sleep from AI:", err); }
    }

    // Water
    const waterMatches = [...reply.matchAll(/⟦LOG_WATER⟧([\s\S]*?)⟦\/LOG_WATER⟧/g)];
    for (const waterMatch of waterMatches) {
      try {
        const logData = JSON.parse(waterMatch[1].trim());
        const targetDate = typeof logData.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(logData.date) ? logData.date : today;
        const ml = Math.max(50, Math.min(5000, Number(logData.ml) || 250));
        const time = new Date().toTimeString().slice(0, 5);
        const waterId = await ctx.runMutation(api.wellness.addWater, { ml, date: targetDate, time });
        loggedItems.push({ type: "water", data: { _id: waterId, ml } });
      } catch (err) { console.error("Failed to log water from AI:", err); }
    }

    // Mood
    const moodMatches = [...reply.matchAll(/⟦LOG_MOOD⟧([\s\S]*?)⟦\/LOG_MOOD⟧/g)];
    for (const moodMatch of moodMatches) {
      try {
        const logData = JSON.parse(moodMatch[1].trim());
        const targetDate = typeof logData.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(logData.date) ? logData.date : today;
        const rating = Math.max(1, Math.min(5, Number(logData.rating) || 3)) as 1|2|3|4|5;
        const time = new Date().toTimeString().slice(0, 5);
        const moodId = await ctx.runMutation(api.wellness.addMood, { rating, date: targetDate, time, note: logData.note });
        loggedItems.push({ type: "mood", data: { _id: moodId, rating } });
      } catch (err) { console.error("Failed to log mood from AI:", err); }
    }

    // Steps
    const stepsMatches = [...reply.matchAll(/⟦LOG_STEPS⟧([\s\S]*?)⟦\/LOG_STEPS⟧/g)];
    for (const stepsMatch of stepsMatches) {
      try {
        const logData = JSON.parse(stepsMatch[1].trim());
        const targetDate = typeof logData.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(logData.date) ? logData.date : today;
        const count = Math.max(0, Number(logData.count) || 0);
        const stepsId = await ctx.runMutation(api.wellness.upsertSteps, { count, date: targetDate });
        loggedItems.push({ type: "steps", data: { _id: stepsId, count } });
      } catch (err) { console.error("Failed to log steps from AI:", err); }
    }

    const loggedItem = loggedItems.length === 1 ? loggedItems[0] : loggedItems.length > 1 ? { type: "multiple", items: loggedItems } : null;

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
    return runDailyInsights(ctx, identity.subject, date);
  },
});

export const generateDailyInsightsForUser = internalAction({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) => runDailyInsights(ctx, userId, date),
});

/** Cron: fan out daily insights to each active user via the scheduler. */
export const cronDailyInsights = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.runQuery(internal.behavior.listActiveUsers, { days: 3 })) as string[];
    for (const userId of users) {
      // Derive the user's local date from their stored timezone offset.
      const settings = (await ctx.runQuery(internal.profile.getSettingsForContext, { userId })) as any;
      const offsetMin: number = settings?.timezoneOffsetMinutes ?? 0;
      const localDate = new Date(Date.now() - offsetMin * 60_000).toISOString().slice(0, 10);
      await ctx.scheduler.runAfter(0, internal.ai.generateDailyInsightsForUser, { userId, date: localDate });
    }
    return { users: users.length };
  },
});

async function runDailyInsights(ctx: any, userId: string, date: string) {
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
}

export const generateWeeklySummary = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return runWeeklySummary(ctx, identity.subject);
  },
});

export const generateWeeklySummaryForUser = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => runWeeklySummary(ctx, userId),
});

/** Cron: fan out weekly summaries to each active user via the scheduler. */
export const cronWeeklySummary = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = (await ctx.runQuery(internal.behavior.listActiveUsers, { days: 7 })) as string[];
    for (const userId of users) {
      await ctx.scheduler.runAfter(0, internal.ai.generateWeeklySummaryForUser, { userId });
    }
    return { users: users.length };
  },
});

async function runWeeklySummary(ctx: any, userId: string) {
    const _settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const offsetMin: number = _settings?.timezoneOffsetMinutes ?? 0;
    const localNow = new Date(Date.now() - offsetMin * 60_000);
    const day = localNow.getUTCDay();
    const monday = new Date(localNow);
    monday.setUTCDate(localNow.getUTCDate() - day + (day === 0 ? -6 : 1));
    const weekStart = monday.toISOString().slice(0, 10);

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
}

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

    const prompt = `This is a nutrition label image.${portionClause}

${NUTRITION_ACCURACY_RULES}

Extract nutritional values per 100g. If the label is per serving, convert using the serving size; if serving size is unclear, keep servingSize null and avoid guessing userPortionGrams. Return ONLY a JSON object, no markdown:
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
 * Uses the LLM to extract ALL loggable items from a single message.
 * Returns an array of drafts (meal, workout, sleep, water, mood, steps)
 * plus a tier-1 summary and tier-2 detail for the UI.
 *
 * Example: "Had chicken salad and drank 1L of water" → [meal draft, water draft]
 * Example: "Slept 6.5h last night, woke up at 7" → [sleep draft]
 */
/**
 * Heuristic: detect whether a free-text message looks like a log report
 * vs. a question. Used as a pre-check AND as a sanity check on the LLM's
 * intent classification — fixes the "coin flip" where the LLM occasionally
 * mis-classifies a meal log as a question and skips the confirm modal.
 */
const QUESTION_RE = /(\?$|\?\s|\b(how|what|why|when|where|which|who|should|can you|could you|will|would|do you|did i|am i|are you|tell me|explain|recommend|suggest|advice|tip|help me|do i)\b)/i;
const LOG_RE = new RegExp([
  // First-person past/present action + food/drink/workout
  "\\b(i|i'?ve|i've|just)\\s+(had|ate|drank|consumed|finished|did|completed|ran|walked|jogged|biked|cycled|lifted|swam|hit|trained|crushed|knocked out|got in|squeezed in)\\b",
  // Direct activity reports without subject
  "\\b(had|ate|drank|finished|did|ran|walked|jogged|biked|cycled|lifted|swam)\\b\\s+(a|an|some|my|the|\\d+|breakfast|lunch|dinner|snack)",
  // Sleep reports
  "\\bslept\\b|\\bwent to bed\\b|\\bwoke up\\b|\\bjust woke\\b|\\bbed time\\b",
  // Workout indicators
  "\\b(workout|workouts|reps?|sets?|miles?|km|kilometers?|minutes? of)\\b",
  // Quick logging shortcuts
  "^(log\\s+|logged\\s+|track\\s+|add\\s+|record\\s+)",
  // Common food/drink words paired with quantity-ish hints
  "\\b(\\d+\\s*(g|grams?|oz|ml|l|cups?|tbsp|tsp|pieces?|slices?|servings?))\\b",
  // Mood: "feeling X / mood Y"
  "\\b(feeling|mood)\\b",
  // Steps and water
  "\\b(\\d{2,}\\s*steps|\\d+\\s*ml|\\d+\\s*l(itres?)?\\s+water|\\d+\\s*glasses?)\\b",
].join("|"), "i");

const FOOD_WORD_RE = /\b(milk|whey|biscuit|biscuits|marie|rice|roti|chapati|bread|oats|egg|eggs|chicken|paneer|dal|curd|yogurt|banana|apple|snack|meal|breakfast|lunch|dinner|food|eat|eating)\b/i;
const FOOD_ESTIMATE_RE = /\b(how many calories|how much calories|calorie|calories|kcal|macros?|estimate|can i (eat|have|take)|should i (eat|have|take)|would .* fit|might have|planning to have)\b/i;

function looksLikeLog(message: string): boolean {
  const m = message.trim();
  if (m.length === 0) return false;
  if (QUESTION_RE.test(m)) return false;
  return LOG_RE.test(m);
}

function looksLikeFoodEstimate(message: string): boolean {
  return FOOD_WORD_RE.test(message) && FOOD_ESTIMATE_RE.test(message);
}

function extractUserMacros(message: string): { calories?: number; protein?: number; carbs?: number; fat?: number } {
  const text = message.toLowerCase();
  const macros: { calories?: number; protein?: number; carbs?: number; fat?: number } = {};
  const kcal = text.match(/(?:around|about|approx(?:imately)?\s*)?(\d{2,4})\s*(?:kcal|calories|cals|cal)\b/);
  if (kcal) macros.calories = Number(kcal[1]);
  const protein = text.match(/(\d{1,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?(?:protein|prot|p)\b|\bprotein\s*(?:is|:|=)?\s*(\d{1,3}(?:\.\d+)?)/);
  if (protein) macros.protein = Number(protein[1] ?? protein[2]);
  const carbs = text.match(/(\d{1,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?(?:carbs?|c)\b|\bcarbs?\s*(?:is|:|=)?\s*(\d{1,3}(?:\.\d+)?)/);
  if (carbs) macros.carbs = Number(carbs[1] ?? carbs[2]);
  const fat = text.match(/(\d{1,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?(?:fat|f)\b|\bfat\s*(?:is|:|=)?\s*(\d{1,3}(?:\.\d+)?)/);
  if (fat) macros.fat = Number(fat[1] ?? fat[2]);
  return macros;
}

function applyUserMacros(draft: any, userMacros: { calories?: number; protein?: number; carbs?: number; fat?: number }) {
  const engineCalories = Number(draft.kcal) || 0;
  const userCalories = userMacros.calories;
  const calorieDelta = userCalories != null ? Math.abs(userCalories - engineCalories) : 0;
  const calorieConflict = userCalories != null && calorieDelta > 150 && calorieDelta / Math.max(engineCalories, 1) > 0.3;
  const macroCalories =
    (userMacros.protein ?? draft.protein ?? 0) * 4 +
    (userMacros.carbs ?? draft.carbs ?? 0) * 4 +
    (userMacros.fat ?? draft.fat ?? 0) * 9;
  const macroImpossible = userCalories != null && macroCalories > 0 && Math.abs(macroCalories - userCalories) > Math.max(120, userCalories * 0.35);

  const userDraft = {
    ...draft,
    kcal: userMacros.calories ?? draft.kcal,
    protein: userMacros.protein ?? draft.protein,
    carbs: userMacros.carbs ?? draft.carbs,
    fat: userMacros.fat ?? draft.fat,
    nutritionSource: calorieConflict || macroImpossible ? "macro_conflict" : "user_provided",
    engineEstimate: {
      kcal: draft.kcal,
      protein: draft.protein,
      carbs: draft.carbs,
      fat: draft.fat,
    },
  };

  return {
    draft: userDraft,
    conflict: calorieConflict || macroImpossible,
    reason: calorieConflict
      ? `Your calorie number differs from my estimate by ${Math.round(calorieDelta)} kcal.`
      : macroImpossible
        ? "The calories and macro grams do not line up cleanly."
        : "",
  };
}

export const homepageInput = action({
  args: {
    message: v.string(),
    image: v.optional(v.string()),
    today: v.optional(v.string()),
    sessionId: v.optional(v.id("chat_sessions")),
  },
  handler: async (ctx, { message, image, today: todayArg, sessionId }): Promise<{
    drafts: any[];
    tier1Summary: string;
    tier2Detail: string;
    isQuestion: boolean;
    actions?: any[];
    reply?: string;
    coachType?: CoachType;
    sessionId?: any;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = todayArg ?? new Date().toISOString().split("T")[0];

    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const settingsModel = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const visionModel = settingsModel && VISION_MODELS.has(settingsModel) ? settingsModel : DEFAULT_MODEL;
    const intentModel = image ? visionModel : settingsModel;

    // Make sure we have a homepage session to persist into
    const activeSessionId = sessionId
      ?? (await ctx.runMutation(internal.chat.getOrCreateHomepageSession, { userId, date: today }));

    // Save user message immediately
    await ctx.runMutation(internal.chat.addMessage, {
      userId,
      sessionId: activeSessionId,
      role: "user",
      content: message,
    });

    // Phase 5: MemoryAgent — fire-and-forget fact extraction (does not block response)
    ctx.runAction(internal.agents.runMemoryAgentAction, {
      userId, message, today,
      model: settings?.openRouterModel ?? undefined,
      apiKey: settings?.openRouterKey ?? undefined,
    }).catch(() => {});

    // Heuristic pre-check
    const estimateMode = looksLikeFoodEstimate(message);
    const userMacros = extractUserMacros(message);
    const hasUserMacros = Object.values(userMacros).some((v) => v != null);
    const heuristicSaysLog = !!image || looksLikeLog(message) || estimateMode;

    // Step 1: Extract ALL loggable items from the message in one LLM call.
    const yesterdayStr = new Date(new Date(today).getTime() - 86400000).toISOString().split("T")[0];
    const twoDaysAgoStr = new Date(new Date(today).getTime() - 2 * 86400000).toISOString().split("T")[0];
    const extractSystem = `You are a wellness tracking assistant. Extract ALL loggable items from the user's message.

Today's date is ${today}.

Return a JSON object:
{
  "isQuestion": boolean,
  "items": [
    {
      "type": "meal" | "workout" | "sleep" | "water" | "mood" | "steps",
      "description": "what the user said about this item (verbatim chunk)",
      "date": "YYYY-MM-DD"
    }
  ]
}

CRITICAL CLASSIFICATION RULES:
- "isQuestion" is TRUE only when the user is asking a question, requesting advice, or chatting WITHOUT mentioning anything they did/ate/drank/slept.
- ANY mention of food/drink consumed, exercise performed, sleep, mood, or steps is a LOG report — set isQuestion=false and add an item.
- If the user reports activities AND asks a question, set isQuestion=false and still add the items (we'll handle the question separately).
- "I had X" / "I ate X" / "just had X" / "had X for breakfast" / "X for lunch/dinner/snack" → meal log, isQuestion=false
- "I drank X" / "X glasses of water" / "Xml of water" / "had Xl of water" → water log, isQuestion=false
- "Did/ran/walked/biked/lifted X" / "30 min run" / "5km run" / "leg day" → workout log, isQuestion=false
- A list of exercises (e.g. "declined press: ..., incline press: ..., pec fly: ...") = ONE workout item, not multiple. Combine all into a single workout description.
- "Slept X" / "went to bed at X" / "woke up at Y" → sleep log, isQuestion=false
- "Feeling X/Y" / "mood is X" / "X out of 5" → mood log, isQuestion=false
- "X steps" / "walked X steps" → steps log, isQuestion=false
- Pure questions ("how am I doing?", "what should I eat?", "explain X") → isQuestion=true, items=[]
- Food estimate questions ("how many calories is X?", "can I have X?", "would X fit?") → isQuestion=false and add a meal item, but the app may ask before logging.

Date inference rules:
- "yesterday" → ${yesterdayStr}
- "2 days ago" → ${twoDaysAgoStr}
- "last night" for SLEEP → ${today} (the wake-up day)
- "last night" for MEAL/WORKOUT → ${yesterdayStr}
- "this morning", "today", no day mentioned → ${today}
- For SLEEP entries: the date is the wake-up day, so "slept 6h last night" → ${today}

Examples (assume today=${today}):
- USER: "I had chicken salad for lunch"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "chicken salad for lunch", "date": "${today}"}]}
- USER: "had pizza"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "pizza", "date": "${today}"}]}
- USER: "Yesterday I had pizza for dinner"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "pizza for dinner", "date": "${yesterdayStr}"}]}
- USER: "Did a 30 min run and drank a litre of water"
  → {"isQuestion": false, "items": [{"type": "workout", "description": "30 min run", "date": "${today}"},{"type": "water", "description": "1 litre of water", "date": "${today}"}]}
- USER: "Slept 7h last night"
  → {"isQuestion": false, "items": [{"type": "sleep", "description": "slept 7h", "date": "${today}"}]}
- USER: "How am I doing today?"
  → {"isQuestion": true, "items": []}
- USER: "Can I have 200ml milk, 3 biscuits, and whey? How many calories?"
  → {"isQuestion": false, "items": [{"type": "meal", "description": "200ml milk, 3 biscuits, and whey", "date": "${today}"}]}

Sleep descriptions like "slept X hours", "went to bed at X", "woke up at Y" are type="sleep", NOT "workout".
Return ONLY valid JSON, no markdown.`;

    const extractMessages: AIMessage[] = [
      { role: "system", content: extractSystem },
      image
        ? { role: "user", content: [{ type: "text", text: message || "What do you see?" }, { type: "image_url", image_url: { url: image } }] }
        : { role: "user", content: message },
    ];

    const extractRaw = await callAI(extractMessages, 400, intentModel, apiKey);
    let extracted = parseJSON<{ isQuestion: boolean; items: { type: string; description: string; date?: string }[] }>(
      extractRaw,
      { isQuestion: true, items: [] },
    );

    // Sanity check: if our heuristic strongly suggests this is a log but the LLM
    // returned isQuestion=true with no items, force a second extraction pass.
    if (heuristicSaysLog && (extracted.isQuestion || (extracted.items?.length ?? 0) === 0)) {
      const forcePrompt = `The user message below IS a log report (food, drink, workout, sleep, mood, or steps).
Today's date is ${today}.
Extract every item as JSON. NEVER return isQuestion=true here.

USER MESSAGE:
"""
${message}
"""

Return ONLY:
{"isQuestion": false, "items": [{"type":"meal|workout|sleep|water|mood|steps","description":"...","date":"YYYY-MM-DD"}]}`;
      const forcedRaw = await callAI([{ role: "user", content: forcePrompt }], 300, intentModel, apiKey).catch(() => "");
      if (forcedRaw) {
        const forced = parseJSON<{ isQuestion: boolean; items: { type: string; description: string; date?: string }[] }>(
          forcedRaw,
          { isQuestion: true, items: [] },
        );
        if (forced.items && forced.items.length > 0) {
          extracted = { isQuestion: false, items: forced.items };
        }
      }
    }

    // Validate date strings — fall back to today if invalid
    const isValidDate = (d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const allowedTypes = new Set(["meal", "workout", "sleep", "water", "mood", "steps"]);
    extracted.items = (extracted.items ?? []).filter((it) => allowedTypes.has(it.type));
    for (const item of extracted.items) {
      if (!isValidDate(item.date)) item.date = today;
    }

    // If it's a question, route to chat coach (with chat history)
    if (estimateMode && (extracted.isQuestion || extracted.items.length === 0)) {
      extracted = { isQuestion: false, items: [{ type: "meal", description: message, date: today }] };
    }

    if (extracted.isQuestion || extracted.items.length === 0) {
      const coachType: CoachType = classifyCoachType(message);
      const coach = getCoach(coachType);
      const [todayMealsList, todayWorkoutsList, profile, history, topMemories, lastSleepQ, patternsQ, topRecipesQ, topWkMemQ, behaviorQ, settingsQ, userIngredientsQ] = await Promise.all([
        ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
        ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
        ctx.runQuery(internal.profile.getProfileForContext, { userId }),
        ctx.runQuery(internal.chat.getMessagesForContext, { userId, sessionId: activeSessionId }),
        ctx.runQuery(internal.food_memory.getTopForContext, { userId, limit: 6 }),
        ctx.runQuery(internal.wellness.getLastSleepForContext, { userId }),
        ctx.runQuery(internal.patterns.getPatternsForContext, { userId }),
        ctx.runQuery(internal.recipes.getTopRecipesForContext, { userId, limit: 5 }),
        ctx.runQuery(internal.workout_memory.getTopForContext, { userId, limit: 4 }),
        ctx.runQuery(internal.behavior.getBehaviorProfileForContext, { userId }),
        ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
        ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
      ]);
      const userName = identity.name ?? "Athlete";
      let context = `USER: ${userName}\n`;
      if (profile?.calorieTarget) context += `Calorie target: ${profile.calorieTarget}\n`;
      if (profile?.proteinTarget) context += `Protein target: ${profile.proteinTarget}g\n`;
      if (profile?.dietaryPreference && profile.dietaryPreference !== "none") {
        context += `Diet: ${profile.dietaryPreference}\n`;
      }
      context += `Today: ${todayMealsList.length} meals, ${todayWorkoutsList.length} workouts logged.\n`;
      if (Array.isArray(topMemories) && topMemories.length > 0) {
        context += `Known foods: ${(topMemories as any[]).map((m: any) => `${m.name} (~${m.kcal} kcal)`).join(", ")}\n`;
      }
      if (Array.isArray(topRecipesQ) && topRecipesQ.length > 0) {
        context += `Saved recipes: ${(topRecipesQ as any[]).map((r: any) => `${r.name} (${r.kcalPerServing} kcal/srv)`).join(", ")}\n`;
      }
      if (Array.isArray(topWkMemQ) && topWkMemQ.length > 0) {
        context += `Known workouts: ${(topWkMemQ as any[]).map((w: any) => `${w.name}`).join(", ")}\n`;
      }
      if (Array.isArray(userIngredientsQ) && userIngredientsQ.length > 0) {
        context += `Personal ingredients: ${(userIngredientsQ as any[]).map((i: any) => {
          const k = i.caloriesPer100g != null ? `${i.caloriesPer100g} kcal/100g` : "custom";
          return `${i.name} (${k})`;
        }).join(", ")}\n`;
      }
      if (lastSleepQ) {
        context += `Last sleep: ${(lastSleepQ as any).hours}h, ${(lastSleepQ as any).quality}\n`;
      }
      if (Array.isArray(patternsQ) && patternsQ.length > 0) {
        context += `Patterns: ${(patternsQ as string[]).join(" | ")}\n`;
      }

      const toneOpts = {
        sleepHours: lastSleepQ ? (lastSleepQ as any).hours : undefined,
        sleepQuality: lastSleepQ ? (lastSleepQ as any).quality : undefined,
        acceptRate: (behaviorQ as any)?.acceptRate ?? undefined,
      };
      const tone = toneInstruction(settingsQ?.coachingStyle, toneOpts);

      // Drop the trailing user message (we already saved it) when injecting history
      const trimmedHistory = (history as { role: string; content: string }[])
        .slice(0, -1)
        .slice(-12) // keep only last ~12 turns to stay within context
        .map((m) => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content }));

      const systemContent = `${coach.systemPrompt}${tone ? `\n\n${tone}` : ""}\n\n${context}\n\nKeep your reply concise — under 60 words unless the user asks for detail.`;
      const replyMessages: AIMessage[] = [
        { role: "system", content: systemContent },
        ...trimmedHistory,
        image
          ? { role: "user", content: [{ type: "text", text: message }, { type: "image_url", image_url: { url: image } }] }
          : { role: "user", content: message },
      ];
      const reply = await callAI(replyMessages, 250, image ? visionModel : settingsModel, apiKey);

      // Persist AI reply
      await ctx.runMutation(internal.chat.addMessage, {
        userId,
        sessionId: activeSessionId,
        role: "ai",
        content: reply,
      });

      return { drafts: [], tier1Summary: "", tier2Detail: "", isQuestion: true, reply, coachType, sessionId: activeSessionId };
    }

    // Step 2: Parse each item in parallel
    const [profile, metabolicProfile, userIngredients] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.calibration.getMetabolicProfileForContext, {}),
      ctx.runQuery(internal.user_ingredients.getForContext, { userId }),
    ]);
    const userPhysique: UserPhysique | undefined = profile ? {
      weight: profile.weight, height: profile.height, age: profile.age, sex: profile.sex,
      fitnessLevel: metabolicProfile?.fitnessLevel ?? "beginner",
      metabolicFactor: metabolicProfile?.metabolicFactor ?? 1.0,
    } : undefined;

    const drafts: any[] = [];
    const summaryParts: string[] = [];

    for (const item of extracted.items) {
      try {
        if (item.type === "meal") {
          let desc = item.description;
          if (image && !desc.trim()) {
            const d = await callAI([{ role: "user", content: [{ type: "text", text: "Describe this food briefly." }, { type: "image_url", image_url: { url: image } }] }], 150, visionModel, apiKey);
            desc = d;
          }

          // ── Diet memory: try to match before calling LLM ──────────────────
          const memories = await ctx.runQuery(internal.food_memory.getForUser, { userId });
          const memMatch = findBestMatch(desc, memories as any[]);
          if (memMatch && memMatch.entry.timesLogged >= AUTO_APPLY_MIN_LOGGED) {
            const mem = memMatch.entry;
            const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
            const draft = {
              kind: "meal",
              date: item.date,
              description: mem.displayName,
              name: mem.displayName,
              kcal: Math.round(mem.kcal),
              protein: Math.round(mem.protein),
              carbs: Math.round(mem.carbs),
              fat: Math.round(mem.fat),
              items: mem.components ? mem.components.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
              components: mem.components,
              mealType: "unspecified",
              time,
              confidence: Math.min(0.95, 0.7 + memMatch.score * 0.25),
              nutritionSource: "memory",
              autoApplied: false,  // always confirm — never silent log
              memoryNote: `Using your usual ${mem.displayName}`,
              foodMemoryId: mem._id,
            };
            drafts.push(draft);
            summaryParts.push(`${mem.displayName} (~${draft.kcal} kcal, from memory)`);
            continue;
          }
          // ── End memory match — fall through to LLM parse ──────────────────

          const parsed = await parseMealDescription(desc, "unspecified", "", settingsModel, apiKey, userIngredients as any[]);
          const nutrition = await runNutritionEngine(ctx, parsed);
          const baseDraft = {
            kind: "meal",
            date: item.date,
            description: parsed.name || desc,
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
          };
          const macroDecision = hasUserMacros ? applyUserMacros(baseDraft, userMacros) : { draft: baseDraft, conflict: false, reason: "" };
          drafts.push(macroDecision.draft);
          summaryParts.push(`${parsed.name || "Meal"} (~${macroDecision.draft.kcal} kcal)`);

        } else if (item.type === "workout") {
          const parsed = await parseWorkoutDescription(item.description, undefined, undefined, settingsModel, apiKey, userPhysique);
          // Extract user-stated calories from description (e.g. "75 kcal burned", "75cal")
          const statedKcalMatch = item.description.match(/(\d+(?:\.\d+)?)\s*(?:kcal|cal(?:ories?)?)(?:\s*burned)?/i);
          const statedKcal = statedKcalMatch ? Math.round(parseFloat(statedKcalMatch[1])) : null;
          const finalKcal = statedKcal ?? parsed.caloriesBurned ?? 0;
          drafts.push({
            kind: "workout",
            date: item.date,
            description: parsed.name,
            name: parsed.name,
            type: parsed.name,
            duration: parseDurationMinutes(parsed.duration ?? "30 min") || 30,
            kcal: finalKcal,
            intensity: (parsed.intensity?.toLowerCase() === "high" ? "high" : parsed.intensity?.toLowerCase() === "low" ? "light" : "medium"),
            sets: parsed.sets,
            rationale: parsed.rationale,
            exercises: parsed.exercises,
            calorieResult: parsed.calorieResult,
          });
          summaryParts.push(`${parsed.name} (~${finalKcal} kcal burned)`);

        } else if (item.type === "sleep") {
          // Parse sleep: extract hours and quality from description
          const sleepParsePrompt = `Extract sleep data from: "${item.description}"
Return JSON: {"hours": number, "quality": "poor"|"ok"|"good"|"great"}
Examples: "slept 6.5 hours" → {"hours":6.5,"quality":"ok"}, "slept 8h, felt great" → {"hours":8,"quality":"great"}
If hours can't be determined from a time range, calculate: e.g. "12:30am to 7am" = 6.5 hours.
Return ONLY JSON.`;
          const sleepRaw = await callAI([{ role: "user", content: sleepParsePrompt }], 80, settingsModel, apiKey);
          const sleepData = parseJSON<{ hours: number; quality: string }>(sleepRaw, { hours: 7, quality: "ok" });
          const hours = Math.max(0.5, Math.min(24, sleepData.hours || 7));
          const quality = ["poor", "ok", "good", "great"].includes(sleepData.quality) ? sleepData.quality : "ok";
          drafts.push({ kind: "sleep", date: item.date, description: item.description, hours, quality });
          summaryParts.push(`Sleep: ${hours.toFixed(1)}h (${quality})`);

        } else if (item.type === "water") {
          // Parse water: extract ml from description
          const waterParsePrompt = `Extract water amount in ml from: "${item.description}"
Common conversions: 1 glass = 250ml, 1L = 1000ml, 1 bottle = 500ml.
Return ONLY a number (ml). Examples: "1L" → 1000, "2 glasses" → 500, "500ml" → 500`;
          const mlRaw = await callAI([{ role: "user", content: waterParsePrompt }], 20, settingsModel, apiKey);
          const ml = Math.max(50, Math.min(5000, parseInt(mlRaw.replace(/[^0-9]/g, ""), 10) || 250));
          drafts.push({ kind: "water", date: item.date, description: item.description, ml });
          summaryParts.push(`Water: ${ml >= 1000 ? (ml / 1000).toFixed(1) + "L" : ml + "ml"}`);

        } else if (item.type === "mood") {
          const moodParsePrompt = `Extract mood rating 1-5 from: "${item.description}"
1=very bad, 2=bad, 3=ok, 4=good, 5=great. Return ONLY a number 1-5.`;
          const ratingRaw = await callAI([{ role: "user", content: moodParsePrompt }], 10, settingsModel, apiKey);
          const rating = Math.max(1, Math.min(5, parseInt(ratingRaw.replace(/[^1-5]/g, ""), 10) || 3)) as 1|2|3|4|5;
          drafts.push({ kind: "mood", date: item.date, description: item.description, rating });
          summaryParts.push(`Mood: ${rating}/5`);

        } else if (item.type === "steps") {
          const stepsParsePrompt = `Extract step count from: "${item.description}". Return ONLY a number.`;
          const stepsRaw = await callAI([{ role: "user", content: stepsParsePrompt }], 15, settingsModel, apiKey);
          const count = Math.max(0, parseInt(stepsRaw.replace(/[^0-9]/g, ""), 10) || 0);
          drafts.push({ kind: "steps", date: item.date, description: item.description, count });
          summaryParts.push(`Steps: ${count.toLocaleString()}`);
        }
      } catch { /* skip failed items */ }
    }

    if (drafts.length === 0) {
      // Fallback to question path
      const reply = "I couldn't parse that. Could you be more specific?";
      await ctx.runMutation(internal.chat.addMessage, {
        userId, sessionId: activeSessionId, role: "ai", content: reply,
      });
      return { drafts: [], tier1Summary: "", tier2Detail: "", isQuestion: true, reply, coachType: "overall", sessionId: activeSessionId };
    }

    // If any draft has a date != today, mention it in the summary
    const nonTodayDates = [...new Set(drafts.map((d) => d.date).filter((d) => d && d !== today))];
    const dateNote = nonTodayDates.length > 0 ? ` (for ${nonTodayDates.join(", ")})` : "";
    const tier1Summary = summaryParts.join(" · ") + dateNote + ". Confirm to log.";

    // Tier 2: brief analysis of the combined log
    const tier2Prompt = `Give a brief, encouraging analysis (2-3 sentences) of what the user just logged: ${summaryParts.join(", ")}. Be specific and actionable.`;
    const tier2Detail = await callAI([{ role: "user", content: tier2Prompt }], 150, settingsModel, apiKey).catch(() => "");

    // Persist the assistant's response (tier1 + tier2) so the chat thread stays meaningful
    const persistedReply = tier2Detail ? `${tier1Summary}\n\n${tier2Detail}` : tier1Summary;
    await ctx.runMutation(internal.chat.addMessage, {
      userId, sessionId: activeSessionId, role: "ai", content: persistedReply,
    });

    const actions: any[] = [];

    // Always show a log_draft card for every draft — deterministic confirm flow
    for (const draft of drafts) {
      if (draft.kind === "meal") {
        const rangeLow = Math.max(0, Math.round(draft.kcal * 0.88));
        const rangeHigh = Math.round(draft.kcal * 1.12);
        const isMacroConflict = draft.nutritionSource === "macro_conflict";
        if (isMacroConflict) {
          actions.push({
            type: "macro_conflict",
            title: "Macro check",
            body: `${draft.engineEstimate ? `My estimate is ~${draft.engineEstimate.kcal} kcal. ` : ""}Your numbers differ significantly — which should I use?`,
            draft,
            buttons: [
              { label: "Use my numbers", value: "use_user_macros" },
              { label: "Use estimate", value: "use_engine_estimate" },
            ],
          });
        } else {
          actions.push({
            type: "log_draft",
            source: hasUserMacros ? "user_macros" : draft.nutritionSource ?? "estimate",
            draft,
            title: draft.description ?? "Log this meal?",
            body: estimateMode
              ? `${rangeLow}–${rangeHigh} kcal depending on portions.`
              : undefined,
          });
        }
      } else {
        // workout, sleep, water, mood, steps — always confirm
        actions.push({
          type: "log_draft",
          source: draft.kind,
          draft,
          title: draft.description ?? `Log ${draft.kind}?`,
        });
      }
    }

    return { drafts, tier1Summary, tier2Detail, isQuestion: false, actions, sessionId: activeSessionId };
  },
});

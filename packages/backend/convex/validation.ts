type ValidationResult<T> = T & {
  validationFlags: string[];
};

export type MealValidationInput = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
  confidence?: number;
  nutritionSource?: string;
};

export type WorkoutValidationInput = {
  name: string;
  sets: string;
  duration?: string;
  intensity: string;
  caloriesBurned?: number;
  calorieConfidence?: number;
  calorieRangeLow?: number;
  calorieRangeHigh?: number;
};

const MEAL_REJECT_MAX_KCAL = 5000;
const MEAL_BORDERLINE_MAX_KCAL = 3500;
const WORKOUT_REJECT_MAX_KCAL = 3000;
const WORKOUT_BORDERLINE_MAX_KCAL = 1500;
const MACRO_MAX_GRAMS = {
  protein: 600,
  carbs: 900,
  fat: 450,
};
const LOW_CONFIDENCE = 0.35;
const DEFAULT_MEAL_CONFIDENCE = 0.7;
const DEFAULT_WORKOUT_CONFIDENCE = 0.55;

function assertFiniteNonNegative(field: string, value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${field} must be non-negative`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampWithFlag(
  field: string,
  value: number,
  max: number,
  flags: string[],
): number {
  if (value <= max) return value;
  flags.push(`${field}_clamped`);
  return max;
}

function normalizeConfidence(
  confidence: number | undefined,
  fallback: number,
  flags: string[],
): number {
  if (confidence == null) return fallback;
  if (!Number.isFinite(confidence) || Number.isNaN(confidence)) {
    flags.push("confidence_invalid");
    return LOW_CONFIDENCE;
  }
  if (confidence < 0 || confidence > 1) {
    flags.push("confidence_clamped");
    return clamp(confidence, 0, 1);
  }
  return confidence;
}

function lowerConfidence(confidence: number, flags: string[]): number {
  return flags.length > 0 ? Math.min(confidence, LOW_CONFIDENCE) : confidence;
}

function macroCalories(protein: number, carbs: number, fat: number): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function assertValidMealTime(time: string): string {
  const trimmed = time.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    throw new Error("Meal time must be a valid HH:MM 24-hour time");
  }
  return trimmed;
}

export function validateMealWrite(input: MealValidationInput): ValidationResult<MealValidationInput> {
  const flags: string[] = [];
  const calories = assertFiniteNonNegative("calories", input.calories);
  if (calories > MEAL_REJECT_MAX_KCAL) {
    throw new Error("Meal calories are unrealistically high");
  }

  const protein = assertFiniteNonNegative("protein", input.protein);
  const carbs = assertFiniteNonNegative("carbs", input.carbs);
  const fat = assertFiniteNonNegative("fat", input.fat);

  const sanitized = {
    ...input,
    calories: Math.round(clampWithFlag("calories", calories, MEAL_BORDERLINE_MAX_KCAL, flags)),
    protein: round1(clampWithFlag("protein", protein, MACRO_MAX_GRAMS.protein, flags)),
    carbs: round1(clampWithFlag("carbs", carbs, MACRO_MAX_GRAMS.carbs, flags)),
    fat: round1(clampWithFlag("fat", fat, MACRO_MAX_GRAMS.fat, flags)),
    time: assertValidMealTime(input.time),
    nutritionSource: input.nutritionSource?.trim() || "manual",
    confidence: normalizeConfidence(input.confidence, DEFAULT_MEAL_CONFIDENCE, flags),
  };

  const statedCalories = sanitized.calories;
  const macroKcal = macroCalories(sanitized.protein, sanitized.carbs, sanitized.fat);
  if (statedCalories > 0 && macroKcal > 0) {
    const delta = Math.abs(macroKcal - statedCalories);
    if (delta / statedCalories > 0.25) {
      flags.push("macro_calorie_mismatch");
    }
  }

  return {
    ...sanitized,
    confidence: lowerConfidence(sanitized.confidence, flags),
    validationFlags: flags,
  };
}

export function validateWorkoutWrite(input: WorkoutValidationInput): ValidationResult<WorkoutValidationInput> {
  const flags: string[] = [];
  const sanitized: WorkoutValidationInput = { ...input };

  if (input.caloriesBurned != null) {
    const caloriesBurned = assertFiniteNonNegative("caloriesBurned", input.caloriesBurned);
    if (caloriesBurned > WORKOUT_REJECT_MAX_KCAL) {
      throw new Error("Workout calorie burn is unrealistically high");
    }
    sanitized.caloriesBurned = Math.round(
      clampWithFlag("caloriesBurned", caloriesBurned, WORKOUT_BORDERLINE_MAX_KCAL, flags),
    );
  }

  if (input.calorieRangeLow != null) {
    const low = assertFiniteNonNegative("calorieRangeLow", input.calorieRangeLow);
    sanitized.calorieRangeLow = Math.round(clampWithFlag("calorieRangeLow", low, WORKOUT_REJECT_MAX_KCAL, flags));
  }
  if (input.calorieRangeHigh != null) {
    const high = assertFiniteNonNegative("calorieRangeHigh", input.calorieRangeHigh);
    sanitized.calorieRangeHigh = Math.round(clampWithFlag("calorieRangeHigh", high, WORKOUT_REJECT_MAX_KCAL, flags));
  }
  if (
    sanitized.calorieRangeLow != null &&
    sanitized.calorieRangeHigh != null &&
    sanitized.calorieRangeLow > sanitized.calorieRangeHigh
  ) {
    flags.push("calorie_range_reordered");
    const low = sanitized.calorieRangeHigh;
    sanitized.calorieRangeHigh = sanitized.calorieRangeLow;
    sanitized.calorieRangeLow = low;
  }

  const confidence = normalizeConfidence(input.calorieConfidence, DEFAULT_WORKOUT_CONFIDENCE, flags);
  sanitized.calorieConfidence = lowerConfidence(confidence, flags);

  return { ...sanitized, validationFlags: flags };
}

function normalizeForHash(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizeLogSource(source: string | undefined, fallback: string): string {
  return normalizeForHash(source || fallback).replace(/[^a-z0-9_-]+/g, "_") || fallback;
}

export function timeWindowKey(time: string | undefined, windowMinutes = 10): string {
  const match = (time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "unknown";
  const hours = clamp(Number(match[1]) || 0, 0, 23);
  const minutes = clamp(Number(match[2]) || 0, 0, 59);
  const bucket = Math.floor((hours * 60 + minutes) / windowMinutes) * windowMinutes;
  const hh = String(Math.floor(bucket / 60)).padStart(2, "0");
  const mm = String(bucket % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function mealContentHash(meal: Pick<MealValidationInput, "name" | "calories" | "protein" | "carbs" | "fat">): string {
  return stableHash([
    normalizeForHash(meal.name),
    Math.round(meal.calories),
    round1(meal.protein),
    round1(meal.carbs),
    round1(meal.fat),
  ].join("|"));
}

export function workoutContentHash(
  workout: Pick<WorkoutValidationInput, "name" | "sets" | "duration" | "intensity" | "caloriesBurned">,
): string {
  return stableHash([
    normalizeForHash(workout.name),
    normalizeForHash(workout.sets),
    normalizeForHash(workout.duration || ""),
    normalizeForHash(workout.intensity),
    workout.caloriesBurned == null ? "" : Math.round(workout.caloriesBurned),
  ].join("|"));
}

export function buildIdempotencyKey(parts: {
  userId: string;
  date: string;
  source: string;
  contentHash: string;
  timeWindow: string;
}): string {
  return [
    normalizeForHash(parts.userId),
    parts.date,
    normalizeLogSource(parts.source, "unknown"),
    parts.contentHash,
    parts.timeWindow,
  ].join(":");
}

export function minutesBetweenTimes(a?: string, b?: string): number | null {
  const parse = (time?: string) => {
    const match = (time || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return clamp(Number(match[1]) || 0, 0, 23) * 60 + clamp(Number(match[2]) || 0, 0, 59);
  };
  const aa = parse(a);
  const bb = parse(b);
  if (aa == null || bb == null) return null;
  return Math.abs(aa - bb);
}

export function normalizedMealName(name: string): string {
  return normalizeForHash(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|meal|breakfast|lunch|dinner|snack)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSimilarMeal(
  incoming: Pick<MealValidationInput, "name" | "calories" | "protein" | "carbs" | "fat">,
  existing: Pick<MealValidationInput, "name" | "calories" | "protein" | "carbs" | "fat">,
): boolean {
  const a = normalizedMealName(incoming.name);
  const b = normalizedMealName(existing.name);
  if (!a || !b) return false;

  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  const common = [...aTokens].filter((token) => bTokens.has(token)).length;
  const overlap = common / Math.max(1, Math.min(aTokens.size, bTokens.size));
  const nameSimilar = a === b || a.includes(b) || b.includes(a) || overlap >= 0.75;
  if (!nameSimilar) return false;

  const kcalDelta = Math.abs(Math.round(incoming.calories) - Math.round(existing.calories));
  const kcalTolerance = Math.max(120, Math.round(Math.max(incoming.calories, existing.calories, 1) * 0.35));
  return kcalDelta <= kcalTolerance;
}

/**
 * Deterministic Workout Calorie Engine
 * Pure functions — no DB access, no side effects.
 * Uses MET-based formula from the Compendium of Physical Activities.
 */

export type IntensityLevel = "easy" | "moderate" | "hard" | "very_hard";
export type DensityLevel = "long_rests" | "normal" | "short_rests" | "circuit";
export type FitnessLevel = "beginner" | "intermediate" | "advanced";

export interface ParsedExercise {
  name: string;
  sets: { weight: string; reps: string }[];
}

export interface WorkoutInput {
  duration_min: number;
  intensity: IntensityLevel;
  density: DensityLevel;
  compound_ratio: number; // 0.0–1.0
  exercises: ParsedExercise[];
  weighted_met: number; // from exercise_db
}

export interface UserPhysique {
  weight_kg: number;
  age: number;
  sex: "male" | "female";
  fitness_level: FitnessLevel;
  metabolic_factor: number; // adaptive, default 1.0
}

export interface CalorieBreakdown {
  base_kcal: number;
  met_used: number;
  intensity_mult: number;
  density_mult: number;
  compound_mult: number;
  metabolic_factor: number;
  epoc_pct: number;
  epoc_kcal: number;
}

export interface CalorieResult {
  during_workout_kcal: number;
  epoc_kcal: number;
  total_kcal: number;
  confidence: number; // 0.0–1.0
  range_low: number;
  range_high: number;
  breakdown: CalorieBreakdown;
}

const INTENSITY_MULTIPLIERS: Record<IntensityLevel, number> = {
  easy: 0.85,
  moderate: 1.0,
  hard: 1.1,
  very_hard: 1.2,
};

const DENSITY_MULTIPLIERS: Record<DensityLevel, number> = {
  long_rests: 0.9,
  normal: 1.0,
  short_rests: 1.1,
  circuit: 1.2,
};

const DEFAULT_MET_BY_CATEGORY: Record<string, number> = {
  strength: 5.0,
  cardio: 7.0,
  flexibility: 2.5,
  sport: 6.0,
  default: 5.0,
};

const EPOC_PERCENTAGES: Record<IntensityLevel, number> = {
  easy: 0.05,
  moderate: 0.07,
  hard: 0.10,
  very_hard: 0.125,
};

/**
 * Compound ratio multiplier: maps 0→0.95, 1→1.08
 * More compound lifts = higher calorie burn
 */
function compoundMultiplier(compoundRatio: number): number {
  return 0.95 + compoundRatio * 0.13;
}

/**
 * Main calorie calculation using MET formula from Compendium of Physical Activities:
 * Calories = (MET - 1) × weight_kg × duration_hours
 *
 * Then applies intensity, density, compound, EPOC, and personal factors.
 */
export function calculateWorkoutCalories(
  input: WorkoutInput,
  user: UserPhysique,
): CalorieResult {
  const durationHours = input.duration_min / 60;
  const met = input.weighted_met > 0 ? input.weighted_met : 5.0;
  const intensityMult = INTENSITY_MULTIPLIERS[input.intensity];
  const densityMult = DENSITY_MULTIPLIERS[input.density];
  const compoundMult = compoundMultiplier(input.compound_ratio);

  // Base burn from MET formula
  const baseKcal = (met - 1) * user.weight_kg * durationHours;

  // Apply modifiers
  const duringWorkoutKcal = Math.round(
    baseKcal * intensityMult * densityMult * compoundMult,
  );

  // EPOC (post-exercise oxygen consumption)
  const epocPct = EPOC_PERCENTAGES[input.intensity];
  const epocKcal = Math.round(duringWorkoutKcal * epocPct);

  // Personal metabolic factor
  const totalKcal = Math.round(
    (duringWorkoutKcal + epocKcal) * user.metabolic_factor,
  );

  // Confidence calculation
  const confidence = calculateConfidence(input, user);

  // Range: wider when less confident
  const rangeWidth = Math.round(totalKcal * (1 - confidence) * 0.25);
  const rangeLow = totalKcal - rangeWidth;
  const rangeHigh = totalKcal + rangeWidth;

  return {
    during_workout_kcal: Math.round(duringWorkoutKcal),
    epoc_kcal: epocKcal,
    total_kcal: totalKcal,
    confidence,
    range_low: rangeLow,
    range_high: rangeHigh,
    breakdown: {
      base_kcal: Math.round(baseKcal),
      met_used: met,
      intensity_mult: intensityMult,
      density_mult: densityMult,
      compound_mult: compoundMult,
      metabolic_factor: user.metabolic_factor,
      epoc_pct: epocPct,
      epoc_kcal: epocKcal,
    },
  };
}

/**
 * Score density from exercise count and duration.
 * More exercises in less time = higher density.
 */
export function scoreDensity(
  exercises: ParsedExercise[],
  durationMin: number,
): DensityLevel {
  const totalSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  if (totalSets === 0) return "normal";

  // Avg minutes per set as indicator of rest time
  const minutesPerSet = durationMin / totalSets;

  if (minutesPerSet <= 1.5) return "circuit";
  if (minutesPerSet <= 3) return "short_rests";
  if (minutesPerSet <= 5) return "normal";
  return "long_rests";
}

/**
 * Score compound ratio from list of exercise names/metadata.
 * Returns 0.0–1.0 where 1.0 = all compound exercises.
 */
export function scoreCompoundRatio(
  exerciseMetas: Array<{ is_compound: boolean }>,
): number {
  if (exerciseMetas.length === 0) return 0.5;
  const compoundCount = exerciseMetas.filter((e) => e.is_compound).length;
  return compoundCount / exerciseMetas.length;
}

/**
 * Calculate confidence based on completeness of input data.
 * Missing fields reduce confidence.
 */
export function calculateConfidence(
  input: WorkoutInput,
  user: UserPhysique,
): number {
  let score = 1.0;

  // Duration known? (not defaulted)
  if (input.duration_min <= 0) score -= 0.3;

  // Exercises provided?
  if (input.exercises.length === 0) score -= 0.25;

  // MET value looks plausible?
  if (input.weighted_met <= 0 || input.weighted_met > 15) score -= 0.15;

  // User weight known?
  if (user.weight_kg <= 0) score -= 0.3;

  // Fitness level known?
  if (!user.fitness_level) score -= 0.05;

  // Metabolic factor not at default?
  if (user.metabolic_factor === 1.0) score -= 0.05;

  return Math.max(0.1, Math.round(score * 100) / 100);
}

/**
 * Get a fallback MET value for an exercise category.
 */
export function getDefaultMET(category: string): number {
  return DEFAULT_MET_BY_CATEGORY[category] ?? DEFAULT_MET_BY_CATEGORY.default;
}

/**
 * Convert minutes string (e.g. "45 min", "1h 30m", "60") to number.
 */
export function parseDurationMinutes(durationStr?: string): number {
  if (!durationStr) return 0;
  // Try "45 min" format
  const minMatch = durationStr.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (minMatch) return parseFloat(minMatch[1]);
  // Try "1h 30m" format
  const hMatch = durationStr.match(/(\d+)\s*h/i);
  const mMatch = durationStr.match(/(\d+)\s*m/i);
  if (hMatch || mMatch) {
    const hours = hMatch ? parseInt(hMatch[1]) : 0;
    const mins = mMatch ? parseInt(mMatch[1]) : 0;
    return hours * 60 + mins;
  }
  // Try raw number
  const raw = parseFloat(durationStr);
  if (!isNaN(raw)) return raw;
  return 0;
}

/**
 * Workout Scorer
 * Derives workout scores (density, compound ratio, intensity mapping)
 * from AI-parsed exercise data. Pure functions, no DB access.
 */

import type {
  DensityLevel,
  IntensityLevel,
  ParsedExercise,
} from "./calorie-engine";

/**
 * Map AI intensity strings (LOW/MEDIUM/HIGH/MAX) to engine intensity levels.
 */
export function mapAIIntensity(aiIntensity: string): IntensityLevel {
  const upper = aiIntensity.toUpperCase();
  if (upper === "LOW") return "easy";
  if (upper === "MEDIUM") return "moderate";
  if (upper === "HIGH") return "hard";
  if (upper === "MAX") return "very_hard";
  return "moderate";
}

/**
 * Infer workout density from (exercise count × avg sets × estimated set time)
 * vs total duration.
 *
 * density = total set time / total workout duration
 * High density = circuit-style (little rest), low = bodybuilding (long rests)
 */
export function inferDensity(
  exercises: ParsedExercise[],
  durationMin: number,
): DensityLevel {
  const totalSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  if (totalSets === 0) return "normal";

  // Estimate average set duration: 30-45 seconds for strength
  const estimatedSetSecs = 40;
  const totalSetTimeMin = (totalSets * estimatedSetSecs) / 60;

  // Rest time = total duration - set time
  const workDensity = durationMin > 0 ? totalSetTimeMin / durationMin : 0.5;

  if (workDensity >= 0.7) return "circuit";
  if (workDensity >= 0.5) return "short_rests";
  if (workDensity >= 0.3) return "normal";
  return "long_rests";
}

/**
 * Count compound exercises from metadata list.
 * Returns ratio 0.0–1.0 of compound exercises.
 */
export function countCompoundRatio(
  exerciseMetas: Array<{ is_compound: boolean }>,
): number {
  if (exerciseMetas.length === 0) return 0.5;
  const compoundCount = exerciseMetas.filter((e) => e.is_compound).length;
  return compoundCount / exerciseMetas.length;
}

/**
 * Estimate duration from exercise count.
 * Used when AI doesn't provide a duration.
 */
export function estimateDuration(
  exercises: ParsedExercise[],
): number {
  const totalSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  if (totalSets === 0) return 30;

  // Avg: 2 min per set (40s work + 80s rest)
  return Math.round(totalSets * 2);
}

/**
 * Calculate total weight lifted in kg (approximate).
 * Useful for workout volume tracking.
 */
export function calculateVolumeLoad(
  exercises: ParsedExercise[],
): number {
  let total = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      const weightStr = set.weight.replace(/[^0-9.]/g, "");
      const repsStr = set.reps.replace(/[^0-9]/g, "");
      const weight = parseFloat(weightStr) || 0;
      const reps = parseInt(repsStr) || 0;
      total += weight * reps;
    }
  }
  return total;
}

/**
 * Generate a human-readable sets summary string.
 */
export function generateSetsSummary(
  exercises: ParsedExercise[],
): string {
  const totalSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  const exCount = exercises.length;
  if (exCount === 0) return "–";
  return `${exCount} exercise${exCount !== 1 ? "s" : ""} · ${totalSets} sets`;
}

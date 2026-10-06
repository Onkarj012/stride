/** Above this many reps both formulas drift badly, so no estimate is given. */
export const E1RM_MAX_REPS = 12;

/** A set's credit toward a muscle it trains secondarily, as a fraction of a primary set. */
export const SECONDARY_MUSCLE_SET_CREDIT = 0.5;

/** True when weight and reps can produce an estimate. */
function validSet(weightKg: number, reps: number): boolean {
  return Number.isFinite(weightKg) && weightKg > 0 && Number.isInteger(reps) && reps >= 1 && reps <= E1RM_MAX_REPS;
}

/** Epley (1985): 1RM = w × (1 + reps / 30). A single rep returns the weight itself. */
export function epley(weightKg: number, reps: number): number | null {
  if (!validSet(weightKg, reps)) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Brzycki (1993): 1RM = w × 36 / (37 − reps). A single rep returns the weight itself. */
export function brzycki(weightKg: number, reps: number): number | null {
  if (!validSet(weightKg, reps)) return null;
  return reps === 1 ? weightKg : (weightKg * 36) / (37 - reps);
}

/** One logged set. */
export interface StrengthSet {
  exerciseId: string;
  reps: number;
  weightKg: number;
}

/** Muscles an exercise trains, from the `exercises` table. */
export interface ExerciseMuscles {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}

/** Weekly totals for one muscle. */
export interface MuscleVolume {
  /** Hard sets: 1 per primary set, `SECONDARY_MUSCLE_SET_CREDIT` per secondary set. */
  sets: number;
  /** Reps × kg summed over sets where this muscle is primary. */
  tonnageKg: number;
}

/** Sets and tonnage per muscle for a list of sets, usually one week's. Sets for unknown exercises are skipped. */
export function weeklyVolumeByMuscle(
  sets: readonly StrengthSet[],
  exercises: ReadonlyMap<string, ExerciseMuscles>,
): Map<string, MuscleVolume> {
  const volume = new Map<string, MuscleVolume>();
  // Adds one set's contribution to a muscle's running totals.
  const add = (muscle: string, sets: number, tonnageKg: number) => {
    const current = volume.get(muscle) ?? { sets: 0, tonnageKg: 0 };
    volume.set(muscle, { sets: current.sets + sets, tonnageKg: current.tonnageKg + tonnageKg });
  };
  for (const set of sets) {
    const exercise = exercises.get(set.exerciseId);
    if (exercise === undefined || set.reps <= 0) continue;
    const tonnage = Math.max(0, set.weightKg) * set.reps;
    for (const m of exercise.primaryMuscles) add(m, 1, tonnage);
    for (const m of exercise.secondaryMuscles) add(m, SECONDARY_MUSCLE_SET_CREDIT, 0);
  }
  return volume;
}

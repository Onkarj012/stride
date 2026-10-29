export interface WorkoutSetInput {
  weightKg: number;
  reps: number;
  weightBasis?: "total" | "each";
}

export type ExpandSetsResult = { sets: WorkoutSetInput[]; problem?: never } | { sets?: never; problem: string };

/** Expands weight and rep lists only when their pairing is unambiguous. */
export function expandSets(
  weights: number[],
  reps: number[],
  options: { weightUnit?: "kg" | "lb"; weightBasis?: "total" | "each"; bodyweight?: boolean } = {},
): ExpandSetsResult {
  if (weights.length === 0 || reps.length === 0) return { problem: "Add at least one weight and one reps value." };
  if (weights.some((value) => !Number.isFinite(value) || value < 0) || reps.some((value) => !Number.isInteger(value) || value < 1)) {
    return { problem: "Check the weight and reps values." };
  }
  const count = Math.max(weights.length, reps.length);
  if (weights.length !== reps.length && weights.length !== 1 && reps.length !== 1) return { problem: "Use the same number of weights and reps, or one value to repeat." };
  const multiplier = options.weightUnit === "lb" ? 0.45359237 : 1;
  return {
    sets: Array.from({ length: count }, (_, index) => ({
      weightKg: options.bodyweight ? 0 : weights[weights.length === 1 ? 0 : index]! * multiplier,
      reps: reps[reps.length === 1 ? 0 : index]!,
      ...(options.weightBasis === undefined ? {} : { weightBasis: options.weightBasis }),
    })),
  };
}

/** Normalizes a name by lowercasing it and removing punctuation and repeated spaces. */
export function normalizeExerciseName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

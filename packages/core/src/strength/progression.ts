/** One set as logged, or as planned for the next session. */
export interface PlannedSet {
  weightKg: number;
  reps: number;
}

/** Why a target differs from last session's set. `at-limit` means the weight cap stopped the weight step, so the reps are held. */
export type ProgressionReason = "add-weight" | "add-rep" | "repeat" | "at-limit";

/** A planned set and the reason it changed from last time. */
export interface SetTarget extends PlannedSet {
  reason: ProgressionReason;
}

/** The rep band a lift is worked in. Reaching `max` on every set earns more weight. */
export interface RepRange {
  min: number;
  max: number;
}

/** Rounds kilograms to 2 decimals so float sums like 22.1 + 2.2 stay clean. */
function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

/** The rep band for a lift, picked from the reps last session was planned at. Bands don't overlap, so a band's min plans back into the same band. */
export function repRange(reps: number): RepRange {
  if (reps <= 5) return { min: 3, max: 5 };
  if (reps <= 8) return { min: 6, max: 8 };
  if (reps <= 12) return { min: 9, max: 12 };
  return { min: 13, max: 20 };
}

/** The band for the top-weight sets, from their highest reps so lighter warm-ups don't decide it. Null when there are no sets. */
export function inferRange(previous: PlannedSet[]): RepRange | null {
  if (previous.length === 0) return null;
  const top = Math.max(...previous.map((set) => set.weightKg));
  const topReps = Math.max(...previous.filter((set) => set.weightKg === top).map((set) => set.reps));
  return repRange(topReps);
}

/** Double progression: add reps until every top set hits the top of the range, then add weight. Pass `range` to keep a band chosen earlier, and `maxKg` to stop at the heaviest loadable weight. */
export function nextTargets(previous: PlannedSet[], stepKg: number, range?: RepRange, maxKg = Infinity): SetTarget[] {
  const band = range ?? inferRange(previous);
  if (band === null) return [];

  // Bodyweight sets have no load to add, so each set just gains a rep.
  if (previous.every((set) => set.weightKg === 0)) {
    return previous.map((set) => ({ weightKg: 0, reps: set.reps + 1, reason: "add-rep" }));
  }

  const top = Math.max(...previous.map((set) => set.weightKg));
  const topSets = previous.filter((set) => set.weightKg === top);

  if (topSets.every((set) => set.reps >= band.max)) {
    return previous.map((set) => {
      const weightKg = Math.min(maxKg, roundKg(set.weightKg + stepKg));
      // Past the weight cap no heavier weight can be logged, so the reps stay where they were.
      if (weightKg <= set.weightKg) {
        return { weightKg, reps: set.reps, reason: "at-limit" };
      }
      return { weightKg, reps: band.min, reason: "add-weight" };
    });
  }

  return previous.map((set) =>
    set.reps < band.max
      ? { weightKg: set.weightKg, reps: set.reps + 1, reason: "add-rep" }
      : { weightKg: set.weightKg, reps: set.reps, reason: "repeat" },
  );
}

/** One set as logged, or as planned for the next session. */
export interface PlannedSet {
  weightKg: number;
  reps: number;
}

/** Why a target differs from last session's set. */
export type ProgressionReason = "add-weight" | "add-rep" | "repeat";

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

/** The rep band for a lift, picked from the reps last session was planned at. */
export function repRange(reps: number): RepRange {
  if (reps <= 5) return { min: 3, max: 5 };
  if (reps <= 8) return { min: 6, max: 8 };
  if (reps <= 12) return { min: 8, max: 12 };
  return { min: 12, max: 20 };
}

/** Double progression: add reps until every top set hits the top of the range, then add weight. */
export function nextTargets(previous: PlannedSet[], stepKg: number): SetTarget[] {
  const first = previous[0];
  if (first === undefined) return [];

  // Bodyweight sets have no load to add, so each set just gains a rep.
  if (previous.every((set) => set.weightKg === 0)) {
    return previous.map((set) => ({ weightKg: 0, reps: set.reps + 1, reason: "add-rep" }));
  }

  const range = repRange(first.reps);
  const top = Math.max(...previous.map((set) => set.weightKg));
  const topSets = previous.filter((set) => set.weightKg === top);

  if (topSets.every((set) => set.reps >= range.max)) {
    return previous.map((set) => ({
      weightKg: roundKg(set.weightKg + stepKg),
      reps: range.min,
      reason: "add-weight",
    }));
  }

  return previous.map((set) =>
    set.reps < range.max
      ? { weightKg: set.weightKg, reps: set.reps + 1, reason: "add-rep" }
      : { weightKg: set.weightKg, reps: set.reps, reason: "repeat" },
  );
}

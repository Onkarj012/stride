import type { ExerciseRecord } from "../src/nutrition/types.ts";

/** free-exercise-db (Unlicense), pinned to a commit so reruns are reproducible. Images are never imported (plan 007 section 6). */
export const EXERCISES_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/dist/exercises.json";

/** Mapped rows plus how many source rows were malformed. */
export interface ExercisesResult {
  exercises: ExerciseRecord[];
  skipped: number;
}

/** A non-empty string, or null. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** String entries of an array value; anything else is an empty list. */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((v) => (typeof v === "string" && v.trim() !== "" ? [v.trim()] : [])) : [];
}

/** Maps the parsed free-exercise-db JSON to `exercises` rows: names, muscles, equipment and category only. */
export function mapExercises(json: unknown): ExercisesResult {
  if (!Array.isArray(json)) throw new Error("exercises.json is not an array");
  const exercises: ExerciseRecord[] = [];
  let skipped = 0;
  for (const item of json) {
    const row: Record<string, unknown> = typeof item === "object" && item !== null ? { ...item } : {};
    const sourceId = text(row["id"]);
    const name = text(row["name"]);
    const category = text(row["category"]);
    const primaryMuscles = strings(row["primaryMuscles"]);
    if (sourceId === null || name === null || category === null || primaryMuscles.length === 0) {
      skipped++;
      continue;
    }
    exercises.push({
      sourceId,
      name,
      category,
      equipment: text(row["equipment"]),
      mechanic: text(row["mechanic"]),
      level: text(row["level"]),
      primaryMuscles,
      secondaryMuscles: strings(row["secondaryMuscles"]),
    });
  }
  return { exercises, skipped };
}

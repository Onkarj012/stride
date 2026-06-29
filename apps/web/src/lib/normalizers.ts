/**
 * Normalizes Convex meal/workout rows into the UI's flat LogEntry shape.
 * This keeps all page components unchanged while the data source moves to Convex.
 */
import type { LogEntry } from "@/lib/storage";
import type { Id } from "@convex/_generated/dataModel";

type ConvexMeal = {
  _id: Id<"meals">;
  _creationTime?: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
  date: string;
  aiSuggestion?: string | null;
  components?: string | null;
  mealType?: string | null;
};

type ConvexWorkout = {
  _id: Id<"workouts">;
  _creationTime?: number;
  name: string;
  intensity: string;
  duration?: string | null;
  sets: string;
  date: string;
  caloriesBurned?: number | null;
  rationale?: string | null;
};

export function mealToLogEntry(m: ConvexMeal): LogEntry {
  return {
    id: m._id as string,
    category: "meal",
    text: m.name,
    createdAt: m._creationTime ?? Date.now(),
    meal: {
      kcal: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      items: m.components ? m.components.split(",").map((s) => s.trim()) : undefined,
    },
    aiInsight: m.aiSuggestion ?? undefined,
    agent: "diet",
  };
}

export function workoutToLogEntry(w: ConvexWorkout): LogEntry {
  const durationMin = w.duration ? parseInt(w.duration, 10) || 0 : 0;
  const rawIntensity = w.intensity.toLowerCase();
  const intensity: "light" | "medium" | "high" =
    rawIntensity === "low" || rawIntensity === "light"
      ? "light"
      : rawIntensity === "high"
        ? "high"
        : "medium";

  return {
    id: w._id as string,
    category: "workout",
    text: w.name,
    createdAt: w._creationTime ?? Date.now(),
    workout: {
      type: w.name,
      duration: durationMin,
      kcal: w.caloriesBurned ?? 0,
      intensity,
    },
    aiInsight: w.rationale ?? undefined,
    agent: "workout",
  };
}

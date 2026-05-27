/**
 * useLogs — Convex-backed replacement for the localStorage mock.
 *
 * Keeps the same external API: { logs, add, remove, clear }
 * so all existing page components work without changes.
 *
 * Data is fetched for today by default. The `logs` array is a flat
 * LogEntry[] normalized from Convex meals + workouts tables.
 */
import { useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { LogCategory, LogEntry } from "@/lib/storage";
import { mealToLogEntry, workoutToLogEntry } from "@/lib/normalizers";

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function useLogs(date?: string) {
  const d = date ?? todayDate();

  const meals = useQuery(api.meals.getMeals, { date: d });
  const workouts = useQuery(api.workouts.getWorkouts, { date: d });

  const addMeal = useMutation(api.meals.addMeal);
  const addWorkout = useMutation(api.workouts.addWorkout);
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);

  const logs: LogEntry[] = useMemo(() => {
    const mealEntries = (meals ?? []).map(mealToLogEntry);
    const workoutEntries = (workouts ?? []).map(workoutToLogEntry);
    return [...mealEntries, ...workoutEntries].sort((a, b) => b.createdAt - a.createdAt);
  }, [meals, workouts]);

  const add = useCallback(
    async (
      category: LogCategory,
      text: string,
      extra?: Partial<Omit<LogEntry, "id" | "category" | "text" | "createdAt">>,
    ) => {
      if (!text.trim()) return null;
      const now = new Date();
      const time = now.toTimeString().slice(0, 5);

      if (category === "meal") {
        const meal = extra?.meal;
        await addMeal({
          name: text,
          calories: meal?.kcal ?? 0,
          protein: meal?.protein ?? 0,
          carbs: meal?.carbs ?? 0,
          fat: meal?.fat ?? 0,
          time,
          date: d,
          aiSuggestion: extra?.aiInsight,
          components: meal?.items?.join(", "),
        });
      } else if (category === "workout") {
        const workout = extra?.workout;
        await addWorkout({
          name: text,
          sets: "1",
          duration: workout?.duration ? String(workout.duration) : undefined,
          intensity: workout?.intensity?.toUpperCase() ?? "MEDIUM",
          date: d,
          caloriesBurned: workout?.kcal,
          rationale: extra?.aiInsight,
        });
      }
      // water/sleep/mood/steps: not yet in Convex schema — silently skip
      return null;
    },
    [addMeal, addWorkout, d],
  );

  const remove = useCallback(
    async (id: string) => {
      // Determine table from which list the id appears in
      const isMeal = (meals ?? []).some((m) => m._id === id);
      if (isMeal) {
        await deleteMeal({ id: id as Id<"meals"> });
      } else {
        await deleteWorkout({ id: id as Id<"workouts"> });
      }
    },
    [meals, deleteMeal, deleteWorkout],
  );

  const clear = useCallback(async () => {
    await Promise.all([
      ...(meals ?? []).map((m) => deleteMeal({ id: m._id })),
      ...(workouts ?? []).map((w) => deleteWorkout({ id: w._id })),
    ]);
  }, [meals, workouts, deleteMeal, deleteWorkout]);

  return { logs, add, remove, clear };
}

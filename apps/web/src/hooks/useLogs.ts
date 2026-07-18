/**
 * useLogs — Convex-backed unified hook for all log types.
 *
 * Returns flat LogEntry[] (today's data by default) and provides:
 *   - add(category, text, extras) — routes to correct Convex mutation
 *   - remove(id) — deletes by id (auto-detects table)
 *   - clear() — deletes all of today's entries
 */
import { useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { LogCategory, LogEntry } from "@/lib/storage";
import { mealToLogEntry, workoutToLogEntry } from "@/lib/normalizers";
import { localDateStr } from "@/lib/utils";
import { getAIErrorMessage } from "@/lib/ai-errors";

function todayDate(): string {
  return localDateStr();
}

export function requireMealNutrition(meal: LogEntry["meal"]): NonNullable<LogEntry["meal"]> {
  if (!meal || [meal.kcal, meal.protein, meal.carbs, meal.fat].some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Meal nutrition is required before logging");
  }
  return meal;
}

export function requireWaterAmount(water: LogEntry["water"]): number {
  const ml = water?.ml;
  if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) throw new Error("Water amount is required before logging");
  return ml;
}

export function useLogs(date?: string) {
  const d = date ?? todayDate();

  const meals = useQuery(api.meals.getMeals, { date: d }) as any[] | undefined;
  const workouts = useQuery(api.workouts.getWorkouts, { date: d }) as any[] | undefined;
  const water = useQuery(api.wellness.getWater, { date: d }) as any[] | undefined;
  const sleep = useQuery(api.wellness.getSleep, { date: d });
  const mood = useQuery(api.wellness.getMood, { date: d }) as any[] | undefined;
  const steps = useQuery(api.wellness.getSteps, { date: d });

  const addMeal = useMutation(api.meals.addMeal);
  const addWorkout = useMutation(api.workouts.addWorkout);
  const addWater = useMutation(api.wellness.addWater);
  const upsertSleep = useMutation(api.wellness.upsertSleep);
  const addMood = useMutation(api.wellness.addMood);
  const upsertSteps = useMutation(api.wellness.upsertSteps);

  const deleteMeal = useMutation(api.meals.deleteMeal);
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);
  const deleteWater = useMutation(api.wellness.deleteWater);
  const deleteSleep = useMutation(api.wellness.deleteSleep);
  const deleteMood = useMutation(api.wellness.deleteMood);

  const logs: LogEntry[] = useMemo(() => {
    const items: LogEntry[] = [];

    for (const m of meals ?? []) items.push(mealToLogEntry(m));
    for (const w of workouts ?? []) items.push(workoutToLogEntry(w));

    for (const w of water ?? []) {
      items.push({
        id: w._id as string,
        category: "water",
        text: `${w.ml} ml water`,
        createdAt: w._creationTime ?? Date.now(),
        water: { ml: w.ml },
        agent: "water",
      });
    }
    if (sleep) {
      items.push({
        id: sleep._id as string,
        category: "sleep",
        text: `${sleep.hours.toFixed(1)}h sleep`,
        createdAt: sleep._creationTime ?? Date.now(),
        sleep: { hours: sleep.hours, quality: (sleep.quality as "poor" | "ok" | "good" | "great") ?? "ok" },
        agent: "sleep",
      });
    }
    for (const m of mood ?? []) {
      items.push({
        id: m._id as string,
        category: "mood",
        text: m.note ?? `Mood: ${m.rating}/5`,
        createdAt: m._creationTime ?? Date.now(),
        mood: { rating: m.rating as 1 | 2 | 3 | 4 | 5, note: m.note },
        agent: "wellness",
      });
    }
    if (steps) {
      items.push({
        id: steps._id as string,
        category: "steps",
        text: `${steps.count.toLocaleString()} steps`,
        createdAt: steps._creationTime ?? Date.now(),
        steps: { count: steps.count },
        agent: "habit",
      });
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [meals, workouts, water, sleep, mood, steps]);

  const add = useCallback(
    async (
      category: LogCategory,
      text: string,
      extra?: Partial<Omit<LogEntry, "id" | "category" | "text" | "createdAt">>,
      dateOverride?: string,
    ) => {
      if (!text.trim() && category !== "water") return null;
      const now = new Date();
      const time = now.toTimeString().slice(0, 5);
      const targetDate = dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride) ? dateOverride : d;

      try {
        if (category === "meal") {
        const meal = requireMealNutrition(extra?.meal);
        await addMeal({
          name: text,
          calories: meal.kcal,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          time, date: targetDate,
          aiSuggestion: extra?.aiInsight,
          components: meal?.items?.join(", "),
          confidence: meal?.confidence,
          nutritionSource: meal?.nutritionSource,
          nutritionVerified: meal?.nutritionVerified,
          structuredItems: meal?.structuredItems,
          ingredientBreakdown: meal?.ingredientBreakdown,
          logSource: meal?.logSource,
        });
        } else if (category === "workout") {
        const w = extra?.workout;
        await addWorkout({
          name: text,
          sets: "1",
          duration: w?.duration ? String(w.duration) : undefined,
          intensity: w?.intensity?.toUpperCase() ?? "MEDIUM",
          date: targetDate,
          caloriesBurned: w?.kcal,
          timestamp: time,
          rationale: extra?.aiInsight,
          calorieConfidence: w?.calorieConfidence,
          calorieRangeLow: w?.calorieRangeLow,
          calorieRangeHigh: w?.calorieRangeHigh,
          calorieEstimateRough: w?.calorieEstimateRough,
          calorieBreakdown: w?.calorieBreakdown,
          calculationVersion: w?.calculationVersion,
          structuredSets: w?.structuredSets,
          logSource: w?.logSource,
        });
        } else if (category === "water") {
        const ml = requireWaterAmount(extra?.water);
        await addWater({ ml, date: targetDate, time });
        } else if (category === "sleep") {
        const s = extra?.sleep;
        if (!s) return null;
        await upsertSleep({ hours: s.hours, quality: s.quality, date: targetDate, note: text });
        } else if (category === "mood") {
        const m = extra?.mood;
        if (!m) return null;
        await addMood({ rating: m.rating, date: targetDate, time, note: m.note ?? text });
        } else if (category === "steps") {
        const count = extra?.steps?.count;
        if (!count) return null;
        await upsertSteps({ count, date: targetDate });
        }
      } catch (error) {
        const message = getAIErrorMessage(error);
        if (message) throw new Error(message);
        throw error;
      }
      return null;
    },
    [addMeal, addWorkout, addWater, upsertSleep, addMood, upsertSteps, d],
  );

  const remove = useCallback(
    async (id: string) => {
      if ((meals ?? []).some((m) => m._id === id)) return deleteMeal({ id: id as Id<"meals"> });
      if ((workouts ?? []).some((w) => w._id === id)) return deleteWorkout({ id: id as Id<"workouts"> });
      if ((water ?? []).some((w) => w._id === id)) return deleteWater({ id: id as Id<"water_logs"> });
      if (sleep && sleep._id === id) return deleteSleep({ id: id as Id<"sleep_logs"> });
      if ((mood ?? []).some((m) => m._id === id)) return deleteMood({ id: id as Id<"mood_logs"> });
    },
    [meals, workouts, water, sleep, mood, deleteMeal, deleteWorkout, deleteWater, deleteSleep, deleteMood],
  );

  const clear = useCallback(async () => {
    await Promise.all([
      ...(meals ?? []).map((m: { _id: Id<"meals"> }) => deleteMeal({ id: m._id })),
      ...(workouts ?? []).map((w: { _id: Id<"workouts"> }) => deleteWorkout({ id: w._id })),
      ...(water ?? []).map((w: { _id: Id<"water_logs"> }) => deleteWater({ id: w._id })),
      ...((mood ?? []).map((m: { _id: Id<"mood_logs"> }) => deleteMood({ id: m._id }))),
      ...(sleep ? [deleteSleep({ id: sleep._id })] : []),
    ]);
  }, [meals, workouts, water, sleep, mood, deleteMeal, deleteWorkout, deleteWater, deleteSleep, deleteMood]);

  return { logs, add, remove, clear };
}

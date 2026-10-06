import { v } from "convex/values";

/** Nutrients as in `@stride/core` `Nutrients`: kcal and macros required, fiber/sugar/sodium null when unknown. */
export const nutrientsValidator = v.object({
  kcal: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
  fiber: v.union(v.number(), v.null()),
  sugar: v.union(v.number(), v.null()),
  sodiumMg: v.union(v.number(), v.null()),
});

/** Where a food record's numbers come from (core `FoodSource`). */
export const foodSourceValidator = v.union(v.literal("fdc"), v.literal("ifct"), v.literal("off"), v.literal("user"));

/** Meal slot (core `MealSlot`, D16). */
export const mealSlotValidator = v.union(
  v.literal("breakfast"),
  v.literal("lunch"),
  v.literal("snack"),
  v.literal("dinner"),
);

/** How an entry's food was found. */
export const entrySourceValidator = v.union(v.literal("db"), v.literal("barcode"), v.literal("ai"), v.literal("memory"));

/** Who wrote a revision. */
export const createdByValidator = v.union(v.literal("user"), v.literal("ai"));

/** Which change a revision row records. */
export const revisionOpValidator = v.union(v.literal("add"), v.literal("edit"), v.literal("delete"), v.literal("undo"));

/** Revision state: one head per entry is `live` or `deleted`; every older row is `superseded`. */
export const revisionStatusValidator = v.union(v.literal("live"), v.literal("deleted"), v.literal("superseded"));

/** One `foods` row as written by the import scripts (core `FoodRecord`). */
export const foodRecordValidator = v.object({
  name: v.string(),
  aliases: v.array(v.string()),
  per100g: nutrientsValidator,
  source: foodSourceValidator,
  sourceId: v.string(),
  verified: v.boolean(),
});

/** One `food_portions` row as written by the import scripts (core `FoodPortionRecord`). */
export const foodPortionRecordValidator = v.object({
  source: foodSourceValidator,
  sourceId: v.string(),
  measure: v.string(),
  description: v.string(),
  gramsPerMeasure: v.number(),
});

/** One `exercises` row as written by the import scripts (core `ExerciseRecord`). */
export const exerciseRecordValidator = v.object({
  sourceId: v.string(),
  name: v.string(),
  category: v.string(),
  equipment: v.union(v.string(), v.null()),
  mechanic: v.union(v.string(), v.null()),
  level: v.union(v.string(), v.null()),
  primaryMuscles: v.array(v.string()),
  secondaryMuscles: v.array(v.string()),
});

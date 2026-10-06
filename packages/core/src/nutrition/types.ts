/** Where a food record's numbers come from. Mirrors the `foods.source` column in plan 007 section 3.2. */
export type FoodSource = "fdc" | "ifct" | "off" | "user";

/**
 * Nutrients for 100 g of a food, or for an actual amount once scaled.
 * kcal, protein, carbs and fat are required. Fiber, sugar and sodium are null when the source has no value.
 */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  sodiumMg: number | null;
}

/** One row of the `foods` table. Nutrients are per 100 g of edible portion. */
export interface FoodRecord {
  name: string;
  aliases: string[];
  per100g: Nutrients;
  source: FoodSource;
  sourceId: string;
  verified: boolean;
}

/** One row of the `food_portions` table: grams for one unit of a food-specific measure. */
export interface FoodPortionRecord {
  source: FoodSource;
  sourceId: string;
  measure: string;
  description: string;
  gramsPerMeasure: number;
}

/** One row of the `exercises` table. */
export interface ExerciseRecord {
  sourceId: string;
  name: string;
  category: string;
  equipment: string | null;
  mechanic: string | null;
  level: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

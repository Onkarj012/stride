import type { Nutrients } from "./types.ts";

/** Decimal places kept when a total is rounded for storage or display. */
export const KCAL_DECIMALS = 0;
export const MACRO_DECIMALS = 1;
export const SODIUM_MG_DECIMALS = 0;

/** Atwater general factors, kcal per gram (FAO 2003, "Food energy: methods of analysis and conversion factors"). */
export const ATWATER_KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Largest relative gap between stated kcal and 4P + 4C + 9F before a record is flagged inconsistent. */
export const ATWATER_TOLERANCE = 0.25;

/** Below this many kcal the Atwater check is skipped, because tiny values make the ratio meaningless. */
export const ATWATER_MIN_KCAL = 20;

/** All-zero nutrients, the identity for `sumNutrients`. */
export const ZERO_NUTRIENTS: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodiumMg: 0,
};

/** Rounds a non-negative value to a fixed number of decimals. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Scales a per-100 g record to an eaten amount. Returns unrounded values; round once at the total. */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`grams must be a finite non-negative number, got ${grams}`);
  }
  const ratio = grams / 100;
  return {
    kcal: per100g.kcal * ratio,
    protein: per100g.protein * ratio,
    carbs: per100g.carbs * ratio,
    fat: per100g.fat * ratio,
    fiber: per100g.fiber === null ? null : per100g.fiber * ratio,
    sugar: per100g.sugar === null ? null : per100g.sugar * ratio,
    sodiumMg: per100g.sodiumMg === null ? null : per100g.sodiumMg * ratio,
  };
}

/** Adds two optional nutrient values. Unknown plus anything stays unknown, so a total never hides missing data. */
function addOptional(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

/** Sums unrounded nutrients. Use this for meal and day totals, then call `roundNutrients` once. */
export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  return items.reduce<Nutrients>(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      protein: total.protein + item.protein,
      carbs: total.carbs + item.carbs,
      fat: total.fat + item.fat,
      fiber: addOptional(total.fiber, item.fiber),
      sugar: addOptional(total.sugar, item.sugar),
      sodiumMg: addOptional(total.sodiumMg, item.sodiumMg),
    }),
    ZERO_NUTRIENTS,
  );
}

/** Rounds nutrients for storage or display. Call this exactly once, on the final total. */
export function roundNutrients(n: Nutrients): Nutrients {
  return {
    kcal: roundTo(n.kcal, KCAL_DECIMALS),
    protein: roundTo(n.protein, MACRO_DECIMALS),
    carbs: roundTo(n.carbs, MACRO_DECIMALS),
    fat: roundTo(n.fat, MACRO_DECIMALS),
    fiber: n.fiber === null ? null : roundTo(n.fiber, MACRO_DECIMALS),
    sugar: n.sugar === null ? null : roundTo(n.sugar, MACRO_DECIMALS),
    sodiumMg: n.sodiumMg === null ? null : roundTo(n.sodiumMg, SODIUM_MG_DECIMALS),
  };
}

/** Totals a list of `{per100g, grams}` items: scale each, sum unrounded, round once. */
export function totalNutrients(items: readonly { per100g: Nutrients; grams: number }[]): Nutrients {
  return roundNutrients(sumNutrients(items.map((item) => scaleNutrients(item.per100g, item.grams))));
}

/** Energy implied by the macros using Atwater general factors. */
export function atwaterKcal(n: Pick<Nutrients, "protein" | "carbs" | "fat">): number {
  return (
    n.protein * ATWATER_KCAL_PER_G.protein +
    n.carbs * ATWATER_KCAL_PER_G.carbs +
    n.fat * ATWATER_KCAL_PER_G.fat
  );
}

/** True when stated kcal and macro energy disagree by more than `ATWATER_TOLERANCE`. Used to flag label and user foods. */
export function hasAtwaterMismatch(n: Pick<Nutrients, "kcal" | "protein" | "carbs" | "fat">): boolean {
  const macroKcal = atwaterKcal(n);
  const reference = Math.max(n.kcal, macroKcal);
  if (reference < ATWATER_MIN_KCAL) return false;
  return Math.abs(n.kcal - macroKcal) / reference > ATWATER_TOLERANCE;
}

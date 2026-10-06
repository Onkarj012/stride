import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  atwaterKcal,
  hasAtwaterMismatch,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  totalNutrients,
} from "./compute.ts";
import type { Nutrients } from "./types.ts";

/** SR Legacy rows (FoodData Central, release 2018-04), per 100 g, copied from food_nutrient.csv. */
const FDC = {
  riceWhiteCooked: { fdcId: 168878, per100g: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 } },
  eggWholeRaw: { fdcId: 171287, per100g: { kcal: 143, protein: 12.56, carbs: 0.72, fat: 9.51, fiber: 0, sugar: 0.37, sodiumMg: 142 } },
  bananaRaw: { fdcId: 173944, per100g: { kcal: 89, protein: 1.09, carbs: 22.84, fat: 0.33, fiber: 2.6, sugar: 12.23, sodiumMg: 1 } },
  almonds: { fdcId: 170567, per100g: { kcal: 579, protein: 21.15, carbs: 21.55, fat: 49.93, fiber: 12.5, sugar: 4.35, sodiumMg: 1 } },
  salmonAtlanticFarmedRaw: { fdcId: 175167, per100g: { kcal: 208, protein: 20.42, carbs: 0, fat: 13.42, fiber: 0, sugar: 0, sodiumMg: 59 } },
} satisfies Record<string, { fdcId: number; per100g: Nutrients }>;

const per100g = fc.record({
  kcal: fc.double({ min: 0, max: 900, noNaN: true }),
  protein: fc.double({ min: 0, max: 100, noNaN: true }),
  carbs: fc.double({ min: 0, max: 100, noNaN: true }),
  fat: fc.double({ min: 0, max: 100, noNaN: true }),
  fiber: fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: null }),
  sugar: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
  sodiumMg: fc.option(fc.double({ min: 0, max: 5000, noNaN: true }), { nil: null }),
});
const grams = fc.double({ min: 0, max: 2000, noNaN: true });

describe("golden values from FDC SR Legacy", () => {
  it("scales single foods to common portions (one cup rice 168878, 118 g banana 173944, 28 g almonds 170567, 85 g salmon 175167)", () => {
    expect(roundNutrients(scaleNutrients(FDC.riceWhiteCooked.per100g, 158))).toEqual({
      kcal: 205, protein: 4.3, carbs: 44.5, fat: 0.4, fiber: 0.6, sugar: 0.1, sodiumMg: 2,
    });
    expect(roundNutrients(scaleNutrients(FDC.bananaRaw.per100g, 118))).toMatchObject({ kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 });
    expect(roundNutrients(scaleNutrients(FDC.almonds.per100g, 28))).toMatchObject({ kcal: 162, protein: 5.9, carbs: 6, fat: 14 });
    expect(roundNutrients(scaleNutrients(FDC.salmonAtlanticFarmedRaw.per100g, 85))).toMatchObject({ kcal: 177, protein: 17.4, carbs: 0, fat: 11.4 });
  });

  it("totals a five-food day computed by hand with exact decimals", () => {
    const day = totalNutrients([
      { per100g: FDC.riceWhiteCooked.per100g, grams: 158 },
      { per100g: FDC.eggWholeRaw.per100g, grams: 100 },
      { per100g: FDC.bananaRaw.per100g, grams: 118 },
      { per100g: FDC.almonds.per100g, grams: 28 },
      { per100g: FDC.salmonAtlanticFarmedRaw.per100g, grams: 85 },
    ]);
    // Exact sums: 792.34 kcal, 41.3754 P, 78.2138 C, 35.7292 F, 7.2 fiber, 16.0984 sugar, 195.19 mg Na.
    expect(day).toEqual({ kcal: 792, protein: 41.4, carbs: 78.2, fat: 35.7, fiber: 7.2, sugar: 16.1, sodiumMg: 195 });
  });

  it("returns the record itself at 100 g", () => {
    expect(scaleNutrients(FDC.eggWholeRaw.per100g, 100)).toEqual(FDC.eggWholeRaw.per100g);
  });

  it("keeps FDC records Atwater-consistent", () => {
    for (const { per100g: row } of Object.values(FDC)) expect(hasAtwaterMismatch(row)).toBe(false);
  });
});

describe("rounding once at the total", () => {
  it("does not lose energy that per-item rounding would drop", () => {
    const tiny = { kcal: 40, protein: 0, carbs: 10, fat: 0, fiber: null, sugar: null, sodiumMg: null };
    const items = [1, 1, 1].map(() => ({ per100g: tiny, grams: 1 }));
    const perItemRounded = items.reduce((s, i) => s + Math.round(scaleNutrients(i.per100g, i.grams).kcal), 0);
    expect(perItemRounded).toBe(0);
    expect(totalNutrients(items).kcal).toBe(1);
  });

  it("propagates unknown optional nutrients instead of treating them as zero", () => {
    const known = { ...FDC.bananaRaw.per100g };
    const unknownFiber = { ...known, fiber: null };
    expect(totalNutrients([{ per100g: known, grams: 100 }, { per100g: unknownFiber, grams: 100 }]).fiber).toBeNull();
  });

  it("rejects negative and non-finite grams", () => {
    expect(() => scaleNutrients(FDC.bananaRaw.per100g, -1)).toThrow(RangeError);
    expect(() => scaleNutrients(FDC.bananaRaw.per100g, Number.NaN)).toThrow(RangeError);
  });
});

describe("properties", () => {
  it("is linear in grams: scale(a + b) = scale(a) + scale(b)", () => {
    fc.assert(
      fc.property(per100g, grams, grams, (food, a, b) => {
        const whole = scaleNutrients(food, a + b);
        const parts = sumNutrients([scaleNutrients(food, a), scaleNutrients(food, b)]);
        expect(whole.kcal).toBeCloseTo(parts.kcal, 6);
        expect(whole.protein).toBeCloseTo(parts.protein, 6);
        expect(whole.fat).toBeCloseTo(parts.fat, 6);
      }),
    );
  });

  it("totals equal the rounded sum of unrounded items", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ per100g, grams }), { maxLength: 12 }), (items) => {
        const total = totalNutrients(items);
        const exact = sumNutrients(items.map((i) => scaleNutrients(i.per100g, i.grams)));
        expect(total).toEqual(roundNutrients(exact));
        expect(Math.abs(total.kcal - exact.kcal)).toBeLessThanOrEqual(0.5 + 1e-9);
      }),
    );
  });

  it("keeps the kcal-to-macro ratio of the source record at any amount", () => {
    fc.assert(
      fc.property(per100g, fc.double({ min: 1, max: 2000, noNaN: true }), (food, g) => {
        const scaled = scaleNutrients(food, g);
        expect(atwaterKcal(scaled)).toBeCloseTo((atwaterKcal(food) * g) / 100, 6);
      }),
    );
  });
});

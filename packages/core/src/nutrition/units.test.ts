import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HOUSEHOLD_VESSELS, MASS_UNITS_G, VOLUME_UNITS_ML } from "./household_measures.ts";
import { densityFor, normalizeUnit, PORTION_CONFIDENCE, resolvePortion, type PortionResult } from "./units.ts";

/** Grams from a result that must be resolved. */
function gramsOf(result: PortionResult): number {
  if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.reason}`);
  return result.grams;
}

describe("normalizeUnit", () => {
  it("maps spellings and plurals to one unit", () => {
    expect(normalizeUnit("Grams")).toBe("g");
    expect(normalizeUnit("tbsps")).toBe("tbsp");
    expect(normalizeUnit("Katoris")).toBe("katori");
    expect(normalizeUnit("glasses")).toBe("glass");
    expect(normalizeUnit("fl. oz")).toBe("fl oz");
    expect(normalizeUnit("pcs")).toBe("piece");
    expect(normalizeUnit("")).toBe("piece");
    expect(normalizeUnit(null)).toBe("piece");
  });
});

describe("mass", () => {
  it("converts mass units exactly", () => {
    expect(resolvePortion({ quantity: 150, unit: "g" }, { foodName: "paneer" })).toEqual({
      status: "resolved", grams: 150, confidence: 1, method: "mass",
    });
    expect(gramsOf(resolvePortion({ quantity: 0.25, unit: "kg" }, { foodName: "chicken" }))).toBe(250);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "lb" }, { foodName: "chicken" }))).toBeCloseTo(453.59237, 10);
  });
});

describe("volume", () => {
  it("multiplies ml by the food density", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Milk, whole" }))).toBeCloseTo(240 * 1.031, 6);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "tbsp" }, { foodName: "ghee" }))).toBeCloseTo(15 * 0.866, 6);
  });

  it("prefers the record's own density over the seed table", () => {
    const r = resolvePortion({ quantity: 100, unit: "ml" }, { foodName: "milk", densityGPerMl: 1.1 });
    expect(r).toMatchObject({ status: "resolved", confidence: PORTION_CONFIDENCE.volumeRecordDensity });
    expect(gramsOf(r)).toBeCloseTo(110, 9);
  });

  it("is unresolved without a density, never read as water", () => {
    expect(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "mystery curry" })).toEqual({
      status: "unresolved", reason: "missing_density",
    });
  });

  it("does not use raw-rice density for cooked rice", () => {
    expect(densityFor("Rice, white, long-grain, regular, enriched, cooked")).toBe(0.668);
    expect(densityFor("Rice, white, long-grain, regular, raw, unenriched")).toBe(0.782);
    expect(densityFor("rice")).toBeNull();
  });
});

describe("household measures", () => {
  it("resolves a katori of dal as 150 ml at dal density, with household confidence", () => {
    const r = resolvePortion({ quantity: 1, unit: "katori" }, { foodName: "dal" });
    expect(r).toMatchObject({ status: "resolved", method: "volume", confidence: PORTION_CONFIDENCE.householdVessel });
    expect(gramsOf(r)).toBeCloseTo(150 * 0.837, 6);
  });

  it("resolves roti by count at 40 g", () => {
    expect(gramsOf(resolvePortion({ quantity: 2, unit: "rotis" }, { foodName: "roti" }))).toBe(80);
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, { foodName: "Roti" }))).toBe(80);
  });

  it("leaves a plate unresolved unless the food has a plate portion", () => {
    expect(resolvePortion({ quantity: 1, unit: "plate" }, { foodName: "poha" })).toEqual({
      status: "unresolved", reason: "food_specific_measure",
    });
    expect(gramsOf(resolvePortion(
      { quantity: 1, unit: "plate" },
      { foodName: "poha", portions: [{ measure: "plate", gramsPerMeasure: 220 }] },
    ))).toBe(220);
  });

  it("uses the user's own measure first", () => {
    const ctx = { foodName: "dal", userMeasures: [{ measure: "katori", ml: 200 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "katori" }, ctx))).toBeCloseTo(200 * 0.837, 6);
    const roti = { foodName: "roti", userMeasures: [{ measure: "roti", grams: 45 }] };
    expect(resolvePortion({ quantity: 2, unit: "roti" }, roti)).toMatchObject({ grams: 90, method: "user_measure" });
    expect(resolvePortion({ quantity: 2, unit: "piece" }, roti)).toMatchObject({ grams: 90, method: "user_measure" });
  });

  it("skips a food's portion rows when one measure has two different weights", () => {
    const portions = [
      { measure: "cup", gramsPerMeasure: 225 },
      { measure: "cup", gramsPerMeasure: 150 },
    ];
    expect(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Bananas, raw", portions })).toEqual({
      status: "unresolved", reason: "missing_density",
    });
  });

  it("rejects unknown units and bad quantities", () => {
    expect(resolvePortion({ quantity: 1, unit: "handful" }, { foodName: "peanuts" })).toEqual({ status: "unresolved", reason: "unknown_unit" });
    expect(resolvePortion({ quantity: 0, unit: "g" }, { foodName: "peanuts" })).toEqual({ status: "unresolved", reason: "invalid_quantity" });
    expect(resolvePortion({ quantity: Number.NaN, unit: "g" }, { foodName: "peanuts" })).toEqual({ status: "unresolved", reason: "invalid_quantity" });
    expect(resolvePortion({ quantity: 1, unit: "piece" }, { foodName: "biryani" })).toEqual({ status: "unresolved", reason: "missing_piece_weight" });
  });
});

describe("properties", () => {
  const quantity = fc.double({ min: 0.01, max: 1000, noNaN: true });

  it("round-trips every mass unit: grams / gramsPerUnit returns the quantity", () => {
    fc.assert(
      fc.property(quantity, fc.constantFrom(...Object.keys(MASS_UNITS_G)), (q, unit) => {
        const grams = gramsOf(resolvePortion({ quantity: q, unit }, { foodName: "x" }));
        expect(grams / (MASS_UNITS_G[unit] ?? Number.NaN)).toBeCloseTo(q, 9);
      }),
    );
  });

  it("round-trips every volume unit through density", () => {
    const units = [...Object.keys(VOLUME_UNITS_ML), ...Object.keys(HOUSEHOLD_VESSELS)];
    const density = fc.double({ min: 0.2, max: 2, noNaN: true });
    fc.assert(
      fc.property(quantity, fc.constantFrom(...units), density, (q, unit, d) => {
        const grams = gramsOf(resolvePortion({ quantity: q, unit }, { foodName: "x", densityGPerMl: d }));
        const ml = VOLUME_UNITS_ML[unit] ?? HOUSEHOLD_VESSELS[unit]?.ml ?? Number.NaN;
        expect(grams / d / ml).toBeCloseTo(q, 9);
      }),
    );
  });

  it("is linear in quantity for every resolved unit", () => {
    const units = ["g", "cup", "katori", "piece", "tbsp"];
    fc.assert(
      fc.property(quantity, fc.constantFrom(...units), (q, unit) => {
        const ctx = { foodName: "cooked rice roti" };
        const one = gramsOf(resolvePortion({ quantity: 1, unit }, ctx));
        expect(gramsOf(resolvePortion({ quantity: q, unit }, ctx))).toBeCloseTo(one * q, 6);
      }),
    );
  });

  it("never returns grams for an unknown unit", () => {
    const known = new Set(["g", "kg", "mg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "katori", "bowl", "glass", "ladle", "piece", "roti", "chapati", "phulka", "paratha", "idli", "egg"]);
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{4,9}$/), (unit) => {
        fc.pre(!known.has(normalizeUnit(unit)));
        const r = resolvePortion({ quantity: 1, unit }, { foodName: "mystery" });
        expect(r.status).toBe("unresolved");
      }),
    );
  });
});

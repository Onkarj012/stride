import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HOUSEHOLD_VESSELS, MASS_UNITS_G, VOLUME_UNITS_ML } from "./household_measures.ts";
import { densityFor, normalizeUnit, PORTION_CONFIDENCE, resolvePortion, type PortionResult, unitLabel, type UserMeasure } from "./units.ts";

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

  it("applies a seed density only when it names the food's head word", () => {
    expect(densityFor("Amul Taaza toned milk")).toBe(1.031);
    expect(densityFor("Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled")).toBe(0.693);
    expect(densityFor("Milk chocolate")).toBeNull();
    expect(densityFor("Candies, milk chocolate")).toBeNull();
    expect(densityFor("Fish, tuna, light, canned in oil")).toBeNull();
    expect(resolvePortion({ quantity: 100, unit: "ml" }, { foodName: "Milk chocolate" })).toEqual({
      status: "unresolved", reason: "missing_density",
    });
    expect(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Milk chocolate" })).toEqual({
      status: "unresolved", reason: "missing_density",
    });
  });

  it("reads the drink after a category word, and gives no density to a powder or mix", () => {
    expect(densityFor("Beverages, tea, black, brewed")).toBe(1.01);
    expect(densityFor("Beverages, coffee, brewed")).toBe(1.01);
    expect(densityFor("Tea with milk")).toBe(1.01);
    expect(densityFor("Beverages, coffee, instant, prepared with water")).toBeNull();
    expect(densityFor("Coffee, instant, powder")).toBeNull();
    expect(densityFor("Beverages, tea, instant, unsweetened, powder")).toBeNull();
  });

  it("gives no drink density to leaves, ground beans, creamer or bags", () => {
    expect(densityFor("Tea, leaves")).toBeNull();
    expect(densityFor("Beverages, coffee, ground")).toBeNull();
    expect(densityFor("Coffee, creamer, non-dairy")).toBeNull();
    expect(densityFor("Tea, bags")).toBeNull();
    expect(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Tea, leaves" })).toEqual({
      status: "unresolved", reason: "missing_density",
    });
  });
});

describe("household measures", () => {
  it("resolves a katori of dal as 150 ml at served-dal density, with household confidence", () => {
    const r = resolvePortion({ quantity: 1, unit: "katori" }, { foodName: "dal" });
    expect(r).toMatchObject({ status: "resolved", method: "volume", confidence: PORTION_CONFIDENCE.householdVessel });
    expect(gramsOf(r)).toBeCloseTo(150 * 1.01, 6);
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
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "katori" }, ctx))).toBeCloseTo(200 * 1.01, 6);
    const roti = { foodName: "roti", userMeasures: [{ measure: "roti", grams: 45 }] };
    expect(resolvePortion({ quantity: 2, unit: "roti" }, roti)).toMatchObject({ grams: 90, method: "user_measure" });
    expect(resolvePortion({ quantity: 2, unit: "piece" }, roti)).toMatchObject({ grams: 90, method: "user_measure" });
  });

  it("stays unresolved when one measure has two different weights, even with a density to fall back on", () => {
    const portions = [
      { measure: "cup", gramsPerMeasure: 225 },
      { measure: "cup", gramsPerMeasure: 150 },
    ];
    const conflict = { status: "unresolved", reason: "conflicting_portions" };
    expect(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Bananas, raw", portions })).toEqual(conflict);
    expect(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "cooked rice", portions })).toEqual(conflict);
  });

  it("uses the user's saved volume over the food's own portion for that measure", () => {
    const ctx = {
      foodName: "Milk, whole",
      portions: [{ measure: "cup", gramsPerMeasure: 244 }],
      userMeasures: [{ measure: "cup", ml: 180 }],
    };
    const r = resolvePortion({ quantity: 1, unit: "cup" }, ctx);
    expect(r).toMatchObject({ status: "resolved", method: "volume" });
    expect(gramsOf(r)).toBeCloseTo(180 * 1.031, 6);
  });

  it("rejects unknown units and bad quantities", () => {
    expect(resolvePortion({ quantity: 1, unit: "handful" }, { foodName: "peanuts" })).toEqual({ status: "unresolved", reason: "unknown_unit" });
    expect(resolvePortion({ quantity: 1, unit: "constructor" }, { foodName: "milk" })).toEqual({ status: "unresolved", reason: "unknown_unit" });
    expect(resolvePortion({ quantity: 0, unit: "g" }, { foodName: "peanuts" })).toEqual({ status: "unresolved", reason: "invalid_quantity" });
    expect(resolvePortion({ quantity: Number.NaN, unit: "g" }, { foodName: "peanuts" })).toEqual({ status: "unresolved", reason: "invalid_quantity" });
    expect(resolvePortion({ quantity: 1, unit: "piece" }, { foodName: "biryani" })).toEqual({ status: "unresolved", reason: "missing_piece_weight" });
  });
});

describe("counts and spoons", () => {
  it("uses the food's count row for a count with no unit", () => {
    const portions = [{ measure: "cookie", gramsPerMeasure: 5.6 }];
    expect(resolvePortion({ quantity: 2, unit: null }, { foodName: "Biscuits, marie", portions })).toMatchObject({
      status: "resolved", grams: 11.2, method: "food_portion",
    });
  });

  it("stays unresolved when count rows disagree on grams", () => {
    const portions = [{ measure: "cookie", gramsPerMeasure: 5.6 }, { measure: "biscuit", gramsPerMeasure: 8 }];
    expect(resolvePortion({ quantity: 2, unit: null }, { foodName: "Biscuits, marie", portions })).toEqual({
      status: "unresolved", reason: "conflicting_portions",
    });
  });

  it("ignores a portion row whose label is not a count", () => {
    const portions = [{ measure: "package", gramsPerMeasure: 200 }];
    expect(resolvePortion({ quantity: 1, unit: null }, { foodName: "Biscuits, marie", portions })).toEqual({
      status: "unresolved", reason: "missing_piece_weight",
    });
  });

  it("uses the seed roti weight over a packaged 68 g piece row", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 68 }];
    expect(resolvePortion({ quantity: 2, unit: null }, { foodName: "roti", portions })).toMatchObject({
      grams: 80, method: "piece",
    });
  });

  it("uses the food's exact piece row for an explicit piece unit", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 68 }];
    expect(resolvePortion({ quantity: 2, unit: "piece" }, { foodName: "roti", portions })).toMatchObject({
      grams: 136, method: "food_portion",
    });
  });

  it("uses a saved count measure before the food's count row", () => {
    const ctx = {
      foodName: "Biscuits, marie",
      portions: [{ measure: "cookie", gramsPerMeasure: 5.6 }],
      userMeasures: [{ measure: "cookie", grams: 8 }],
    };
    expect(resolvePortion({ quantity: 2, unit: null }, ctx)).toMatchObject({
      grams: 16, method: "user_measure",
    });
  });

  it.each([
    { userMeasures: [
      { measure: "cookie", grams: 8 },
      { measure: "slice", grams: 20 },
    ] },
    { userMeasures: [
      { measure: "slice", grams: 20 },
      { measure: "cookie", grams: 8 },
    ] },
  ] satisfies { userMeasures: UserMeasure[] }[])("rejects conflicting inferred saved count weights regardless of order", ({ userMeasures }) => {
    expect(resolvePortion({ quantity: 2, unit: null }, {
      foodName: "Biscuits, marie",
      portions: [{ measure: "cookie", gramsPerMeasure: 5.6 }, { measure: "slice", gramsPerMeasure: 10 }],
      userMeasures,
    })).toEqual({ status: "unresolved", reason: "conflicting_portions" });
  });

  it.each(["piece", "Biscuits, marie"])("prefers direct saved %s measure over conflicting inferred counts", (measure) => {
    expect(resolvePortion({ quantity: 2, unit: null }, {
      foodName: "Biscuits, marie",
      densityGPerMl: 1,
      portions: [{ measure: "cookie", gramsPerMeasure: 5.6 }, { measure: "slice", gramsPerMeasure: 10 }],
      userMeasures: [
        { measure: "cookie", grams: 8 },
        { measure: "slice", grams: 20 },
        { measure, ml: 10 },
      ],
    })).toMatchObject({ status: "resolved", grams: 20, method: "volume" });
  });

  it("does not use ingredient alternatives as piece seed heads", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 90 }];
    expect(resolvePortion({ quantity: 1, unit: null }, { foodName: "Turnover, apple or cherry", portions })).toMatchObject({
      grams: 90, method: "food_portion",
    });
  });

  it("reads a spoon as a 5 ml teaspoon", () => {
    expect(resolvePortion({ quantity: 1, unit: "spoon" }, { foodName: "mystery", densityGPerMl: 1 })).toMatchObject({
      grams: 5, method: "volume",
    });
  });

  it("does not give a compound food the egg seed weight when egg is only a modifier", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 30 }];
    expect(gramsOf(resolvePortion({ quantity: 1, unit: null }, { foodName: "Bread, egg", portions }))).toBe(30);
    const noodles = [{ measure: "piece", gramsPerMeasure: 60 }];
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, { foodName: "Egg noodles", portions: noodles }))).toBe(120);
  });

  it("uses an explicit piece row even when a different-weight slice row exists", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 5.6 }, { measure: "slice", gramsPerMeasure: 10 }];
    expect(resolvePortion({ quantity: 2, unit: "piece" }, { foodName: "Biscuits, marie", portions })).toMatchObject({
      grams: 11.2, method: "food_portion",
    });
  });

  it("gives the phulka weight, not the roti weight or a packaged row, to 'Phulka roti'", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 68 }];
    expect(resolvePortion({ quantity: 2, unit: "phulka" }, { foodName: "Phulka roti", portions })).toMatchObject({
      grams: 60, method: "piece",
    });
  });

  it("does not give a named unit like roti to another food", () => {
    expect(resolvePortion({ quantity: 1, unit: "roti" }, { foodName: "Beverages, coffee, instant, powder" })).toEqual({
      status: "unresolved", reason: "missing_piece_weight",
    });
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "roti" }, { foodName: "Roti" }))).toBe(40);
  });

  it("gives a flatbread second part the seed, but keeps a modifier like egg as the bread's own row", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 68 }];
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, { foodName: "Bread, paratha", portions }))).toBe(160);
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, { foodName: "Bread, chapati, whole wheat", portions }))).toBe(80);
    const egg = [{ measure: "piece", gramsPerMeasure: 30 }];
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, { foodName: "Bread, egg", portions: egg }))).toBe(60);
  });

  it("keeps 'brewed from grounds' drinks eligible for density, and blocks plain ground coffee", () => {
    expect(densityFor("Coffee, brewed from grounds")).toBe(1.01);
    expect(densityFor("Beverages, coffee, ground")).toBeNull();
  });

  it("counts a named unit only for the food's own seed, with aliases", () => {
    expect(resolvePortion({ quantity: 1, unit: "roti" }, { foodName: "Bananas, raw" })).toEqual({
      status: "unresolved", reason: "missing_piece_weight",
    });
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "banana" }, { foodName: "Bananas, raw" }))).toBe(118);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "chapati" }, { foodName: "Roti" }))).toBe(40);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "roti" }, { foodName: "Chapati" }))).toBe(40);
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
        const ctx = { foodName: "cooked rice roti", densityGPerMl: 0.668 };
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

describe("AI estimate portions", () => {
  const chai = { foodName: "Masala chai", portions: [{ measure: "teacup", gramsPerMeasure: 104 }], skipSeedPieceWeights: true };

  it("keeps the normal order: a saved teacup beats the estimate's row, and grams stay exact", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "teacup" }, { ...chai, userMeasures: [{ measure: "teacup", grams: 200 }] }))).toBe(200);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "teacup" }, chai))).toBe(104);
    expect(gramsOf(resolvePortion({ quantity: 100, unit: "g" }, chai))).toBe(100);
  });

  it("a saved piece row answers a named count, and the seed is skipped", () => {
    const paratha = { foodName: "Masala paratha", portions: [{ measure: "piece", gramsPerMeasure: 120 }] };
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, paratha))).toBe(160);
    const estimate = { ...paratha, skipSeedPieceWeights: true };
    expect(gramsOf(resolvePortion({ quantity: 2, unit: "paratha" }, estimate))).toBe(240);
    expect(gramsOf(resolvePortion({ quantity: 2, unit: null }, estimate))).toBe(240);
  });

  it("a slice of a whole-pizza estimate does not reuse its piece row", () => {
    const pizza = { foodName: "Pizza", portions: [{ measure: "piece", gramsPerMeasure: 400 }], skipSeedPieceWeights: true };
    expect(resolvePortion({ quantity: 2, unit: "slice" }, pizza)).toEqual({ status: "unresolved", reason: "food_specific_measure" });
  });

  it("a bare count of an estimate made from slices stays unresolved when it has no piece row", () => {
    const paratha = { foodName: "Masala paratha", portions: [{ measure: "slice", gramsPerMeasure: 20 }], skipSeedPieceWeights: true };
    expect(resolvePortion({ quantity: 2, unit: null }, paratha)).toEqual({ status: "unresolved", reason: "missing_piece_weight" });
  });
});

describe("cup size", () => {
  it("a cup of tea or chai is a teacup, and other drinks keep the standard cup", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Tea" }))).toBeCloseTo(110 * 1.01, 6);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Chai" }))).toBeCloseTo(110 * 1.01, 6);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Coffee" }))).toBeCloseTo(240 * 1.01, 6);
  });

  it("dry tea leaves keep the standard cup even with a density given", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Tea, leaves", densityGPerMl: 0.4 }))).toBeCloseTo(96, 6);
  });

  it("masala chai and masala tea are drinks, so they use the teacup", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Masala chai", densityGPerMl: 1 }))).toBe(110);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Masala tea", densityGPerMl: 1 }))).toBe(110);
  });

  it("a cup of chai resolves as a teacup: saved teacup grams, then the food's teacup row, then the seed", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Chai", userMeasures: [{ measure: "teacup", grams: 150 }] }))).toBe(150);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Chai", portions: [{ measure: "teacup", gramsPerMeasure: 130 }] }))).toBe(130);
  });

  it("a saved volume for a bread beats the food's named row", () => {
    const roti = { foodName: "Roti", densityGPerMl: 1, userMeasures: [{ measure: "roti", ml: 45 }], portions: [{ measure: "roti", gramsPerMeasure: 50 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "roti" }, roti))).toBe(45);
  });

  it("a saved cup still wins over a saved teacup", () => {
    const withCup = { foodName: "Chai", densityGPerMl: 1, userMeasures: [{ measure: "teacup", ml: 150 }, { measure: "cup", ml: 200 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, withCup))).toBe(200);
  });

  it("a dry or oily product named tea keeps the standard cup", () => {
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Tea seed oil", densityGPerMl: 1 }))).toBe(240);
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "Tea, hot, with milk", densityGPerMl: 1 }))).toBe(110);
  });

  it("the user's saved teacup beats the household size, and a saved cup beats both", () => {
    const teacup = { foodName: "Chai", densityGPerMl: 1, userMeasures: [{ measure: "teacup", ml: 150 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, teacup))).toBe(150);
    const withCup = { ...teacup, userMeasures: [{ measure: "teacup", ml: 150 }, { measure: "cup", ml: 200 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "cup" }, withCup))).toBe(200);
  });
});

describe("unitLabel", () => {
  it("names the piece for a food with a piece weight, and says pc for other foods", () => {
    expect(unitLabel("piece", "Roti")).toBe("roti");
    expect(unitLabel(null, "Roti")).toBe("roti");
    expect(unitLabel("piece", "Phulka roti")).toBe("roti");
    expect(unitLabel("piece", "Cookies, chocolate chip")).toBe("pc");
    expect(unitLabel(null, "Cookies, chocolate chip")).toBe("pc");
  });

  it("returns any other unit unchanged", () => {
    expect(unitLabel("ml", "Roti")).toBe("ml");
    expect(unitLabel("cup", "Chai")).toBe("cup");
  });
});

describe("named rows beat the bread seeds", () => {
  it("a stuffed naan's own naan row answers 1 naan, and without it the stuffed name stays unresolved", () => {
    const row = { foodName: "Stuffed naan", portions: [{ measure: "naan", gramsPerMeasure: 125 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "naan" }, row))).toBe(125);
    expect(resolvePortion({ quantity: 1, unit: "naan" }, { foodName: "Stuffed naan" })).toEqual({
      status: "unresolved",
      reason: "missing_piece_weight",
    });
  });

  it("an amritsari kulcha's own kulcha row answers 1 kulcha, and without it the amritsari name stays unresolved", () => {
    const row = { foodName: "Amritsari kulcha", portions: [{ measure: "kulcha", gramsPerMeasure: 150 }] };
    expect(gramsOf(resolvePortion({ quantity: 1, unit: "kulcha" }, row))).toBe(150);
    expect(resolvePortion({ quantity: 1, unit: "kulcha" }, { foodName: "Amritsari kulcha" })).toEqual({
      status: "unresolved",
      reason: "missing_piece_weight",
    });
  });
});

/**
 * Named tests for the slice 4 cases in the v5 handoff that are pure math.
 * Cases 1, 4, 6, 7, 8, 11 and 12 need the backend pipeline and are covered in slice 4.
 */
import { describe, expect, it } from "vitest";
import { budgetAdjustmentKcal, plannedPerTrainingDayKcal, sessionBurnKcal } from "./energy/workout_burn.ts";
import { atwaterKcal, roundNutrients, scaleNutrients, sumNutrients, totalNutrients } from "./nutrition/compute.ts";
import { clampFlags, combineConfidence, evaluateGate } from "./nutrition/gate.ts";
import { rankCandidates, selectMatch } from "./nutrition/match.ts";
import type { Nutrients } from "./nutrition/types.ts";
import { PORTION_CONFIDENCE, resolvePortion } from "./nutrition/units.ts";

/** FDC 171844, SR Legacy "Bread, chapati or roti, plain, commercially prepared", per 100 g. */
const CHAPATI: Nutrients = { kcal: 297, protein: 11.25, carbs: 46.36, fat: 7.45, fiber: 4.9, sugar: 2.72, sodiumMg: 409 };
/** FDC 168878, SR Legacy "Rice, white, long-grain, regular, enriched, cooked", per 100 g. */
const RICE_COOKED: Nutrients = { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 };

describe("HANDOFF #2: food memory respects quantity", () => {
  it("does not match '4 rotis and dal' to a saved '2 rotis and dal'", () => {
    const memories = [{ name: "2 rotis and dal" }];
    expect(selectMatch(rankCandidates("4 rotis and dal", memories))).toEqual({ status: "no_match" });
    expect(selectMatch(rankCandidates("2 rotis and dal", memories))).toMatchObject({ status: "matched", score: 1 });
  });

  it("does not match swapped amounts: '2 rotis and 1 dal' vs a saved '1 roti and 2 dal'", () => {
    expect(selectMatch(rankCandidates("2 rotis and 1 dal", [{ name: "1 roti and 2 dal" }]))).toEqual({ status: "no_match" });
    expect(selectMatch(rankCandidates("2 rotis and 1 dal", [{ name: "1 dal and 2 chapatis" }]))).toMatchObject({ status: "matched" });
    expect(selectMatch(rankCandidates("2 cups of rice and 1 cup dal", [{ name: "1 cup rice and 2 cups dal" }]))).toEqual({ status: "no_match" });
    expect(selectMatch(rankCandidates("2 cups rice and 1 tbsp oil", [{ name: "2 tbsp rice and 1 cup oil" }]))).toEqual({ status: "no_match" });
    expect(selectMatch(rankCandidates("2 cups rice and 1 tbsp oil", [{ name: "1 tbsp oil and 2 cups rice" }]))).toMatchObject({ status: "matched" });
  });
});

describe("HANDOFF #3: aliases match at ranking, not only at search", () => {
  it("resolves 'roti' to a chapati record with nonzero kcal", () => {
    const foods = [
      { name: "Chapati", per100g: CHAPATI },
      { name: "Rice, white, cooked", per100g: RICE_COOKED },
    ];
    const pick = selectMatch(rankCandidates("roti", foods));
    if (pick.status !== "matched") throw new Error(`expected a match, got ${pick.status}`);
    expect(pick.candidate.name).toBe("Chapati");
    expect(scaleNutrients(pick.candidate.per100g, 80).kcal).toBeGreaterThan(0);
  });

  it("uses a record's own aliases when its name shares no words with the query", () => {
    const foods = [{ name: "Wheat flatbread", aliases: ["phulka"] }, { name: "Wheat flour" }];
    expect(selectMatch(rankCandidates("phulka", foods))).toMatchObject({ status: "matched", candidate: { name: "Wheat flatbread" } });
  });
});

describe("HANDOFF #5: label photo values stay per 100 g and scale by grams eaten", () => {
  it("logs 120 kcal for a 30 g snack labelled 400 kcal/100 g", () => {
    const label: Nutrients = { kcal: 400, protein: 8, carbs: 60, fat: 14, fiber: null, sugar: null, sodiumMg: null };
    expect(roundNutrients(scaleNutrients(label, 30))).toMatchObject({ kcal: 120, protein: 2.4, carbs: 18, fat: 4.2 });
  });
});

describe("HANDOFF #9: household units", () => {
  it("'1 cup cooked rice' uses the cooked-rice density, not raw rice", () => {
    const r = resolvePortion({ quantity: 1, unit: "cup" }, { foodName: "cooked rice" });
    expect(r).toMatchObject({ status: "resolved", method: "volume" });
    if (r.status === "resolved") expect(r.grams).toBeCloseTo(240 * 0.668, 6);
  });

  it("'1 phulka' resolves as one piece", () => {
    expect(resolvePortion({ quantity: 1, unit: "phulka" }, { foodName: "phulka" })).toMatchObject({
      status: "resolved", grams: 30, method: "piece",
    });
    expect(resolvePortion({ quantity: 1, unit: "piece" }, { foodName: "phulka" })).toMatchObject({ grams: 30 });
    expect(resolvePortion({ quantity: 1, unit: null }, { foodName: "phulka" })).toMatchObject({ grams: 30 });
  });

  it("prefers the matched food's own piece weight", () => {
    const portions = [{ measure: "piece", gramsPerMeasure: 68 }];
    expect(resolvePortion({ quantity: 2, unit: "roti" }, { foodName: "Bread, chapati or roti", portions })).toMatchObject({
      grams: 136, method: "food_portion",
    });
  });
});

describe("HANDOFF #10: net MET used consistently; a short walk never lowers the budget", () => {
  const kg = 70;
  const strengthHour = { met: 5, durationMin: 60 };
  const plan = [{ session: strengthHour, sessionsPerWeek: 3 }];

  it("plans and logs the same session to the same kcal", () => {
    expect(plannedPerTrainingDayKcal(plan, kg)).toBe(sessionBurnKcal(strengthHour, kg));
    expect(sessionBurnKcal(strengthHour, kg)).toBeCloseTo((5 - 1) * kg * 1 * 1.07, 9);
  });

  it("logging a 20-minute walk changes the budget by zero, same as logging nothing", () => {
    const planned = plannedPerTrainingDayKcal(plan, kg) ?? Number.NaN;
    const walk = sessionBurnKcal({ met: 3.5, durationMin: 20 }, kg) ?? Number.NaN;
    expect(budgetAdjustmentKcal(walk, planned)).toBe(0);
    expect(budgetAdjustmentKcal(0, planned)).toBe(0);
    expect(budgetAdjustmentKcal(planned + 150, planned)).toBeCloseTo(150, 9);
  });
});

describe("HANDOFF #13: kcal and macros stay consistent and reproducible", () => {
  it("reproduces each entry from per-100 g × grams, and the day total from the unrounded entries", () => {
    const entries = [
      { per100g: CHAPATI, grams: 80 },
      { per100g: CHAPATI, grams: 40 },
    ];
    const day = totalNutrients(entries);
    expect(day).toEqual(roundNutrients(scaleNutrients(CHAPATI, 120)));
    expect(day).toEqual(roundNutrients(sumNutrients(entries.map((e) => scaleNutrients(e.per100g, e.grams)))));
  });

  it("keeps the kcal-to-macro ratio of the source row", () => {
    const scaled = scaleNutrients(CHAPATI, 80);
    expect(scaled.kcal / atwaterKcal(scaled)).toBeCloseTo(CHAPATI.kcal / atwaterKcal(CHAPATI), 12);
  });

  it("flags a 500 kcal item whose macros only add up to 125 kcal", () => {
    const bad: Nutrients = { kcal: 500, protein: 10, carbs: 10, fat: 5, fiber: null, sugar: null, sodiumMg: null };
    expect(clampFlags(200, bad)).toContain("atwater_mismatch");
  });
});

describe("HANDOFF #14: barcode servings in ml use density, never read as grams", () => {
  it("converts a 250 ml milk serving with milk density", () => {
    const r = resolvePortion({ quantity: 250, unit: "ml" }, { foodName: "Amul Taaza toned milk" });
    if (r.status !== "resolved") throw new Error("expected resolved");
    expect(r.grams).toBeCloseTo(250 * 1.031, 6);
    expect(r.grams).not.toBe(250);
  });

  it("uses the product's own density when OFF provides one", () => {
    expect(resolvePortion({ quantity: 330, unit: "ml" }, { foodName: "Cola", densityGPerMl: 1.04 })).toMatchObject({
      status: "resolved",
      method: "volume",
    });
  });

  it("asks instead of assuming 1 g/ml when no density is known", () => {
    expect(resolvePortion({ quantity: 250, unit: "ml" }, { foodName: "Cola" })).toEqual({ status: "unresolved", reason: "missing_density" });
  });
});

describe("HANDOFF #15: confidence combines conservatively; a low portion is never overwritten", () => {
  it("takes the weakest of extraction, portion and match", () => {
    expect(combineConfidence({ extraction: 0.95, portion: 0.35, match: 1 })).toBe(0.35);
  });

  it("sends a confident extraction with a low-confidence portion to a draft", () => {
    const result = evaluateGate([
      {
        source: "text",
        extractionConfidence: 0.99,
        matchScore: 1,
        portion: { status: "resolved", grams: 400, confidence: 0.35, method: "food_portion" },
        flags: [],
      },
    ]);
    expect(result.decision).toBe("draft");
    expect(result.items[0]).toMatchObject({ confidence: 0.35, reasons: ["low_confidence"] });
  });

  it("keeps household-vessel portions at household confidence even with a perfect match", () => {
    const portion = resolvePortion({ quantity: 1, unit: "katori" }, { foodName: "dal" });
    expect(portion).toMatchObject({ confidence: PORTION_CONFIDENCE.householdVessel });
  });
});

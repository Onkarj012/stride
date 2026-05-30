import { describe, test, expect } from "vitest";
import {
  getBMR,
  calcMETCalories,
  calculateTDEE,
  applyGoalAdjustment,
  calculateMacros,
  calculateNutritionPlan,
  adjustCaloriesForDay,
  type PlanInput,
} from "./tdee_engine";

const EXAMPLE: PlanInput = {
  weightKg: 80,
  heightCm: 178,
  age: 28,
  sex: "male",
  occupationType: "desk",
  workHoursPerDay: 8,
  lifestyleActivity: "moderate",
  weeklyWorkouts: [
    { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
    { type: "run_slow", durationMin: 30, sessionsPerWeek: 2 },
  ],
  goal: "moderate_loss",
};

describe("getBMR", () => {
  test("Mifflin-St Jeor (no body fat)", () => {
    expect(getBMR(80, 178, 28, "male")).toBe(1778);
  });
  test("Katch-McArdle path when bodyFat known", () => {
    // LBM = 80*(1-0.15)=68 → 370 + 21.6*68 = 1838.8 → 1839
    expect(getBMR(80, 178, 28, "male", 15)).toBe(1839);
  });
  test("female differs from male", () => {
    expect(getBMR(60, 165, 30, "female")).toBeLessThan(getBMR(60, 165, 30, "male"));
  });
});

describe("calcMETCalories", () => {
  test("EAT uses full MET", () => {
    expect(calcMETCalories(8, 80, 0.5)).toBeCloseTo(320);
  });
  test("NEAT subtracts 1-MET resting baseline", () => {
    expect(calcMETCalories(1.5, 80, 8, true)).toBeCloseTo(320);
  });
});

describe("calculateTDEE", () => {
  test("example profile breakdown is sane", () => {
    const t = calculateTDEE(EXAMPLE);
    expect(t.bmr).toBe(1778);
    expect(t.neatJob).toBe(128); // desk 1.2 MET, net 0.2 × 80kg × 8h
    expect(t.neatLifestyle).toBe(117); // moderate 0.2 MET × 80kg × ~7.29 leisure h
    expect(t.eat).toBe(320);
    expect(t.finalTDEE).toBeGreaterThan(2400);
    expect(t.finalTDEE).toBeLessThan(2700);
    expect(t.plannedDailyEAT).toBe(320);
  });
});

describe("applyGoalAdjustment", () => {
  test("deficit capped at 25%", () => {
    // An out-of-range goal would never exceed cap; verify cap directly.
    expect(applyGoalAdjustment(3000, "aggressive_loss", "male")).toBe(2250);
  });
  test("never below sex floor", () => {
    expect(applyGoalAdjustment(1800, "aggressive_loss", "female")).toBe(1350);
    expect(applyGoalAdjustment(1700, "aggressive_loss", "male")).toBe(1500);
  });
  test("maintain leaves value unchanged", () => {
    expect(applyGoalAdjustment(2500, "maintain", "male")).toBe(2500);
  });
});

describe("calculateMacros", () => {
  test("protein-first, carbs fill remainder, never negative", () => {
    const m = calculateMacros(2400, 80, "moderate_loss");
    expect(m.protein).toBeGreaterThan(150);
    expect(m.carbs).toBeGreaterThanOrEqual(0);
    expect(m.fat).toBeGreaterThan(0);
  });
  test("tiny target never yields negative carbs", () => {
    const m = calculateMacros(800, 80, "aggressive_loss");
    expect(m.carbs).toBe(0);
  });
});

describe("calculateNutritionPlan", () => {
  test("returns target, macros, breakdown, percentages", () => {
    const p = calculateNutritionPlan(EXAMPLE);
    expect(p.calories).toBeGreaterThan(2000);
    expect(p.calories).toBeLessThan(2600);
    expect(p.breakdown.goal).toBe("moderate_loss");
    expect(p.percentages.protein + p.percentages.carbs + p.percentages.fat).toBeGreaterThan(95);
  });
});

describe("adjustCaloriesForDay", () => {
  test("extra burn raises calories + carbs, protein/fat fixed", () => {
    const plan = calculateNutritionPlan(EXAMPLE);
    const adj = adjustCaloriesForDay(plan, plan.plannedDailyEAT + 400);
    expect(adj.calorieGoal).toBe(plan.calories + 400);
    expect(adj.carbGoal).toBe(plan.carbs + 100);
    expect(adj.proteinGoal).toBe(plan.protein);
    expect(adj.fatGoal).toBe(plan.fat);
    expect(adj.note).toMatch(/\+400 kcal/);
  });
  test("rest day reduces vs planned average", () => {
    const plan = calculateNutritionPlan(EXAMPLE);
    const adj = adjustCaloriesForDay(plan, 0);
    expect(adj.calorieGoal).toBeLessThan(plan.calories);
    expect(adj.carbGoal).toBeLessThan(plan.carbs);
  });
});

import { describe, test, expect } from "vitest";
import {
  getBMR,
  calcMETCalories,
  calculateTDEE,
  applyGoalAdjustment,
  calculateMacros,
  calculateNutritionPlan,
  adjustCaloriesForDay,
  WORKOUT_MET,
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
    expect(t.plannedDailyEAT).toBe(263);
    expect(t.plannedEatPerTrainingDay).toBe(307);
  });

  test("sums sessions across workout types scheduled on different days", () => {
    const t = calculateTDEE({
      ...EXAMPLE,
      weeklyWorkouts: [
        { type: "strength", durationMin: 60, sessionsPerWeek: 3 },
        { type: "run_slow", durationMin: 45, sessionsPerWeek: 2 },
      ],
    });
    // weeklyEat = 5*80*1*3 + 8*80*0.75*2 = 2160; 5 training days
    expect(t.plannedDailyEAT).toBe(257);
    expect(t.plannedEatPerTrainingDay).toBe(360);
  });

  test("uses the capped session sum when workout rows may overlap", () => {
    const t = calculateTDEE({
      ...EXAMPLE,
      weeklyWorkouts: [
        { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
        { type: "run_slow", durationMin: 45, sessionsPerWeek: 4 },
      ],
    });
    // The model has no weekday schedule, so 8 active sessions use the 7-day cap.
    expect(t.plannedDailyEAT).toBe(423);
    expect(t.plannedEatPerTrainingDay).toBe(423);
  });

  test("excludes zero-duration placeholder rows from training-day count", () => {
    const t = calculateTDEE({
      ...EXAMPLE,
      weeklyWorkouts: [
        { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
        { type: "yoga", durationMin: 0, sessionsPerWeek: 7 },
      ],
    });
    // weeklyEat = 5*80*1*4 = 1600; only 4 active training days
    expect(t.plannedDailyEAT).toBe(183);
    expect(t.plannedEatPerTrainingDay).toBe(320);
  });

  test("planned baselines use net MET so they match logged-burn convention", () => {
    const t = calculateTDEE(EXAMPLE);
    expect(t.eat).toBe(320);
    expect(t.plannedEatPerTrainingDay).toBeLessThan(t.eat * 7 / 6);
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
    expect(p.plannedDailyEAT).toBe(263);
    expect(p.plannedEatPerTrainingDay).toBe(307);
    expect(p.breakdown.plannedEatPerTrainingDay).toBe(307);
    expect(p.percentages.protein + p.percentages.carbs + p.percentages.fat).toBeGreaterThan(95);
  });
});

describe("adjustCaloriesForDay", () => {
  test("training day matching per-training-day average stays flat", () => {
    const plan = calculateNutritionPlan(EXAMPLE);
    const adj = adjustCaloriesForDay(plan, plan.plannedEatPerTrainingDay);
    expect(adj.calorieGoal).toBe(plan.calories);
    expect(adj.carbGoal).toBe(plan.carbs);
    expect(adj.proteinGoal).toBe(plan.protein);
    expect(adj.fatGoal).toBe(plan.fat);
    expect(adj.note).toBe("On plan for today");
  });

  test("unusually high training burn raises calories + carbs, protein/fat fixed", () => {
    const plan = calculateNutritionPlan(EXAMPLE);
    const adj = adjustCaloriesForDay(plan, plan.plannedEatPerTrainingDay + 400);
    expect(adj.calorieGoal).toBe(plan.calories + 400);
    expect(adj.carbGoal).toBe(plan.carbs + 100);
    expect(adj.proteinGoal).toBe(plan.protein);
    expect(adj.fatGoal).toBe(plan.fat);
    expect(adj.note).toMatch(/\+400 kcal/);
  });

  test("rest day stays flat instead of subtracting planned average", () => {
    const plan = calculateNutritionPlan(EXAMPLE);
    const adj = adjustCaloriesForDay(plan, 0);
    expect(adj.calorieGoal).toBe(plan.calories);
    expect(adj.carbGoal).toBe(plan.carbs);
    expect(adj.note).toBe("On plan for today");
  });

  test("doing exactly the planned workout produces zero delta", () => {
    const plan = calculateNutritionPlan({
      ...EXAMPLE,
      weeklyWorkouts: [{ type: "strength", durationMin: 60, sessionsPerWeek: 4 }],
    });
    const actualBurn = (WORKOUT_MET.strength - 1) * EXAMPLE.weightKg;
    expect(plan.plannedEatPerTrainingDay).toBe(actualBurn);

    const adj = adjustCaloriesForDay(plan, actualBurn);
    expect(adj.calorieGoal).toBe(plan.calories);
    expect(adj.carbGoal).toBe(plan.carbs);
    expect(adj.proteinGoal).toBe(plan.protein);
    expect(adj.fatGoal).toBe(plan.fat);
    expect(adj.note).toBe("On plan for today");
  });

  test("legacy persisted plan missing per-training-day EAT falls back to planned daily EAT", () => {
    const plan = calculateNutritionPlan(EXAMPLE);
    const legacyPlan = { ...plan } as Omit<typeof plan, "plannedEatPerTrainingDay"> & {
      plannedEatPerTrainingDay?: number;
    };
    delete legacyPlan.plannedEatPerTrainingDay;

    const adj = adjustCaloriesForDay(legacyPlan as typeof plan, plan.plannedDailyEAT + 400);
    expect(adj.calorieGoal).toBe(plan.calories + 400);
    expect(adj.carbGoal).toBe(plan.carbs + 100);
    expect(adj.note).toMatch(/\+400 kcal/);
  });
});

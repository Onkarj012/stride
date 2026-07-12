import { describe, expect, test } from "vitest";
import { calculateNutritionPlan, type NutritionPlan } from "./tdee_engine";
import { resolvePlanForDayAdjustment } from "./plan_resolve";

const PLAN_INPUT = {
  weightKg: 80,
  heightCm: 178,
  age: 28,
  sex: "male" as const,
  occupationType: "desk",
  workHoursPerDay: 8,
  lifestyleActivity: "moderate",
  weeklyWorkouts: [
    { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
    { type: "run_slow", durationMin: 30, sessionsPerWeek: 2 },
  ],
  goal: "moderate_loss",
};

const PROFILE = {
  weight: PLAN_INPUT.weightKg,
  height: PLAN_INPUT.heightCm,
  age: PLAN_INPUT.age,
  sex: PLAN_INPUT.sex,
  occupationType: PLAN_INPUT.occupationType,
  workHoursPerDay: PLAN_INPUT.workHoursPerDay,
  lifestyleActivity: PLAN_INPUT.lifestyleActivity,
  weeklyWorkouts: JSON.stringify(PLAN_INPUT.weeklyWorkouts),
  goal: PLAN_INPUT.goal,
};

describe("resolvePlanForDayAdjustment", () => {
  test("recomputes stale gross-MET baselines stored before the net-MET change", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    // Plans persisted before the net-MET change stored gross baselines
    // (e.g. 320/373 for this profile instead of the net 263/307).
    const stalePlan: NutritionPlan = { ...plan, plannedDailyEAT: 320, plannedEatPerTrainingDay: 373 };

    const result = resolvePlanForDayAdjustment(stalePlan, PROFILE);

    expect(result.plannedDailyEAT).toBe(plan.plannedDailyEAT);
    expect(result.plannedEatPerTrainingDay).toBe(plan.plannedEatPerTrainingDay);
    // Base plan untouched.
    expect(result.calories).toBe(stalePlan.calories);
    expect(result.protein).toBe(stalePlan.protein);
    expect(result.carbs).toBe(stalePlan.carbs);
    expect(result.fat).toBe(stalePlan.fat);
  });

  test("keeps stored baselines when profile inputs for recomputation are missing", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const { weeklyWorkouts: _weeklyWorkouts, ...profileWithoutWeeklyWorkouts } = PROFILE;

    expect(resolvePlanForDayAdjustment(plan, profileWithoutWeeklyWorkouts)).toBe(plan);
  });

  test("recomputes plannedEatPerTrainingDay from profile when missing", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const legacyPlan = { ...plan } as Omit<NutritionPlan, "plannedEatPerTrainingDay"> & {
      plannedEatPerTrainingDay?: number;
    };
    delete legacyPlan.plannedEatPerTrainingDay;

    const result = resolvePlanForDayAdjustment(legacyPlan as NutritionPlan, PROFILE);

    expect(result.plannedEatPerTrainingDay).toBe(
      calculateNutritionPlan(PLAN_INPUT).plannedEatPerTrainingDay,
    );
    expect(result.plannedEatPerTrainingDay).not.toBe(legacyPlan.plannedDailyEAT);
    expect(result.calories).toBe(legacyPlan.calories);
    expect(result.protein).toBe(legacyPlan.protein);
    expect(result.carbs).toBe(legacyPlan.carbs);
    expect(result.fat).toBe(legacyPlan.fat);
    expect(result.plannedDailyEAT).toBe(legacyPlan.plannedDailyEAT);
  });

  test("falls back to original plan when weeklyWorkouts JSON is invalid", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const legacyPlan = { ...plan } as Omit<NutritionPlan, "plannedEatPerTrainingDay"> & {
      plannedEatPerTrainingDay?: number;
    };
    delete legacyPlan.plannedEatPerTrainingDay;

    expect(
      resolvePlanForDayAdjustment(legacyPlan as NutritionPlan, {
        ...PROFILE,
        weeklyWorkouts: "not json",
      }),
    ).toBe(legacyPlan);
  });

  test("falls back to original plan when weeklyWorkouts is missing", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const legacyPlan = { ...plan } as Omit<NutritionPlan, "plannedEatPerTrainingDay"> & {
      plannedEatPerTrainingDay?: number;
    };
    delete legacyPlan.plannedEatPerTrainingDay;
    const { weeklyWorkouts: _weeklyWorkouts, ...profileWithoutWeeklyWorkouts } = PROFILE;

    expect(
      resolvePlanForDayAdjustment(legacyPlan as NutritionPlan, profileWithoutWeeklyWorkouts),
    ).toBe(legacyPlan);
  });

  test("recomputes when weeklyWorkouts is an empty array", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const legacyPlan = { ...plan } as Omit<NutritionPlan, "plannedEatPerTrainingDay"> & {
      plannedEatPerTrainingDay?: number;
    };
    delete legacyPlan.plannedEatPerTrainingDay;

    const result = resolvePlanForDayAdjustment(legacyPlan as NutritionPlan, {
      ...PROFILE,
      weeklyWorkouts: JSON.stringify([]),
    });

    expect(result.plannedEatPerTrainingDay).toBe(0);
    expect(result.calories).toBe(legacyPlan.calories);
    expect(result.protein).toBe(legacyPlan.protein);
    expect(result.carbs).toBe(legacyPlan.carbs);
    expect(result.fat).toBe(legacyPlan.fat);
    // Baselines recomputed against the (empty) schedule, not the stored value.
    expect(result.plannedDailyEAT).toBe(0);
  });

  test("falls back to original plan when required fields are missing", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const legacyPlan = { ...plan } as Omit<NutritionPlan, "plannedEatPerTrainingDay"> & {
      plannedEatPerTrainingDay?: number;
    };
    delete legacyPlan.plannedEatPerTrainingDay;

    expect(
      resolvePlanForDayAdjustment(legacyPlan as NutritionPlan, { ...PROFILE, weight: undefined }),
    ).toBe(legacyPlan);
  });
});

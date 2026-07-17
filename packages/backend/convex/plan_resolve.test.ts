import { describe, expect, test } from "vitest";
import { calculateNutritionPlan, type NutritionPlan } from "./tdee_engine";
import { FALLBACK_TARGETS, parseStoredPlan, resolvePlanForDayAdjustment } from "./plan_resolve";

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
  test("recomputes stale planned-EAT baselines while preserving plan targets", () => {
    const plan = calculateNutritionPlan(PLAN_INPUT);
    const stalePlan: NutritionPlan = { ...plan, plannedDailyEAT: 320, plannedEatPerTrainingDay: 373 };

    const result = resolvePlanForDayAdjustment(stalePlan, PROFILE);

    expect(result.plannedDailyEAT).toBe(plan.plannedDailyEAT);
    expect(result.plannedEatPerTrainingDay).toBe(plan.plannedEatPerTrainingDay);
    expect(result.calories).toBe(stalePlan.calories);
    expect(result.protein).toBe(stalePlan.protein);
    expect(result.carbs).toBe(stalePlan.carbs);
    expect(result.fat).toBe(stalePlan.fat);
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
    expect(result.plannedDailyEAT).toBe(calculateNutritionPlan(PLAN_INPUT).plannedDailyEAT);
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

describe("parseStoredPlan", () => {
  const validPlan = calculateNutritionPlan(PLAN_INPUT);

  test("rejects malformed or non-finite target fields", () => {
    expect(parseStoredPlan(undefined)).toBeNull();
    expect(parseStoredPlan("not json")).toBeNull();
    for (const field of ["calories", "protein", "carbs", "fat", "plannedDailyEAT"]) {
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: undefined }))).toBeNull();
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: -1 }))).toBeNull();
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: "not a number" }))).toBeNull();
    }
  });

  test("accepts valid plans and omits an invalid optional training-day baseline", () => {
    const parsed = parseStoredPlan(JSON.stringify({ ...validPlan, plannedEatPerTrainingDay: -50 }));
    expect(parsed).not.toBeNull();
    expect(parsed!.calories).toBe(validPlan.calories);
    expect(parsed!.plannedDailyEAT).toBe(validPlan.plannedDailyEAT);
    expect("plannedEatPerTrainingDay" in parsed!).toBe(false);
    expect(FALLBACK_TARGETS).toEqual({ calories: 2000, protein: 90, carbs: 250, fat: 65 });
  });
});

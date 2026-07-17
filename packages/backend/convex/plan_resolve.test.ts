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

describe("parseStoredPlan", () => {
  const validPlan = calculateNutritionPlan(PLAN_INPUT);

  test("returns null for missing, empty, or invalid JSON", () => {
    expect(parseStoredPlan(undefined)).toBeNull();
    expect(parseStoredPlan(null)).toBeNull();
    expect(parseStoredPlan("")).toBeNull();
    expect(parseStoredPlan("not json")).toBeNull();
    expect(parseStoredPlan("123")).toBeNull();
    expect(parseStoredPlan("[]")).toBeNull();
  });

  test("returns null when required macro fields are missing or non-finite", () => {
    for (const field of ["calories", "protein", "carbs", "fat", "plannedDailyEAT"]) {
      const partial = { ...validPlan, [field]: undefined };
      expect(parseStoredPlan(JSON.stringify(partial))).toBeNull();
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: NaN }))).toBeNull();
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: Infinity }))).toBeNull();
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: -10 }))).toBeNull();
      expect(parseStoredPlan(JSON.stringify({ ...validPlan, [field]: "not a number" }))).toBeNull();
    }
  });

  test("returns null for negative macro values", () => {
    expect(parseStoredPlan(JSON.stringify({ ...validPlan, calories: -1 }))).toBeNull();
    expect(parseStoredPlan(JSON.stringify({ ...validPlan, protein: -1 }))).toBeNull();
    expect(parseStoredPlan(JSON.stringify({ ...validPlan, carbs: -1 }))).toBeNull();
    expect(parseStoredPlan(JSON.stringify({ ...validPlan, fat: -1 }))).toBeNull();
  });

  test("accepts a valid plan and preserves all fields", () => {
    const parsed = parseStoredPlan(JSON.stringify(validPlan));
    expect(parsed).not.toBeNull();
    expect(parsed!.calories).toBe(validPlan.calories);
    expect(parsed!.protein).toBe(validPlan.protein);
    expect(parsed!.carbs).toBe(validPlan.carbs);
    expect(parsed!.fat).toBe(validPlan.fat);
    expect(parsed!.plannedDailyEAT).toBe(validPlan.plannedDailyEAT);
    expect(parsed!.plannedEatPerTrainingDay).toBe(validPlan.plannedEatPerTrainingDay);
  });

  test("treats missing plannedEatPerTrainingDay as optional (legacy)", () => {
    const legacy = { ...validPlan } as any;
    delete legacy.plannedEatPerTrainingDay;
    const parsed = parseStoredPlan(JSON.stringify(legacy));
    expect(parsed).not.toBeNull();
    expect("plannedEatPerTrainingDay" in parsed!).toBe(false);
    expect(parsed!.calories).toBe(validPlan.calories);
  });

  test("omits invalid plannedEatPerTrainingDay so it can be recomputed", () => {
    const parsed = parseStoredPlan(
      JSON.stringify({ ...validPlan, plannedEatPerTrainingDay: -50 }),
    );
    expect(parsed).not.toBeNull();
    expect("plannedEatPerTrainingDay" in parsed!).toBe(false);
  });

  test("exposes shared fallback constants for non-plan surfaces", () => {
    expect(FALLBACK_TARGETS.calories).toBe(2000);
    expect(FALLBACK_TARGETS.protein).toBe(90);
    expect(FALLBACK_TARGETS.carbs).toBe(250);
    expect(FALLBACK_TARGETS.fat).toBe(65);
  });
});

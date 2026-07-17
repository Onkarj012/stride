import { describe, expect, test } from "vitest";
import { assertValidDateStr, timeWindowKey, validateMealWrite, validateWorkoutWrite, workoutTimeWindowKey } from "./validation";

const validMeal = {
  name: "Chicken rice",
  calories: 550,
  protein: 35,
  carbs: 60,
  fat: 14,
  time: "12:00",
};

const validWorkout = {
  name: "Run",
  sets: "1",
  duration: "30 min",
  intensity: "MEDIUM",
};

describe("validateMealWrite", () => {
  test("rejects NaN and negative nutrition values", () => {
    expect(() => validateMealWrite({ ...validMeal, calories: Number.NaN })).toThrow(/finite number/);
    expect(() => validateMealWrite({ ...validMeal, protein: -1 })).toThrow(/non-negative/);
  });

  test("rejects meals over 5000 kcal", () => {
    expect(() => validateMealWrite({ ...validMeal, calories: 5001 })).toThrow(/unrealistically high/);
  });

  test("rejects parse-error nutrition and invalid times before persistence or bucketing", () => {
    expect(() => validateMealWrite({ ...validMeal, nutritionSource: "parse_error" })).toThrow(/could not be parsed/i);
    expect(() => validateMealWrite({ ...validMeal, time: "" })).toThrow(/valid HH:MM/i);
    expect(() => validateMealWrite({ ...validMeal, time: "25:99" })).toThrow(/valid HH:MM/i);
    expect(timeWindowKey(validMeal.time)).toBe("12:00");
  });

  test("clamps borderline values and flags 4/4/9 calorie mismatch", () => {
    const result = validateMealWrite({
      ...validMeal,
      calories: 4000,
      protein: 700,
      carbs: 20,
      fat: 10,
      confidence: 0.9,
    });

    expect(result.calories).toBe(3500);
    expect(result.protein).toBe(600);
    expect(result.validationFlags).toEqual(expect.arrayContaining([
      "calories_clamped",
      "protein_clamped",
      "macro_calorie_mismatch",
    ]));
    expect(result.confidence).toBe(0.35);
  });

  test("clamps fractional values above the borderline and rejects above the reject max", () => {
    const clamped = validateMealWrite({
      ...validMeal,
      calories: 3500.4,
      protein: 600.1,
      carbs: 900.5,
      fat: 450.2,
    });
    expect(clamped.calories).toBe(3500);
    expect(clamped.protein).toBe(600);
    expect(clamped.carbs).toBe(900);
    expect(clamped.fat).toBe(450);
    expect(clamped.validationFlags).toEqual(expect.arrayContaining([
      "calories_clamped",
      "protein_clamped",
      "carbs_clamped",
      "fat_clamped",
    ]));

    expect(() => validateMealWrite({ ...validMeal, calories: 5000.1 })).toThrow(/unrealistically high/);
  });
});

describe("validateWorkoutWrite", () => {
  test("rejects NaN and negative calorie burn values", () => {
    expect(() => validateWorkoutWrite({ ...validWorkout, caloriesBurned: Number.NaN })).toThrow(/finite number/);
    expect(() => validateWorkoutWrite({ ...validWorkout, caloriesBurned: -1 })).toThrow(/non-negative/);
  });

  test("rejects workouts over 3000 kcal", () => {
    expect(() => validateWorkoutWrite({ ...validWorkout, caloriesBurned: 3001 })).toThrow(/unrealistically high/);
  });

  test("rejects parse-error workouts", () => {
    expect(() => validateWorkoutWrite({ ...validWorkout, parseError: "unparseable" })).toThrow(/could not be parsed/i);
  });
});

describe("assertValidDateStr", () => {
  test("accepts YYYY-MM-DD and trims whitespace", () => {
    expect(assertValidDateStr("2026-07-12")).toBe("2026-07-12");
    expect(assertValidDateStr(" 2026-07-12 ")).toBe("2026-07-12");
  });

  test("rejects non-YYYY-MM-DD formats", () => {
    expect(() => assertValidDateStr("07/12/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => assertValidDateStr("2026-7-12")).toThrow(/YYYY-MM-DD/);
    expect(() => assertValidDateStr("not-a-date")).toThrow(/YYYY-MM-DD/);
  });

  test("rejects impossible calendar dates and empty string", () => {
    expect(() => assertValidDateStr("2026-02-31")).toThrow(/valid calendar date/);
    expect(() => assertValidDateStr("2026-13-10")).toThrow(/valid calendar date/);
    expect(() => assertValidDateStr("")).toThrow(/YYYY-MM-DD/);
  });

  test("accepts leap years and rejects non-leap February 29", () => {
    expect(assertValidDateStr("2024-02-29")).toBe("2024-02-29");
    expect(() => assertValidDateStr("2023-02-29")).toThrow(/valid calendar date/);
  });
});

describe("workoutTimeWindowKey", () => {
  test("uses a stable token for retries while distinguishing intentional relogs", () => {
    const base = { date: "2026-07-10", contentHash: "same-workout" };

    expect(workoutTimeWindowKey({ ...base, idempotencyToken: "request-1" }))
      .toBe(workoutTimeWindowKey({ ...base, idempotencyToken: "request-1" }));
    expect(workoutTimeWindowKey({ ...base, idempotencyToken: "request-1" }))
      .not.toBe(workoutTimeWindowKey({ ...base, idempotencyToken: "request-2" }));
  });
});

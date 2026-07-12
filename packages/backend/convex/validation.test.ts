import { describe, expect, test } from "vitest";
import { isSimilarWorkout, timeWindowKey, validateMealWrite, validateWorkoutWrite, workoutTimeWindowKey } from "./validation";
import { assertNoNearDuplicateWorkout } from "./workouts";

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

describe("workoutTimeWindowKey", () => {
  test("uses a stable token for retries while distinguishing intentional relogs", () => {
    const base = { date: "2026-07-10", contentHash: "same-workout" };

    expect(workoutTimeWindowKey({ ...base, idempotencyToken: "request-1" }))
      .toBe(workoutTimeWindowKey({ ...base, idempotencyToken: "request-1" }));
    expect(workoutTimeWindowKey({ ...base, idempotencyToken: "request-1" }))
      .not.toBe(workoutTimeWindowKey({ ...base, idempotencyToken: "request-2" }));
  });
});

describe("isSimilarWorkout", () => {
  test("matches normalized workout names with reasonably close calorie estimates", () => {
    expect(isSimilarWorkout(
      { name: "Leg day workout", caloriesBurned: 420 },
      { name: "Leg day", caloriesBurned: 360 },
    )).toBe(true);
  });

  test("rejects different workout descriptions or materially different calorie burns", () => {
    expect(isSimilarWorkout(
      { name: "Chest and triceps", caloriesBurned: 300 },
      { name: "Long distance run", caloriesBurned: 310 },
    )).toBe(false);
    expect(isSimilarWorkout(
      { name: "Morning run", caloriesBurned: 300 },
      { name: "Morning run", caloriesBurned: 500 },
    )).toBe(false);
  });
});

describe("assertNoNearDuplicateWorkout", () => {
  test("throws a structured near-duplicate error inside the ten-minute window", async () => {
    const existing = {
      _id: "workout-1",
      name: "Leg day",
      caloriesBurned: 400,
      timestamp: "18:00",
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: (_name: string, applyIndex: (q: any) => unknown) => {
            const q = { eq: () => q };
            applyIndex(q);
            return { collect: async () => [existing] };
          },
        }),
      },
    };

    await expect(assertNoNearDuplicateWorkout(
      ctx,
      "user-1",
      "2026-07-11",
      { name: "Leg day workout", caloriesBurned: 450 },
      "18:08",
    )).rejects.toMatchObject({
      data: {
        code: "NEAR_DUPLICATE",
        workoutId: "workout-1",
      },
    });
  });

  test("allows a similar workout outside the ten-minute window", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: (_name: string, applyIndex: (q: any) => unknown) => {
            const q = { eq: () => q };
            applyIndex(q);
            return {
              collect: async () => [{
                _id: "workout-1",
                name: "Leg day",
                caloriesBurned: 400,
                timestamp: "18:00",
              }],
            };
          },
        }),
      },
    };

    await expect(assertNoNearDuplicateWorkout(
      ctx,
      "user-1",
      "2026-07-11",
      { name: "Leg day workout", caloriesBurned: 450 },
      "18:11",
    )).resolves.toBeUndefined();
  });

  test("ignores legacy workouts without a timestamp", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: (_name: string, applyIndex: (q: any) => unknown) => {
            const q = { eq: () => q };
            applyIndex(q);
            return {
              collect: async () => [{
                _id: "workout-1",
                name: "Leg day",
                caloriesBurned: 400,
              }],
            };
          },
        }),
      },
    };

    await expect(assertNoNearDuplicateWorkout(
      ctx,
      "user-1",
      "2026-07-11",
      { name: "Leg day workout", caloriesBurned: 450 },
      "18:08",
    )).resolves.toBeUndefined();
  });
});

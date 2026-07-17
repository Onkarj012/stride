import { describe, expect, test, vi, beforeEach } from "vitest";
import { callAI } from "./llm";
import { parseWorkoutDescription, runNutritionEngine } from "./parse";

vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...actual,
    callAI: vi.fn(),
  };
});

const mockedCallAI = vi.mocked(callAI);

describe("parseWorkoutDescription", () => {
  beforeEach(() => {
    mockedCallAI.mockReset();
  });

  test("calculates a nonzero burn for detailed workouts without profile weight", async () => {
    mockedCallAI.mockResolvedValue(JSON.stringify({
      name: "Push Day",
      duration: "60 min",
      intensity: "HIGH",
      caloriesBurned: 0,
      rationale: "Strong chest and triceps volume.",
      exercises: [
        {
          name: "declined press",
          muscle_group: "chest",
          weight_unit: "kg",
          sets: [
            { weight: "12.5", reps: "15" },
            { weight: "15", reps: "15" },
            { weight: "15", reps: "15" },
          ],
        },
        {
          name: "inclined press",
          muscle_group: "chest",
          weight_unit: "kg",
          sets: [
            { weight: "12.5", reps: "15" },
            { weight: "12.5", reps: "15" },
            { weight: "15", reps: "15" },
          ],
        },
        {
          name: "pec fly",
          muscle_group: "chest",
          weight_unit: "lbs",
          sets: [
            { weight: "90", reps: "15" },
            { weight: "90", reps: "15" },
            { weight: "100", reps: "15" },
          ],
        },
        {
          name: "tricep rod pushdown",
          muscle_group: "triceps",
          weight_unit: "kg",
          sets: [
            { weight: "15", reps: "15" },
            { weight: "15", reps: "15" },
            { weight: "17.5", reps: "15" },
          ],
        },
        {
          name: "tricep rope pushdown",
          muscle_group: "triceps",
          weight_unit: "kg",
          sets: [
            { weight: "12.5", reps: "15" },
            { weight: "12.5", reps: "15" },
            { weight: "15", reps: "12" },
          ],
        },
        {
          name: "walking",
          muscle_group: "cardio",
          weight_unit: "bodyweight",
          sets: [
            { duration_min: "5", incline: "11", reps: "" },
            { duration_min: "5", incline: "0", reps: "" },
          ],
        },
      ],
    }));

    const result = await parseWorkoutDescription(`declined press: 12.5, 15, 15kg dumbbells each hand: 15 reps each
inclined press: 12.5, 12.5, 15 kg dumbbells per hand: 15 reps each
pec fly: 90, 90, 100 lbs: 15 reps
tricep rod pushdown: 15, 15, 17.5kg: 15 reps
tricep rope pushdown: 12.5, 12.5, 15kg: 15, 15, 12 reps
walking: 5 min, 11 incline, then 5min of normal walking`);

    expect(result.exercises).toHaveLength(6);
    expect(result.sets).toBe("6 exercises · 17 sets");
    expect(result.caloriesBurned).toBeGreaterThan(0);
    expect(result.calorieResult?.total_kcal).toBe(result.caloriesBurned);
    expect(result.calorieResult?.confidence).toBeLessThan(0.9);
  });

  test("preserves an explicitly stated calorie burn over the engine estimate", async () => {
    mockedCallAI.mockResolvedValue(JSON.stringify({
      name: "Lift",
      duration: "60 min",
      intensity: "HIGH",
      caloriesBurned: 75,
      rationale: "",
      exercises: [
        {
          name: "bench press",
          muscle_group: "chest",
          weight_unit: "kg",
          sets: [
            { weight: "60", reps: "10" },
            { weight: "60", reps: "10" },
            { weight: "60", reps: "10" },
          ],
        },
      ],
    }));

    const result = await parseWorkoutDescription(
      "bench press 3 sets of 10, 75 kcal burned",
      undefined,
      undefined,
      undefined,
      undefined,
      { weight: 80, age: 30, sex: "male", fitnessLevel: "intermediate" },
    );

    expect(result.caloriesBurned).toBe(75);
    expect(result.calorieResult?.total_kcal).toBeGreaterThan(75);
  });
});

describe("runNutritionEngine", () => {
  test("keeps unresolved unit conversions out of zero-gram breakdown items", async () => {
    const result = await runNutritionEngine(
      {
        runQuery: vi.fn().mockResolvedValue([
          {
            name: "olive oil",
            caloriesPer100g: 884,
            proteinPer100g: 0,
            carbsPer100g: 0,
            fatPer100g: 100,
            source: "usda",
          },
        ]),
        runAction: vi.fn(),
        runMutation: vi.fn(),
      },
      {
        calories: 120,
        protein: 0,
        carbs: 0,
        fat: 13,
        ingredients: [
          { food_text: "olive oil", amount: 2, unit: "tbps", is_oil_or_fat: true },
        ],
        cooking_method: "unknown",
        portion_scale: 1,
      },
    );

    expect(result.nutritionSource).toBe("ai_estimated");
    expect(result.calories).toBe(120);
    expect(result.ingredientBreakdown?.unresolved).toEqual(["olive oil"]);
    expect(result.ingredientBreakdown?.items).toEqual([]);
    expect(result.ingredientBreakdown?.items.some((item) => item.grams === 0)).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { requireMealNutrition } from "./useLogs";

describe("requireMealNutrition", () => {
  test("requires positive calories and non-negative macros", () => {
    const valid = { kcal: 300, protein: 20, carbs: 30, fat: 8 };
    expect(requireMealNutrition(valid)).toBe(valid);
    expect(() => requireMealNutrition({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toThrow();
    expect(() => requireMealNutrition({ ...valid, protein: -1 })).toThrow();
  });
});

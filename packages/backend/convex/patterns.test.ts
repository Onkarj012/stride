import { describe, test, expect } from "vitest";
import { derivePatterns } from "./patterns";

const empty = { meals: [], workouts: [], sleep: [], water: [], proteinTarget: 150, waterTarget: 2000 };

describe("derivePatterns", () => {
  test("sparse data → no patterns", () => {
    expect(derivePatterns(empty)).toEqual([]);
    expect(derivePatterns({ ...empty, meals: [{ date: "2026-05-01", protein: 100 }] })).toEqual([]);
  });

  test("detects a low-protein weekday", () => {
    // 2 weeks; Wednesdays much lower than other days.
    const meals: { date: string; protein: number }[] = [];
    // May 2026: Wed = 6,13,20,27. Build 14 consecutive days from May 4 (Mon).
    for (let d = 4; d <= 17; d++) {
      const date = `2026-05-${String(d).padStart(2, "0")}`;
      const isWed = new Date(date + "T00:00:00").getDay() === 3;
      meals.push({ date, protein: isWed ? 60 : 160 });
    }
    const patterns = derivePatterns({ ...empty, meals });
    expect(patterns.some((p) => p.includes("Wednesday"))).toBe(true);
  });

  test("detects poor hydration adherence", () => {
    const water = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      ml: 800,
    }));
    const patterns = derivePatterns({ ...empty, water });
    expect(patterns.some((p) => p.includes("hydration"))).toBe(true);
  });
});

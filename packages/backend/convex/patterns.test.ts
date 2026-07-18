import { convexTest } from "convex-test";
import { describe, test, expect } from "vitest";
import { derivePatterns } from "./patterns";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

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

  test("pattern context excludes tombstoned meals, workouts, and water", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let day = 1; day <= 14; day++) {
        const date = `2026-07-${String(day).padStart(2, "0")}`;
        const isWednesday = new Date(`${date}T00:00:00`).getDay() === 3;
        await ctx.db.insert("meals", {
          userId: "patterns-user",
          date,
          name: "Deleted meal",
          calories: 400,
          protein: isWednesday ? 20 : 160,
          carbs: 40,
          fat: 10,
          time: "12:00",
          undoneAt: Date.now(),
        });
      }
      for (const date of ["2026-07-01", "2026-07-02", "2026-07-10"]) {
        await ctx.db.insert("workouts", {
          userId: "patterns-user",
          date,
          name: "Deleted workout",
          sets: "1",
          duration: "30",
          intensity: "MODERATE",
          timestamp: "09:00",
          undoneAt: Date.now(),
        });
      }
      for (let day = 1; day <= 7; day++) {
        await ctx.db.insert("water_logs", {
          userId: "patterns-user",
          date: `2026-07-${String(day).padStart(2, "0")}`,
          ml: 250,
          time: "08:00",
          undoneAt: Date.now(),
        });
      }
    });

    const expected: string[] = [];
    expect(await t.withIdentity({ subject: "patterns-user" }).query(api.patterns.getPatterns, {
      days: 3650,
    })).toEqual(expected);
    expect(await t.query((internal as any).patterns.getPatternsForContext, {
      userId: "patterns-user",
      days: 3650,
    })).toEqual(expected);
  });
});

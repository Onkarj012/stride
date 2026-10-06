import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { brzycki, E1RM_MAX_REPS, epley, weeklyVolumeByMuscle } from "./e1rm.ts";

describe("e1RM", () => {
  it("matches hand-computed values", () => {
    expect(epley(100, 5)).toBeCloseTo(116.6667, 4);
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 9);
    expect(epley(100, 1)).toBe(100);
    expect(brzycki(100, 1)).toBe(100);
  });

  it("refuses sets outside the reliable range", () => {
    expect(epley(100, E1RM_MAX_REPS + 1)).toBeNull();
    expect(brzycki(100, 0)).toBeNull();
    expect(epley(0, 5)).toBeNull();
    expect(brzycki(100, 2.5)).toBeNull();
  });

  it("property: estimates grow with reps and the two formulas agree within 5%", () => {
    const kg = fc.double({ min: 1, max: 400, noNaN: true });
    const reps = fc.integer({ min: 1, max: E1RM_MAX_REPS - 1 });
    fc.assert(
      fc.property(kg, reps, (w, r) => {
        const e = epley(w, r) ?? Number.NaN;
        const b = brzycki(w, r) ?? Number.NaN;
        expect(epley(w, r + 1) ?? 0).toBeGreaterThan(e);
        expect(brzycki(w, r + 1) ?? 0).toBeGreaterThan(b);
        expect(Math.abs(e - b) / b).toBeLessThan(0.05);
        expect(Math.min(e, b)).toBeGreaterThanOrEqual(w);
      }),
    );
  });
});

describe("weeklyVolumeByMuscle", () => {
  it("counts primary sets fully and secondary sets at half", () => {
    const exercises = new Map([
      ["bench", { primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"] }],
      ["pushdown", { primaryMuscles: ["triceps"], secondaryMuscles: [] }],
    ]);
    const sets = [
      ...Array.from({ length: 3 }, () => ({ exerciseId: "bench", reps: 10, weightKg: 60 })),
      { exerciseId: "pushdown", reps: 12, weightKg: 25 },
      { exerciseId: "unknown", reps: 5, weightKg: 100 },
    ];
    const volume = weeklyVolumeByMuscle(sets, exercises);
    expect(volume.get("chest")).toEqual({ sets: 3, tonnageKg: 1800 });
    expect(volume.get("triceps")).toEqual({ sets: 2.5, tonnageKg: 300 });
    expect(volume.get("shoulders")).toEqual({ sets: 1.5, tonnageKg: 0 });
    expect(volume.size).toBe(3);
  });
});

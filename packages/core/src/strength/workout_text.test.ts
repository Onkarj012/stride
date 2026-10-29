import { describe, expect, it } from "vitest";
import { expandSets, normalizeExerciseName } from "./workout_text.ts";

describe("plain-English workout helpers", () => {
  it("pairs equal lists and repeats a single value without inventing missing values", () => {
    expect(expandSets([10, 12], [8, 6])).toEqual({ sets: [{ weightKg: 10, reps: 8 }, { weightKg: 12, reps: 6 }] });
    expect(expandSets([10, 12], [8])).toEqual({ sets: [{ weightKg: 10, reps: 8 }, { weightKg: 12, reps: 8 }] });
    expect(expandSets([10], [8, 6])).toEqual({ sets: [{ weightKg: 10, reps: 8 }, { weightKg: 10, reps: 6 }] });
    const converted = expandSets([22], [8], { weightUnit: "lb", weightBasis: "each" });
    expect(converted.sets?.[0]?.weightKg).toBeCloseTo(9.97903214, 8);
    expect(converted.sets?.[0]).toMatchObject({ reps: 8, weightBasis: "each" });
    expect(expandSets([10, 12], [8, 6, 4]).problem).toBeDefined();
    expect(expandSets([], [8]).problem).toBeDefined();
  });

  it("normalizes only case, punctuation, and whitespace", () => {
    expect(normalizeExerciseName(" Lat pull-down,  Long Grip! ")).toBe("lat pulldown long grip");
  });
});

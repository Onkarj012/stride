import { describe, expect, it } from "vitest";
import { nextTargets, repRange } from "./progression.ts";

describe("nextTargets", () => {
  it("returns nothing without a previous session", () => {
    expect(nextTargets([], 2.5)).toEqual([]);
  });

  it("adds a rep to sets under the top of the range and repeats the rest", () => {
    expect(
      nextTargets(
        [
          { weightKg: 40, reps: 8 },
          { weightKg: 40, reps: 8 },
          { weightKg: 40, reps: 7 },
        ],
        2.5,
      ),
    ).toEqual([
      { weightKg: 40, reps: 8, reason: "repeat" },
      { weightKg: 40, reps: 8, reason: "repeat" },
      { weightKg: 40, reps: 8, reason: "add-rep" },
    ]);
  });

  it("adds weight and drops to the bottom of the range when every top set hits the max", () => {
    expect(
      nextTargets(
        [
          { weightKg: 40, reps: 8 },
          { weightKg: 40, reps: 8 },
          { weightKg: 40, reps: 8 },
        ],
        2.5,
      ),
    ).toEqual([
      { weightKg: 42.5, reps: 6, reason: "add-weight" },
      { weightKg: 42.5, reps: 6, reason: "add-weight" },
      { weightKg: 42.5, reps: 6, reason: "add-weight" },
    ]);
  });

  it("adds a rep to bodyweight sets and keeps the weight at zero", () => {
    expect(nextTargets([{ weightKg: 0, reps: 10 }], 2.5)).toEqual([{ weightKg: 0, reps: 11, reason: "add-rep" }]);
  });

  it("rounds the new weight to 2 decimals", () => {
    expect(nextTargets([{ weightKg: 22.1, reps: 8 }], 2.2)).toEqual([{ weightKg: 24.3, reps: 6, reason: "add-weight" }]);
  });

  it("places the rep range boundaries", () => {
    expect(repRange(5)).toEqual({ min: 3, max: 5 });
    expect(repRange(6)).toEqual({ min: 6, max: 8 });
    expect(repRange(8)).toEqual({ min: 6, max: 8 });
    expect(repRange(9)).toEqual({ min: 8, max: 12 });
    expect(repRange(12)).toEqual({ min: 8, max: 12 });
    expect(repRange(13)).toEqual({ min: 12, max: 20 });
  });
});

import { describe, expect, test } from "vitest";
import { lookupExercise } from "./exercise_db";

describe("lookupExercise category fallback", () => {
  test.each([
    ["leg day", "strength", 5.0],
    ["morning cardio session", "cardio", 7.5],
    ["chest hypertrophy workout", "strength", 4.5],
  ])("marks %s as a rough representative match", (name, category, metValue) => {
    const result = lookupExercise(name);

    expect(result).toMatchObject({
      category,
      met_value: metValue,
      rough: true,
    });
  });

  test("does not mark exact or close exercise matches as rough", () => {
    expect(lookupExercise("bench press")?.rough).toBeUndefined();
    expect(lookupExercise("bench pres")?.rough).toBeUndefined();
  });
});

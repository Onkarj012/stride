import { describe, expect, it } from "vitest";
import { dayBarLabel, kcalHeroLabel, macroLabel } from "./speech";

describe("kcalHeroLabel", () => {
  it("says what is left under target", () => {
    expect(kcalHeroLabel(2000, 766.4)).toBe("1,234 kcal left of 2,000. 766 eaten.");
  });

  it("says over, not left, past target", () => {
    expect(kcalHeroLabel(2000, 2234)).toBe("234 kcal over your 2,000 target. 2,234 eaten.");
  });

  it("reads exactly on target as 0 left", () => {
    expect(kcalHeroLabel(1800, 1800)).toBe("0 kcal left of 1,800. 1,800 eaten.");
  });

  it("rounds eaten before subtracting, matching the card", () => {
    expect(kcalHeroLabel(2000, 766.5)).toBe("1,233 kcal left of 2,000. 767 eaten.");
  });
});

describe("macroLabel", () => {
  it("reads name, eaten and target as one sentence", () => {
    expect(macroLabel("Protein", 42.6, 120)).toBe("Protein, 43 of 120 grams");
  });
});

describe("dayBarLabel", () => {
  it("reads each meal's kcal", () => {
    expect(
      dayBarLabel([
        { name: "Breakfast", kcal: 400.4 },
        { name: "Lunch", kcal: 840 },
      ]),
    ).toBe("Breakfast, 400 kcal. Lunch, 840 kcal.");
  });

  it("is empty when the day has no meals", () => {
    expect(dayBarLabel([])).toBe("");
  });
});

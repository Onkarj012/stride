import { describe, test, expect } from "vitest";
import { classifyCoachType, applyBehaviorBias, toneInstruction, behaviorSummary } from "./coaches";

describe("classifyCoachType behavior bias", () => {
  test("clear keyword winner is unaffected by bias", () => {
    expect(classifyCoachType("how much protein in chicken breast?", "workout")).toBe("diet");
  });

  test("ambiguous message routes to preferred coach", () => {
    // No strong keywords → baseline 'overall'; with preferred 'diet' → 'diet'.
    expect(classifyCoachType("what should I focus on today?")).toBe("overall");
    expect(classifyCoachType("what should I focus on today?", "diet")).toBe("diet");
  });

  test("absent behavior leaves routing at baseline", () => {
    expect(classifyCoachType("I did some squats and deadlifts", null)).toBe("workout");
  });
});

describe("tone + summary helpers", () => {
  test("toneInstruction maps coachingStyle", () => {
    expect(toneInstruction("motivating")).toMatch(/motivating/i);
    expect(toneInstruction("analytical")).toMatch(/analytical/i);
    expect(toneInstruction(undefined)).toBe("");
  });
  test("behaviorSummary summarizes signals, empty when none", () => {
    expect(behaviorSummary(null)).toBe("");
    expect(behaviorSummary({ preferredCoach: "diet", engagedWindows: ["evening"], topSuggestions: ["Log lunch"] }))
      .toMatch(/diet/);
  });
  test("applyBehaviorBias only boosts valid preferred coach", () => {
    const base = { diet: 0, workout: 1, recovery: 0, water: 0, habit: 0, mindset: 0, overall: 0 } as any;
    expect(applyBehaviorBias(base, "diet").diet).toBe(0.5);
    expect(applyBehaviorBias(base, "overall").diet).toBe(0); // overall not boosted
    expect(applyBehaviorBias(base, undefined)).toEqual(base);
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clampFlags, combineConfidence, evaluateGate, GATE_MIN_CONFIDENCE, GATE_MIN_MATCH_SCORE, type GateItem } from "./gate.ts";

const good: GateItem = {
  source: "text",
  extractionConfidence: 0.95,
  matchScore: 1,
  portion: { status: "resolved", grams: 80, confidence: 0.9, method: "food_portion" },
  flags: [],
};

describe("evaluateGate", () => {
  it("auto-commits when every item passes", () => {
    const result = evaluateGate([good, { ...good, matchScore: GATE_MIN_MATCH_SCORE }]);
    expect(result.decision).toBe("commit");
    expect(result.items.map((i) => i.reasons)).toEqual([[], []]);
  });

  it("drafts the whole log when one item has a weak match", () => {
    const result = evaluateGate([good, { ...good, matchScore: 0.84 }]);
    expect(result.decision).toBe("draft");
    expect(result.items[1]?.reasons).toContain("low_match");
  });

  it("drafts unmatched items, unresolved portions and clamp flags", () => {
    expect(evaluateGate([{ ...good, matchScore: null }]).items[0]?.reasons).toContain("unmatched");
    expect(evaluateGate([{ ...good, portion: { status: "unresolved", reason: "missing_density" } }]).items[0]?.reasons)
      .toContain("unresolved_portion");
    expect(evaluateGate([{ ...good, flags: ["kcal_over_limit"] }]).items[0]?.reasons).toContain("clamp_flag");
  });

  it("drafts an empty log", () => {
    expect(evaluateGate([]).decision).toBe("draft");
  });

  it("badges photo items as estimated without changing the decision rule", () => {
    const result = evaluateGate([{ ...good, source: "photo" }]);
    expect(result.items[0]?.estimated).toBe(true);
    expect(result.decision).toBe("commit");
    expect(evaluateGate([good]).items[0]?.estimated).toBe(false);
  });
});

describe("clampFlags", () => {
  it("flags implausible amounts and kcal that disagree with macros", () => {
    const sane = { kcal: 200, protein: 10, carbs: 20, fat: 8.9, fiber: null, sugar: null, sodiumMg: null };
    expect(clampFlags(150, sane)).toEqual([]);
    expect(clampFlags(2500, sane)).toEqual(["grams_over_limit"]);
    expect(clampFlags(150, { ...sane, kcal: 500 })).toEqual(["atwater_mismatch"]);
  });
});

describe("properties", () => {
  const conf = fc.double({ min: 0, max: 1, noNaN: true });

  it("combined confidence is never above any part", () => {
    fc.assert(
      fc.property(conf, conf, conf, (extraction, portion, match) => {
        const c = combineConfidence({ extraction, portion, match });
        expect(c).toBeLessThanOrEqual(Math.min(extraction, portion, match));
      }),
    );
  });

  it("a commit implies every item cleared every threshold", () => {
    const item = fc.record({
      source: fc.constantFrom("text" as const, "voice" as const, "photo" as const, "barcode" as const),
      extractionConfidence: conf,
      matchScore: fc.option(conf, { nil: null }),
      portion: fc.record({
        status: fc.constant("resolved" as const),
        grams: fc.double({ min: 1, max: 500, noNaN: true }),
        confidence: conf,
        method: fc.constant("mass" as const),
      }),
      flags: fc.constant([]),
    });
    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 5 }), (items) => {
        const result = evaluateGate(items);
        if (result.decision !== "commit") return;
        for (const [i, it] of items.entries()) {
          expect(it.matchScore ?? 0).toBeGreaterThanOrEqual(GATE_MIN_MATCH_SCORE);
          expect(result.items[i]?.confidence ?? 0).toBeGreaterThanOrEqual(GATE_MIN_CONFIDENCE);
        }
      }),
    );
  });
});

import { describe, expect, test } from "vitest";
import { toGrams } from "./unit_converter";

describe("toGrams — existing behaviors", () => {
  test("grams pass through exactly", () => {
    expect(toGrams(150, "g")).toEqual({ grams: 150, confidence: 1.0, method: "exact" });
    expect(toGrams(150, "grams", "rice")).toEqual({ grams: 150, confidence: 1.0, method: "exact" });
  });

  test("common weight abbreviations are recognized as exact weights", () => {
    for (const unit of ["gms", "gm.", "gr", "grm"]) {
      expect(toGrams(200, unit, "paneer")).toEqual({ grams: 200, confidence: 1.0, method: "exact" });
    }
    for (const unit of ["kgs", "kilo", "kilos"]) {
      expect(toGrams(2, unit, "rice")).toEqual({ grams: 2000, confidence: 1.0, method: "exact" });
    }
  });

  test("ml uses volume × density", () => {
    const r = toGrams(200, "ml", "milk");
    expect(r.grams).toBe(Math.round(200 * 1.03));
    expect(r.method).toBe("volume");
  });

  test("tbsp converts through the volume table", () => {
    const r = toGrams(2, "tbsp", "olive oil");
    expect(r.grams).toBe(Math.round(2 * 15 * 0.92));
    expect(r.method).toBe("volume");
  });

  test("cup of water is 240g", () => {
    const r = toGrams(1, "cup", "water");
    expect(r.grams).toBe(240);
    expect(r.method).toBe("volume");
  });

  test("piece uses known piece weights", () => {
    const r = toGrams(2, "piece", "roti");
    expect(r.grams).toBe(80);
    expect(r.method).toBe("piece");
    expect(r.confidence).toBe(0.7);
  });
});

describe("toGrams — vessel/regional units (N8)", () => {
  test("katori routes through the volume path with density", () => {
    const r = toGrams(2, "katori", "dal");
    // 2 × 150ml × 0.95 g/ml
    expect(r.grams).toBe(Math.round(2 * 150 * 0.95));
    expect(r.method).toBe("volume");
    expect(r.grams).toBeGreaterThan(200);
  });

  test("glass of milk is a plausible portion", () => {
    const r = toGrams(1, "glass", "milk");
    expect(r.grams).toBe(Math.round(250 * 1.03));
    expect(r.method).toBe("volume");
  });

  test("tumbler and mug convert as volumes", () => {
    expect(toGrams(1, "tumbler", "water").grams).toBe(200);
    expect(toGrams(1, "mug", "water").grams).toBe(300);
  });
});

describe("toGrams — unknown unit fallback (N8)", () => {
  test("unknown unit is unresolved, not silently treated as grams or servings", () => {
    const r = toGrams(2, "vati", "rice");
    expect(r.grams).toBe(0);
    expect(r.method).toBe("unresolved");
    expect(r.confidence).toBe(0);
  });

  test("single unknown unit is unresolved", () => {
    const r = toGrams(1, "gadget", "chicken curry");
    expect(r.grams).toBe(0);
    expect(r.method).toBe("unresolved");
  });

  test("explicit serving aliases still estimate 100g each", () => {
    expect(toGrams(2, "serving", "rice")).toEqual({ grams: 200, confidence: 0.5, method: "estimated" });
    expect(toGrams(1, "servings", "chicken curry")).toEqual({ grams: 100, confidence: 0.5, method: "estimated" });
  });

  test("common typo units are unresolved", () => {
    expect(toGrams(2, "tbps", "olive oil")).toEqual({ grams: 0, confidence: 0, method: "unresolved" });
  });

  test("household vessel with unknown density is unresolved", () => {
    const r = toGrams(1, "mug", "cereal");
    expect(r.grams).toBe(0);
    expect(r.method).toBe("unresolved");
  });

  test("household vessel with known density has capped confidence", () => {
    const r = toGrams(1, "mug", "water");
    expect(r.grams).toBe(300);
    expect(r.confidence).toBe(0.6);
    expect(r.method).toBe("volume");
  });

  test("exact volume unit with unknown density has reduced confidence", () => {
    const r = toGrams(1, "cup", "cereal");
    expect(r.grams).toBe(Math.round(240 * 1.0));
    expect(r.confidence).toBe(0.45);
    expect(r.method).toBe("volume");
  });
});

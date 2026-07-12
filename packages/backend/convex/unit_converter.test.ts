import { describe, expect, test } from "vitest";
import { toGrams } from "./unit_converter";

describe("toGrams — existing behaviors", () => {
  test("grams pass through exactly", () => {
    expect(toGrams(150, "g")).toEqual({ grams: 150, confidence: 1.0, method: "exact" });
    expect(toGrams(150, "grams", "rice")).toEqual({ grams: 150, confidence: 1.0, method: "exact" });
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
  test("unknown unit is treated as servings, never as raw grams", () => {
    const r = toGrams(2, "vati", "rice");
    expect(r.grams).toBe(200); // 2 servings × ~100g, not 2 grams
    expect(r.method).toBe("estimated");
    expect(r.confidence).toBeLessThanOrEqual(0.3);
  });

  test("single unknown unit still yields a plausible portion", () => {
    const r = toGrams(1, "gadget", "chicken curry");
    expect(r.grams).toBe(100);
    expect(r.confidence).toBeLessThanOrEqual(0.3);
  });
});

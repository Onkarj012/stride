import { describe, expect, test } from "vitest";
import { toGrams } from "./unit_converter";

describe("toGrams — vessel and weight aliases", () => {
  test("resolves regional vessels and common weight abbreviations", () => {
    expect(toGrams(2, "katori", "dal")).toMatchObject({ grams: 285, method: "volume" });
    expect(toGrams(1, "glass", "milk")).toMatchObject({ grams: 258, method: "volume" });
    expect(toGrams(1, "mug", "water")).toMatchObject({ grams: 300, method: "volume", confidence: 0.6 });
    expect(toGrams(200, "gms", "paneer")).toMatchObject({ grams: 200, method: "exact" });
    expect(toGrams(2, "kilos", "rice")).toMatchObject({ grams: 2000, method: "exact" });
  });
});

describe("toGrams — unresolved units", () => {
  test("does not silently guess unknown units or unknown vessel density", () => {
    expect(toGrams(2, "vati", "rice")).toEqual({ grams: 0, confidence: 0, method: "unresolved" });
    expect(toGrams(1, "mug", "cereal")).toEqual({ grams: 0, confidence: 0, method: "unresolved" });
    expect(toGrams(1, "cup", "cereal")).toMatchObject({ grams: 240, confidence: 0.45, method: "volume" });
  });
});

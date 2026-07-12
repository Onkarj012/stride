import { describe, expect, test } from "vitest";
import { normalizeFoodQuery } from "./foods";

describe("normalizeFoodQuery", () => {
  test.each([
    ["2 Roti", "2 chapati"],
    ["chawal and dal", "cooked rice and cooked lentils"],
    ["Paneer bhurji", "cottage cheese bhurji"],
    ["rajma with dahi", "kidney beans with yogurt"],
    ["wholemeal bread and aubergine", "whole wheat bread and eggplant"],
  ])("normalizes %s", (query, expected) => {
    expect(normalizeFoodQuery(query)).toBe(expected);
  });

  test("normalizes whitespace while preserving unknown food terms", () => {
    expect(normalizeFoodQuery("  grilled   salmon  ")).toBe("grilled salmon");
  });
});

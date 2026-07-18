import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { normalizeFoodQuery } from "./foods";

const modules = import.meta.glob("./**/*.*s");
const fetchJsonWithTimeout = vi.hoisted(() => vi.fn());

vi.mock("./lib/fetch_timeout", () => ({ fetchJsonWithTimeout }));

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

  test("rejects OFF and USDA products missing any macro instead of zero-coercing them", async () => {
    const previousUsdaKey = process.env.USDA_API_KEY;
    process.env.USDA_API_KEY = "test-key";
    fetchJsonWithTimeout.mockImplementation(async (url: string) => url.includes("openfoodfacts")
      ? {
        products: [
          { product_name: "missing protein", nutriments: { "energy-kcal_100g": 100, "carbohydrates_100g": 10, "fat_100g": 5 } },
          { product_name: "missing carbs", nutriments: { "energy-kcal_100g": 100, "proteins_100g": 5, "fat_100g": 5 } },
          { product_name: "missing fat", nutriments: { "energy-kcal_100g": 100, "proteins_100g": 5, "carbohydrates_100g": 10 } },
        ],
      }
      : {
        foods: [
          { description: "missing calories", foodNutrients: [{ nutrientId: 1003, value: 5 }, { nutrientId: 1005, value: 10 }, { nutrientId: 1004, value: 5 }] },
          { description: "missing protein", foodNutrients: [{ nutrientId: 1008, value: 100 }, { nutrientId: 1005, value: 10 }, { nutrientId: 1004, value: 5 }] },
          { description: "missing carbs", foodNutrients: [{ nutrientId: 1008, value: 100 }, { nutrientId: 1003, value: 5 }, { nutrientId: 1004, value: 5 }] },
          { description: "missing fat", foodNutrients: [{ nutrientId: 1008, value: 100 }, { nutrientId: 1003, value: 5 }, { nutrientId: 1005, value: 10 }] },
        ],
      });

    try {
      const t = convexTest(schema, modules);
      const result = await t.action(internal.foods.searchFoodsLive, { query: "incomplete food" });
      expect(result).toEqual([]);
      expect(fetchJsonWithTimeout).toHaveBeenCalledTimes(2);
    } finally {
      if (previousUsdaKey === undefined) delete process.env.USDA_API_KEY;
      else process.env.USDA_API_KEY = previousUsdaKey;
      fetchJsonWithTimeout.mockReset();
    }
  });
});

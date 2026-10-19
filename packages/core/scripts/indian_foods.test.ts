import { describe, expect, it } from "vitest";
import type { FoodRecord } from "../src/nutrition/types.ts";
import { applyCurated, CURATED, strideFoods } from "./indian_foods.ts";

const NUTRIENTS = { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: null, sugar: null, sodiumMg: null };

/** One fixture row per curated entry, plus any extra rows the test adds. */
function fixture(extra: FoodRecord[] = []): FoodRecord[] {
  const rows = CURATED.map((c) => ({
    name: `Row ${c.sourceId}`,
    aliases: [],
    per100g: NUTRIENTS,
    source: c.source,
    sourceId: c.sourceId,
    verified: true,
  }));
  return [...rows, ...extra];
}

describe("strideFoods", () => {
  const kcalOf = (name: string): number | undefined => strideFoods().foods.find((f) => f.name.startsWith(name))?.per100g.kcal;

  it("computes recipe kcal per 100 g from the spec ingredients, within 1 kcal", () => {
    expect(kcalOf("Chai, milk tea with sugar")).toBeCloseTo(65.5, 0);
    expect(kcalOf("Chai, milk tea without sugar")).toBeCloseTo(38, 0);
    expect(kcalOf("Coffee with milk")).toBeCloseTo(62, 0);
    expect(kcalOf("Chaas")).toBeCloseTo(21, 0);
  });

  it("marks own rows as stride, verified, with one teacup, cup or glass portion each", () => {
    const { foods, portions } = strideFoods();
    expect(foods.every((f) => f.source === "stride" && f.verified)).toBe(true);
    expect(portions.map((p) => [p.sourceId, p.measure, p.gramsPerMeasure])).toEqual([
      ["chai-sweet", "teacup", 110],
      ["chai-unsweet", "teacup", 102],
      ["coffee-milk-sweet", "cup", 160],
      ["chaas", "glass", 250],
    ]);
  });
});

describe("applyCurated", () => {
  it("adds aliases to listed rows and renames the two that move aside", () => {
    const out = applyCurated(fixture());
    const dahl = out.find((f) => f.source === "cofid" && f.sourceId === "15-780");
    expect(dahl?.aliases).toEqual(["dal", "toor dal", "tur dal", "arhar dal", "dal tadka", "dal fry"]);
    expect(out.find((f) => f.sourceId === "2707427")?.name).toBe("Dal, US recipe with butter oil");
    expect(out.find((f) => f.sourceId === "2705393")?.name).toBe("Buttermilk, cultured, US style");
  });

  it("keeps the own rows and checks their aliases", () => {
    const own = strideFoods().foods;
    const out = applyCurated([...fixture(), ...own]);
    expect(out.filter((f) => f.source === "stride")).toHaveLength(4);
  });

  it("throws and names both rows when a curated alias collides with another row's name", () => {
    const clash: FoodRecord = { name: "Lentil soup", aliases: ["toor dal"], per100g: NUTRIENTS, source: "fdc", sourceId: "999", verified: true };
    expect(() => applyCurated(fixture([clash]))).toThrow(/"toor dal" of cofid:15-780.*"toor dal" of fdc:999 "Lentil soup"/s);
  });

  it("throws when a row's own name matches a curated alias of another row", () => {
    const clash: FoodRecord = { name: "Coffee", aliases: [], per100g: NUTRIENTS, source: "fdc", sourceId: "998", verified: true };
    expect(() => applyCurated([...fixture([clash]), ...strideFoods().foods])).toThrow(/fdc:998 "Coffee"/);
  });

  it("throws when a listed row is missing", () => {
    const withoutDahl = fixture().filter((f) => f.sourceId !== "15-780");
    expect(() => applyCurated(withoutDahl)).toThrow(/cofid:15-780/);
  });
});

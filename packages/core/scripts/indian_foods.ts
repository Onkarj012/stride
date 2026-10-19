import { canonicalTokens } from "../src/nutrition/match.ts";
import type { FoodPortionRecord, FoodRecord, FoodSource, Nutrients } from "../src/nutrition/types.ts";

/** Aliases and renames for public rows, so Indian and everyday names resolve. Keyed by source and source id. */
export const CURATED: readonly { source: FoodSource; sourceId: string; aliases: readonly string[]; rename?: string }[] = [
  { source: "cofid", sourceId: "15-780", aliases: ["dal", "toor dal", "tur dal", "arhar dal", "dal tadka", "dal fry"] },
  { source: "cofid", sourceId: "15-768", aliases: ["moong dal", "mung dal"] },
  { source: "cofid", sourceId: "15-760", aliases: ["masoor dal"] },
  // The US FNDDS "Dal" row moves aside so "dal" can match the CoFID row.
  { source: "fdc", sourceId: "2707427", aliases: [], rename: "Dal, US recipe with butter oil" },
  { source: "cofid", sourceId: "15-627", aliases: ["bhindi sabzi", "bhindi", "bhindi masala", "okra sabzi"] },
  { source: "cofid", sourceId: "12-467", aliases: ["sambar"] },
  { source: "cofid", sourceId: "19-454", aliases: ["chicken biryani", "biryani"] },
  { source: "cofid", sourceId: "15-146", aliases: ["rajma"] },
  { source: "cofid", sourceId: "12-495", aliases: ["paneer"] },
  { source: "cofid", sourceId: "15-529", aliases: ["khichdi", "khichadi"] },
  { source: "cofid", sourceId: "11-973", aliases: ["naan"] },
  { source: "cofid", sourceId: "12-373", aliases: ["lassi", "sweet lassi"] },
  { source: "cofid", sourceId: "17-832", aliases: ["raita"] },
  { source: "cofid", sourceId: "11-1081", aliases: ["gulab jamun"] },
  { source: "fdc", sourceId: "2710472", aliases: ["cappuccino"] },
  { source: "fdc", sourceId: "2710386", aliases: ["latte", "cafe latte"] },
  { source: "fdc", sourceId: "2707713", aliases: ["roti"] },
  { source: "fdc", sourceId: "2707715", aliases: ["paratha", "plain paratha"] },
  { source: "fdc", sourceId: "2708347", aliases: ["dosa", "plain dosa", "sada dosa"] },
  { source: "fdc", sourceId: "2709129", aliases: ["masala dosa"] },
  { source: "fdc", sourceId: "2710168", aliases: ["ghee"] },
  { source: "fdc", sourceId: "2707154", aliases: ["boiled egg", "egg boiled"] },
  { source: "fdc", sourceId: "2709224", aliases: ["banana"] },
  { source: "fdc", sourceId: "2707515", aliases: ["roasted peanuts", "peanuts"] },
  { source: "fdc", sourceId: "2705418", aliases: ["curd", "dahi"] },
  { source: "fdc", sourceId: "2708408", aliases: ["rice", "steamed rice", "plain rice"] },
  // Frees the name "buttermilk" for the own chaas row.
  { source: "fdc", sourceId: "2705393", aliases: [], rename: "Buttermilk, cultured, US style" },
];

/** Per-100 g ingredients for the own recipes. Each has its CoFID 2021 code. Fiber, sugar and sodium come from the file. */
const INGREDIENTS = {
  // CoFID 12-596 Milk, whole, pasteurised, average
  milk: { kcal: 63, protein: 3.4, carbs: 4.6, fat: 3.6, fiber: 0, sugar: 4.6, sodiumMg: 42 },
  // CoFID 17-063 Sugar, white (carbs are monosaccharide equivalents, so 105 is real). Sodium 0 per spec; the file says 5 mg.
  sugar: { kcal: 394, protein: 0, carbs: 105, fat: 0, fiber: 0, sugar: 105, sodiumMg: 0 },
  // CoFID 12-184 Yogurt, whole milk, plain
  yogurt: { kcal: 79, protein: 5.7, carbs: 7.8, fat: 3.0, fiber: 0, sugar: 7.8, sodiumMg: 80 },
  // CoFID 17-158 Coffee, powder, instant
  instantCoffee: { kcal: 75, protein: 14.6, carbs: 4.5, fat: 0, fiber: 0, sugar: 0, sodiumMg: 81 },
} satisfies Record<string, Nutrients>;

/** One own recipe. Parts are raw grams. Water, strained tea leaves and spices add no nutrients, so they are left out. */
interface Recipe {
  sourceId: string;
  name: string;
  aliases: readonly string[];
  parts: readonly { food: Nutrients; grams: number }[];
  /** Grams after simmering and straining. Nutrients are divided by this. */
  cookedGrams: number;
  portion: { measure: string; description: string; grams: number };
}

/** Own rows for drinks and dishes no public row matches well. Estimates: the note says so on every row. */
const STRIDE_RECIPES: readonly Recipe[] = [
  {
    sourceId: "chai-sweet",
    name: "Chai, milk tea with sugar",
    aliases: ["chai", "masala chai", "adrak chai", "cutting chai", "milk tea", "tea with milk", "chai with sugar"],
    parts: [{ food: INGREDIENTS.milk, grams: 61.8 }, { food: INGREDIENTS.sugar, grams: 8.4 }],
    cookedGrams: 110,
    portion: { measure: "teacup", description: "teacup, home", grams: 110 },
  },
  {
    sourceId: "chai-unsweet",
    name: "Chai, milk tea without sugar",
    aliases: ["chai without sugar", "sugarless chai", "chai no sugar", "tea without sugar"],
    parts: [{ food: INGREDIENTS.milk, grams: 61.8 }],
    cookedGrams: 102,
    portion: { measure: "teacup", description: "teacup, home", grams: 102 },
  },
  {
    sourceId: "coffee-milk-sweet",
    name: "Coffee with milk and sugar, Indian style",
    aliases: ["coffee", "milk coffee", "filter coffee", "nescafe", "coffee with milk"],
    parts: [{ food: INGREDIENTS.milk, grams: 103 }, { food: INGREDIENTS.instantCoffee, grams: 2 }, { food: INGREDIENTS.sugar, grams: 8.4 }],
    cookedGrams: 160,
    portion: { measure: "cup", description: "cup, home", grams: 160 },
  },
  {
    sourceId: "chaas",
    name: "Chaas, spiced buttermilk",
    aliases: ["chaas", "masala chaas", "buttermilk"],
    parts: [{ food: INGREDIENTS.yogurt, grams: 80 }],
    cookedGrams: 300,
    portion: { measure: "glass", description: "glass", grams: 250 },
  },
];

/** Canonical form the matcher compares: tokens with synonyms collapsed, joined by single spaces. */
function canonical(text: string): string {
  return canonicalTokens(text).join(" ");
}

/** Sums a nutrient over the parts, scaled by grams and divided by the cooked weight, per 100 g. */
function blendRequired(parts: Recipe["parts"], cookedGrams: number, pick: (n: Nutrients) => number): number {
  return parts.reduce((sum, p) => sum + (pick(p.food) * p.grams) / 100, 0) / cookedGrams * 100;
}

/** Like `blendRequired`, with missing parts counted as zero. Null when no part has the value. */
function blendOptional(parts: Recipe["parts"], cookedGrams: number, pick: (n: Nutrients) => number | null): number | null {
  if (parts.every((p) => pick(p.food) === null)) return null;
  return blendRequired(parts, cookedGrams, (n) => pick(n) ?? 0);
}

/** Per-100 g nutrients of a whole recipe, from its ingredients. */
function blend(recipe: Recipe): Nutrients {
  const { parts, cookedGrams } = recipe;
  return {
    kcal: blendRequired(parts, cookedGrams, (n) => n.kcal),
    protein: blendRequired(parts, cookedGrams, (n) => n.protein),
    carbs: blendRequired(parts, cookedGrams, (n) => n.carbs),
    fat: blendRequired(parts, cookedGrams, (n) => n.fat),
    fiber: blendOptional(parts, cookedGrams, (n) => n.fiber),
    sugar: blendOptional(parts, cookedGrams, (n) => n.sugar),
    sodiumMg: blendOptional(parts, cookedGrams, (n) => n.sodiumMg),
  };
}

/** The own recipe rows as `stride` foods and their household portions. */
export function strideFoods(): { foods: FoodRecord[]; portions: FoodPortionRecord[] } {
  return {
    foods: STRIDE_RECIPES.map((r): FoodRecord => ({
      name: r.name,
      aliases: [...r.aliases],
      per100g: blend(r),
      source: "stride",
      sourceId: r.sourceId,
      verified: true,
    })),
    portions: STRIDE_RECIPES.map((r): FoodPortionRecord => ({
      source: "stride",
      sourceId: r.sourceId,
      measure: r.portion.measure,
      description: r.portion.description,
      gramsPerMeasure: r.portion.grams,
    })),
  };
}

/** Throws when an alias of one of `checked` has the same canonical form as another row's name or alias. */
function checkAliasCollisions(checked: readonly FoodRecord[], all: readonly FoodRecord[]): void {
  const owners = new Map<string, { row: FoodRecord; text: string }[]>();
  for (const row of all) {
    for (const text of [row.name, ...row.aliases]) {
      const key = canonical(text);
      if (key === "") continue;
      owners.set(key, [...(owners.get(key) ?? []), { row, text }]);
    }
  }
  const clashes: string[] = [];
  for (const row of checked) {
    for (const alias of row.aliases) {
      for (const other of owners.get(canonical(alias)) ?? []) {
        if (other.row === row) continue;
        clashes.push(`"${alias}" of ${row.source}:${row.sourceId} "${row.name}" = "${other.text}" of ${other.row.source}:${other.row.sourceId} "${other.row.name}"`);
      }
    }
  }
  if (clashes.length > 0) throw new Error(`curated aliases collide with other rows:\n${clashes.join("\n")}`);
}

/** Adds curated aliases and renames to the rows, then throws if a listed row is missing or an alias collides. */
export function applyCurated(foods: readonly FoodRecord[]): FoodRecord[] {
  const out = foods.map((f) => ({ ...f, aliases: [...f.aliases] }));
  const missing: string[] = [];
  const touched = new Set<FoodRecord>();
  for (const c of CURATED) {
    const row = out.find((f) => f.source === c.source && f.sourceId === c.sourceId);
    if (row === undefined) {
      missing.push(`${c.source}:${c.sourceId}`);
      continue;
    }
    if (c.rename !== undefined) row.name = c.rename;
    row.aliases = [...new Set([...row.aliases, ...c.aliases])];
    touched.add(row);
  }
  if (missing.length > 0) throw new Error(`curated rows are missing from the import: ${missing.join(", ")}`);
  // Own rows are checked too, since their aliases are curated in the recipe table.
  const checked = out.filter((f) => touched.has(f) || f.source === "stride");
  checkAliasCollisions(checked, out);
  return out;
}

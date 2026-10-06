import { MASS_UNITS_G } from "../src/nutrition/household_measures.ts";
import type { FoodPortionRecord, FoodRecord, Nutrients } from "../src/nutrition/types.ts";
import { normalizeUnit } from "../src/nutrition/units.ts";
import { csvRecords, num } from "./lib.ts";

/** Official FoodData Central CSV downloads, listed at https://fdc.nal.usda.gov/download-datasets (checked 2026-10-06). */
export const FDC_DATASETS = [
  {
    dataType: "sr_legacy_food",
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
  },
  {
    dataType: "foundation_food",
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
  },
] as const;

/** CSV files read from each FDC zip. */
export const FDC_FILES = ["food.csv", "food_nutrient.csv", "food_portion.csv", "measure_unit.csv"] as const;

/**
 * FDC nutrient ids, in order of preference. Foundation foods often lack 1008 and report Atwater energy instead.
 * kJ (1062) is the last resort and is converted at 4.184 kJ/kcal.
 */
export const FDC_NUTRIENTS = {
  kcal: [1008, 2048, 2047],
  kJ: [1062],
  protein: [1003],
  fat: [1004, 1085],
  carbs: [1005, 1050],
  fiber: [1079],
  sugar: [2000, 1063],
  sodiumMg: [1093],
} as const;

const KJ_PER_KCAL = 4.184;
const WANTED_NUTRIENTS = new Set<number>(Object.values(FDC_NUTRIENTS).flat());
/** Measure units that describe yield pairs or drippings, not something you eat by the measure. */
const SKIPPED_MEASURE_UNIT_IDS = new Set(["1010", "1011", "1012"]);
const UNDETERMINED_UNIT_ID = "9999";

/** Mapped rows plus counts of what was dropped and why. */
export interface FdcResult {
  foods: FoodRecord[];
  portions: FoodPortionRecord[];
  skippedFoods: number;
  skippedPortions: number;
}

/** First available value among nutrient ids, or null. */
function pick(values: ReadonlyMap<number, number>, ids: readonly number[]): number | null {
  for (const id of ids) {
    const v = values.get(id);
    if (v !== undefined) return v;
  }
  return null;
}

/** Builds per-100 g nutrients from one food's nutrient values, or null when kcal or a macro is missing. */
export function fdcNutrients(values: ReadonlyMap<number, number>): Nutrients | null {
  const kJ = pick(values, FDC_NUTRIENTS.kJ);
  const kcal = pick(values, FDC_NUTRIENTS.kcal) ?? (kJ === null ? null : kJ / KJ_PER_KCAL);
  const protein = pick(values, FDC_NUTRIENTS.protein);
  const carbs = pick(values, FDC_NUTRIENTS.carbs);
  const fat = pick(values, FDC_NUTRIENTS.fat);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber: pick(values, FDC_NUTRIENTS.fiber),
    sugar: pick(values, FDC_NUTRIENTS.sugar),
    sodiumMg: pick(values, FDC_NUTRIENTS.sodiumMg),
  };
}

/** Two-word measures kept whole; every other label is reduced to its first word. */
const TWO_WORD_MEASURES = new Set(["fl oz", "nlea serving", "extra large", "extra small"]);

/** Measure name of a portion label: "cup, chopped" → "cup", "serving 1 roll" → "serving", "fl oz" stays. */
function measureOf(label: string): string {
  const words = (label.split(/[,(]/)[0] ?? "").trim().toLowerCase().split(/\s+/);
  const pair = words.slice(0, 2).join(" ");
  return normalizeUnit(TWO_WORD_MEASURES.has(pair) ? pair : (words[0] ?? ""));
}

/** Maps one extracted FDC CSV set to `foods` and `food_portions` rows for the given data type. */
export function mapFdc(files: ReadonlyMap<string, string>, dataType: string): FdcResult {
  const read = (name: string) => csvRecords(files.get(name) ?? "");
  const foodRows = read("food.csv").filter((f) => f["data_type"] === dataType);
  const ids = new Set(foodRows.map((f) => f["fdc_id"] ?? ""));

  const values = new Map<string, Map<number, number>>();
  for (const row of read("food_nutrient.csv")) {
    const id = row["fdc_id"] ?? "";
    const nutrient = Number(row["nutrient_id"]);
    const amount = num(row["amount"]);
    if (!ids.has(id) || !WANTED_NUTRIENTS.has(nutrient) || amount === null || amount < 0) continue;
    let perFood = values.get(id);
    if (perFood === undefined) values.set(id, (perFood = new Map()));
    perFood.set(nutrient, amount);
  }

  const foods: FoodRecord[] = [];
  let skippedFoods = 0;
  for (const row of foodRows) {
    const id = row["fdc_id"] ?? "";
    const per100g = fdcNutrients(values.get(id) ?? new Map());
    const name = (row["description"] ?? "").trim();
    if (per100g === null || name === "") {
      skippedFoods++;
      continue;
    }
    foods.push({ name, aliases: [], per100g, source: "fdc", sourceId: id, verified: true });
  }

  const kept = new Set(foods.map((f) => f.sourceId));
  const unitNames = new Map(read("measure_unit.csv").map((u) => [u["id"] ?? "", u["name"] ?? ""]));
  const grouped = new Map<string, { record: Omit<FoodPortionRecord, "gramsPerMeasure">; grams: number[] }>();
  let skippedPortions = 0;
  for (const row of read("food_portion.csv")) {
    const id = row["fdc_id"] ?? "";
    if (!kept.has(id)) continue;
    const unitId = row["measure_unit_id"] ?? "";
    const amount = num(row["amount"]) ?? 1;
    const grams = num(row["gram_weight"]);
    const unitName = unitId === UNDETERMINED_UNIT_ID ? "" : (unitNames.get(unitId) ?? "");
    const detail = [row["modifier"], row["portion_description"]].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
    const label = [unitName, detail].filter(Boolean).join(", ");
    const measure = measureOf(unitName || detail);
    if (SKIPPED_MEASURE_UNIT_IDS.has(unitId) || label === "" || grams === null || grams <= 0 || amount <= 0 || Object.hasOwn(MASS_UNITS_G, measure)) {
      skippedPortions++;
      continue;
    }
    // Foundation foods list one row per lab sample; average samples of the same measure into one portion.
    const key = `${id}|${label}`;
    const group = grouped.get(key) ?? { record: { source: "fdc" as const, sourceId: id, measure, description: label }, grams: [] };
    group.grams.push(grams / amount);
    grouped.set(key, group);
  }
  const portions = [...grouped.values()].map(({ record, grams }) => ({
    ...record,
    gramsPerMeasure: grams.reduce((s, g) => s + g, 0) / grams.length,
  }));

  return { foods, portions, skippedFoods, skippedPortions };
}

import type { FoodRecord } from "../src/nutrition/types.ts";
import { csvRecords, num } from "./lib.ts";

/** Proximates sheet columns the mapper reads, matched by header name. Units per 100 g edible portion, energy in kcal. */
export const COFID_PROXIMATE_COLUMNS = [
  "Food Code",
  "Food Name",
  "Group",
  "Protein (g)",
  "Fat (g)",
  "Carbohydrate (g)",
  "Energy (kcal) (kcal)",
  "Total sugars (g)",
  "AOAC fibre (g)",
  "NSP (g)",
] as const;

/** Inorganics sheet column with sodium in mg. The food code is in the column headed " " (or "Food Code"). */
const SODIUM_COLUMN = "Sodium (mg)";
/** CoFID groups whose code starts with Q are alcoholic drinks. CoFID gives those per 100 ml, so they are left out. */
const ALCOHOL_GROUP_PREFIX = "Q";
/** CoFID marks a trace amount as "Tr". Trace counts as zero. */
const TRACE = "Tr";

/** Mapped rows plus how many were dropped for missing kcal or macros. */
export interface CofidResult {
  foods: FoodRecord[];
  skippedFoods: number;
}

/** Reads a CoFID cell: "Tr" is 0, while "N" (not determined) and empty cells are null. */
function nutrient(cell: string | undefined): number | null {
  if (cell?.trim() === TRACE) return 0;
  const value = num(cell);
  return value !== null && value >= 0 ? value : null;
}

/** Sodium in mg for each food code, read from the inorganics sheet. */
function sodiumByCode(inorganicsCsv: string): Map<string, number | null> {
  return new Map(
    csvRecords(inorganicsCsv).map((row) => [(row[" "] ?? row["Food Code"] ?? "").trim(), nutrient(row[SODIUM_COLUMN])]),
  );
}

/** Maps the CoFID 2021 proximates and inorganics sheets, as CSV with only the first header row, to `foods` rows. Throws when a proximates column is missing. */
export function mapCofid(proximatesCsv: string, inorganicsCsv: string): CofidResult {
  const rows = csvRecords(proximatesCsv);
  const first = rows[0];
  if (first !== undefined) {
    const missing = COFID_PROXIMATE_COLUMNS.filter((c) => !(c in first));
    if (missing.length > 0) throw new Error(`CoFID CSV is missing columns: ${missing.join(", ")}`);
  }
  const sodium = sodiumByCode(inorganicsCsv);
  const foods: FoodRecord[] = [];
  let skippedFoods = 0;
  for (const row of rows) {
    if ((row["Group"] ?? "").trim().startsWith(ALCOHOL_GROUP_PREFIX)) continue;
    const name = (row["Food Name"] ?? "").trim();
    const code = (row["Food Code"] ?? "").trim();
    const kcal = nutrient(row["Energy (kcal) (kcal)"]);
    const protein = nutrient(row["Protein (g)"]);
    const fat = nutrient(row["Fat (g)"]);
    const carbs = nutrient(row["Carbohydrate (g)"]);
    if (name === "" || code === "" || kcal === null || protein === null || fat === null || carbs === null) {
      skippedFoods++;
      continue;
    }
    foods.push({
      name,
      aliases: [],
      per100g: {
        kcal,
        protein,
        carbs,
        fat,
        fiber: nutrient(row["AOAC fibre (g)"]) ?? nutrient(row["NSP (g)"]),
        sugar: nutrient(row["Total sugars (g)"]),
        sodiumMg: sodium.get(code) ?? null,
      },
      source: "cofid",
      sourceId: code,
      verified: true,
    });
  }
  return { foods, skippedFoods };
}

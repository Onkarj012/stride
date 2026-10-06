import type { FoodRecord } from "../src/nutrition/types.ts";
import { csvRecords, num } from "./lib.ts";

/** Columns the IFCT 2017 CSV must have. Units per 100 g edible portion: enerc in kJ, na in g, the rest in g. */
export const IFCT_COLUMNS = ["code", "name", "lang", "enerc", "protcnt", "fatce", "choavldf", "fibtg", "fsugar", "na"] as const;

/** Language prefixes in the `lang` column whose names become aliases: English, Hindi, Marathi. */
export const IFCT_ALIAS_LANGUAGES = ["E", "H", "Mar"] as const;

const KJ_PER_KCAL = 4.184;

/** Mapped rows plus how many were dropped for missing kcal or macros. */
export interface IfctResult {
  foods: FoodRecord[];
  skippedFoods: number;
}

/** Pulls aliases out of the `lang` cell, e.g. "H. Chawal; Mar. Tandool" → ["chawal", "tandool"]. */
export function ifctAliases(lang: string, name: string): string[] {
  const aliases = new Set<string>();
  for (const part of lang.split(";")) {
    const m = /^\s*([A-Za-z]+)\.\s*(.+?)\s*\.?\s*$/.exec(part);
    if (m === null) continue;
    const [, language, words] = m;
    if (language === undefined || words === undefined || !IFCT_ALIAS_LANGUAGES.some((l) => l === language)) continue;
    for (const word of words.split(/[/,]/)) {
      const alias = word.replace(/\(.*?\)/g, "").trim().toLowerCase();
      if (alias !== "" && alias !== name.toLowerCase()) aliases.add(alias);
    }
  }
  return [...aliases];
}

/** Maps an IFCT 2017 compositions CSV to `foods` rows. Throws when a required column is missing. */
export function mapIfct(csv: string): IfctResult {
  const rows = csvRecords(csv);
  const first = rows[0];
  if (first !== undefined) {
    const missing = IFCT_COLUMNS.filter((c) => !(c in first));
    if (missing.length > 0) throw new Error(`IFCT CSV is missing columns: ${missing.join(", ")}`);
  }
  const foods: FoodRecord[] = [];
  let skippedFoods = 0;
  for (const row of rows) {
    const name = (row["name"] ?? "").trim();
    const code = (row["code"] ?? "").trim();
    const kJ = num(row["enerc"]);
    const protein = num(row["protcnt"]);
    const fat = num(row["fatce"]);
    const carbs = num(row["choavldf"]);
    if (name === "" || code === "" || kJ === null || protein === null || fat === null || carbs === null) {
      skippedFoods++;
      continue;
    }
    const sodiumG = num(row["na"]);
    foods.push({
      name,
      aliases: ifctAliases(row["lang"] ?? "", name),
      per100g: {
        kcal: kJ / KJ_PER_KCAL,
        protein,
        carbs,
        fat,
        fiber: num(row["fibtg"]),
        sugar: num(row["fsugar"]),
        sodiumMg: sodiumG === null ? null : sodiumG * 1000,
      },
      source: "ifct",
      sourceId: code,
      verified: true,
    });
  }
  return { foods, skippedFoods };
}

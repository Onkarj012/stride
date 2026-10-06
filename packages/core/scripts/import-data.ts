import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FoodPortionRecord, FoodRecord } from "../src/nutrition/types.ts";
import { EXERCISES_URL, mapExercises } from "./exercises.ts";
import { FDC_DATASETS, FDC_FILES, mapFdc } from "./fdc.ts";
import { mapIfct } from "./ifct.ts";
import { cachedDownload, unzip, writeNdjson } from "./lib.ts";

const USAGE = `usage: pnpm --filter @stride/core data:import [fdc] [exercises] [ifct <path-to-ifct.csv>]
With no arguments, runs fdc and exercises. Output goes to packages/core/data/out/.`;

/** Downloads SR Legacy and Foundation, maps them and writes fdc_foods and fdc_food_portions. */
async function importFdc(): Promise<void> {
  const foods: FoodRecord[] = [];
  const portions: FoodPortionRecord[] = [];
  for (const dataset of FDC_DATASETS) {
    const files = unzip(await cachedDownload(dataset.url), FDC_FILES);
    const result = mapFdc(files, dataset.dataType);
    console.log(
      `fdc ${dataset.dataType}: ${result.foods.length} foods (${result.skippedFoods} skipped), ` +
        `${result.portions.length} portions (${result.skippedPortions} skipped)`,
    );
    foods.push(...result.foods);
    portions.push(...result.portions);
  }
  console.log(`wrote ${await writeNdjson("fdc_foods.ndjson", foods)}`);
  console.log(`wrote ${await writeNdjson("fdc_food_portions.ndjson", portions)}`);
}

/** Downloads free-exercise-db and writes exercises. */
async function importExercises(): Promise<void> {
  const raw: unknown = JSON.parse((await cachedDownload(EXERCISES_URL)).toString("utf8"));
  const result = mapExercises(raw);
  console.log(`exercises: ${result.exercises.length} rows (${result.skipped} skipped)`);
  console.log(`wrote ${await writeNdjson("exercises.ndjson", result.exercises)}`);
}

/** Maps a local IFCT 2017 CSV and writes ifct_foods. The dataset is personal-use only; output stays local. */
async function importIfct(csvPath: string): Promise<void> {
  const result = mapIfct(await readFile(csvPath, "utf8"));
  console.log(`ifct: ${result.foods.length} foods (${result.skippedFoods} skipped)`);
  console.log(`wrote ${await writeNdjson("ifct_foods.ndjson", result.foods)}`);
}

/** Parses arguments and runs the requested imports in order. */
async function main(args: readonly string[]): Promise<void> {
  const steps = args.length === 0 ? ["fdc", "exercises"] : [...args];
  // pnpm runs package scripts from the package folder; INIT_CWD is where the user typed the command.
  const userCwd = process.env["INIT_CWD"] ?? process.cwd();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === "fdc") await importFdc();
    else if (step === "exercises") await importExercises();
    else if (step === "ifct") {
      const path = steps[++i];
      if (path === undefined) throw new Error(`ifct needs a CSV path\n${USAGE}`);
      await importIfct(resolve(userCwd, path));
    } else throw new Error(`unknown step "${step}"\n${USAGE}`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FoodPortionRecord, FoodRecord, FoodSource } from "../src/nutrition/types.ts";
import { mapCofid } from "./cofid.ts";
import { EXERCISES_URL, mapExercises } from "./exercises.ts";
import { FDC_DATASETS, FDC_FILES, mapFdc } from "./fdc.ts";
import { mapIfct } from "./ifct.ts";
import { applyCurated, curatedPortions, strideFoods } from "./indian_foods.ts";
import { cachedDownload, OUT_DIR, unzip, writeNdjson } from "./lib.ts";

const USAGE = `usage: pnpm --filter @stride/core data:import [fdc] [exercises] [ifct <ifct.csv>] [cofid <proximates.csv> <inorganics.csv>] [indian]
With no arguments, runs fdc and exercises. Output goes to packages/core/data/out/.
Run in this order: fdc, cofid, indian. indian reads the fdc and cofid output, so it must come after them.`;

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

/** Maps the local CoFID 2021 proximates and inorganics CSVs and writes cofid_foods. Open Government Licence v3.0. */
async function importCofid(proximatesPath: string, inorganicsPath: string): Promise<void> {
  const result = mapCofid(await readFile(proximatesPath, "utf8"), await readFile(inorganicsPath, "utf8"));
  console.log(`cofid: ${result.foods.length} foods (${result.skippedFoods} skipped)`);
  console.log(`wrote ${await writeNdjson("cofid_foods.ndjson", result.foods)}`);
}

/** Checks that a parsed NDJSON line has the keys of a food row. Only keys are checked, not value types. */
function hasFoodKeys(value: unknown): value is FoodRecord {
  return typeof value === "object" && value !== null && ["name", "aliases", "per100g", "source", "sourceId", "verified"].every((k) => k in value);
}

/** Reads rows an earlier step wrote as NDJSON. Throws when the file is missing or a line is not a food row. */
async function readRows(fileName: string): Promise<FoodRecord[]> {
  const path = join(OUT_DIR, fileName);
  if (!existsSync(path)) throw new Error(`${path} is missing. Run the earlier import step first.`);
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): unknown => JSON.parse(line))
    .map((row) => {
      if (!hasFoodKeys(row)) throw new Error(`${path} has a line that is not a food row`);
      return row;
    });
}

/** Adds curated names and aliases to fdc and cofid rows, adds the own stride rows, and checks every row for alias collisions. */
async function importIndian(): Promise<void> {
  const fdc = await readRows("fdc_foods.ndjson");
  const cofid = await readRows("cofid_foods.ndjson");
  // ifct is only read for the collision check. Its rows are not rewritten.
  const ifct = existsSync(join(OUT_DIR, "ifct_foods.ndjson")) ? await readRows("ifct_foods.ndjson") : [];
  const stride = strideFoods();
  const all = applyCurated([...fdc, ...cofid, ...ifct, ...stride.foods]);
  const bySource = (source: FoodSource): FoodRecord[] => all.filter((f) => f.source === source);
  console.log(`indian: ${all.length} rows checked, ${stride.foods.length} own rows, ${stride.portions.length} own portions`);
  console.log(`wrote ${await writeNdjson("fdc_foods.ndjson", bySource("fdc"))}`);
  console.log(`wrote ${await writeNdjson("cofid_foods.ndjson", bySource("cofid"))}`);
  console.log(`wrote ${await writeNdjson("stride_foods.ndjson", stride.foods)}`);
  const portions = [...curatedPortions(), ...stride.portions];
  console.log(`wrote ${await writeNdjson("stride_food_portions.ndjson", portions)}`);
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
    } else if (step === "cofid") {
      const proximates = steps[++i];
      const inorganics = steps[++i];
      if (proximates === undefined || inorganics === undefined) throw new Error(`cofid needs two CSV paths\n${USAGE}`);
      await importCofid(resolve(userCwd, proximates), resolve(userCwd, inorganics));
    } else if (step === "indian") await importIndian();
    else throw new Error(`unknown step "${step}"\n${USAGE}`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

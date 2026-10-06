import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** NDJSON written by `pnpm --filter @stride/core data:import`. */
const OUT_DIR = new URL("../../core/data/out/", import.meta.url).pathname;
const BACKEND_DIR = new URL("..", import.meta.url).pathname;
/** Rows per `convex run` call. Keeps each call far under the 500-row cap and the command-line size limit. */
const BATCH_SIZE = 200;

/** One NDJSON file and the internal mutation that loads it. Order matters: portions need their foods first. */
const STEPS = [
  { file: "fdc_foods.ndjson", fn: "foods_db:upsertFoods", arg: "foods", required: true },
  { file: "ifct_foods.ndjson", fn: "foods_db:upsertFoods", arg: "foods", required: false },
  { file: "fdc_food_portions.ndjson", fn: "foods_db:upsertFoodPortions", arg: "portions", required: true },
  { file: "exercises.ndjson", fn: "foods_db:upsertExercises", arg: "exercises", required: true },
] as const;

/** Parses an NDJSON file into one value per non-empty line. */
function readNdjson(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/** Adds the numeric fields of one mutation result into a running tally. */
function tally(totals: Map<string, number>, output: string): void {
  const result: unknown = JSON.parse(output);
  if (typeof result !== "object" || result === null) return;
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number") totals.set(key, (totals.get(key) ?? 0) + value);
  }
}

/** Loads every NDJSON file in order through `npx convex run`. Extra args (e.g. `--prod`) pass through to it. */
function main(passthrough: readonly string[]): void {
  for (const step of STEPS) {
    const path = join(OUT_DIR, step.file);
    if (!existsSync(path)) {
      if (step.required) throw new Error(`${path} is missing. Run pnpm --filter @stride/core data:import first.`);
      console.log(`skip ${step.file} (not found)`);
      continue;
    }
    const rows = readNdjson(path);
    const totals = new Map<string, number>();
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const output = execFileSync(
        "npx",
        ["convex", "run", step.fn, JSON.stringify({ [step.arg]: batch }), ...passthrough],
        { cwd: BACKEND_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
      );
      tally(totals, output);
      process.stdout.write(`\r${step.file}: ${Math.min(start + BATCH_SIZE, rows.length)}/${rows.length}`);
    }
    console.log(`\n${step.file}: ${[...totals].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

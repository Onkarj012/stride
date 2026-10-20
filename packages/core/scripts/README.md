# Food and exercise import scripts

These scripts turn public food and exercise datasets into NDJSON rows shaped for the `foods`, `food_portions` and `exercises` tables in plan 007 section 3.2. They only write local files. See [Load into Convex](#load-into-convex) for the next step.

They use Node built-ins only and need Node 22.6 or newer, which runs TypeScript directly. CI does not run them.

## Run

From the repo root:

```sh
pnpm --filter @stride/core data:import                       # FDC + exercises
pnpm --filter @stride/core data:import fdc                   # FDC only
pnpm --filter @stride/core data:import exercises             # exercises only
pnpm --filter @stride/core data:import ifct ~/Downloads/ifct2017.csv
pnpm --filter @stride/core data:import cofid ~/Downloads/cofid_proximates.csv ~/Downloads/cofid_inorganics.csv
pnpm --filter @stride/core data:import indian                # after fdc and cofid
```

Run `fdc`, then `cofid`, then `indian`. The `indian` step reads the fdc and cofid output, so it must come after them. A rerun of `indian` is safe. It rewrites the same aliases.

Downloads are cached in `packages/core/data/cache/`. Delete that folder to download again. Output goes to `packages/core/data/out/`. Both folders are gitignored.

| Output file | Table | Source |
|---|---|---|
| `fdc_foods.ndjson` | `foods` | USDA FDC SR Legacy (2018-04), Foundation (2026-04-30) and FNDDS survey (2024-10-31) |
| `fdc_food_portions.ndjson` | `food_portions` | Same three FDC zips |
| `ifct_foods.ndjson` | `foods` | Your local IFCT 2017 CSV |
| `cofid_foods.ndjson` | `foods` | Your local CoFID 2021 proximates and inorganics CSVs |
| `stride_foods.ndjson` | `foods` | Own recipe rows (`indian` step) |
| `stride_food_portions.ndjson` | `food_portions` | Household portions of the own rows and the curated dal rows (`indian` step) |
| `exercises.ndjson` | `exercises` | free-exercise-db, pinned commit |

Each line is one JSON object. The types are `FoodRecord`, `FoodPortionRecord` and `ExerciseRecord` in `src/nutrition/types.ts`. Nutrients are per 100 g and unrounded.

## Load into Convex

`packages/backend/scripts/load-foods.ts` reads the NDJSON files above and upserts them in batches of 200 through `npx convex run`. It loads `fdc_foods`, then `ifct_foods`, `cofid_foods` and `stride_foods` if present, then `fdc_food_portions`, `stride_food_portions` and `exercises`. Rows are keyed on source and source id, so a rerun only writes what changed. Portions whose food is not loaded are counted as `missingFood` and skipped.

```sh
pnpm --filter stride-backend data:load          # dev deployment from packages/backend/.env.local
pnpm --filter stride-backend data:load --prod   # production; extra flags go to `convex run`
```

It needs the schema deployed first (`pnpm dev:convex` or `npx convex deploy`). CI does not run it.

## USDA FoodData Central

`fdc.ts` downloads the official CSV zips listed at https://fdc.nal.usda.gov/download-datasets. When USDA publishes a new Foundation release, update the URL in `FDC_DATASETS`. SR Legacy is frozen at 2018-04. FNDDS (the survey foods behind the What We Eat in America dietary survey) is the 2024-10-31 release.

What gets mapped:

- FNDDS food rows use USDA's legacy nutrient numbers (e.g. 208 for energy). `nutrient.csv` maps them to FDC ids, so the same code reads all three zips.
- Energy comes from nutrient 1008, then Atwater specific (2048), then Atwater general (2047), then kJ (1062) ÷ 4.184. Foundation foods often lack 1008.
- Protein 1003, fat 1004 (else 1085), carbs 1005 (else 1050), fiber 1079, sugar 2000 (else 1063), sodium 1093 in mg.
- A food missing kcal, protein, carbs or fat is skipped and counted. Fiber, sugar and sodium may be null.
- Portions become grams per one measure (`gram_weight ÷ amount`). Foundation lists one row per lab sample, so samples of the same measure are averaged. Yield pairs and mass units (oz, lb) are skipped, since the resolver handles mass itself. FNDDS numeric modifier codes are dropped from labels, and its "Quantity not specified" rows are skipped.

FDC data is public domain (CC0).

## IFCT 2017 (personal use only)

The Indian Food Composition Tables 2017 from ICMR-NIN are licensed for personal use. Never commit the dataset or any rows derived from it. The script reads a CSV you download yourself and writes `ifct_foods.ndjson` into the gitignored output folder.

Recommended source: the `compositions` CSV from the ifct2017 project, a community transcription of the NIN book. Download https://raw.githubusercontent.com/ifct2017/compositions/main/compositions/index.csv (repo: https://github.com/ifct2017/compositions). The repo's code is AGPL-3.0; the data itself belongs to ICMR-NIN. The official book is listed at https://www.nin.res.in/ifct_book.html.

Expected columns (any extra columns are ignored):

| Column | Meaning | Unit per 100 g |
|---|---|---|
| `code` | IFCT food code, e.g. `A015` | |
| `name` | Food name, e.g. `Rice, raw, milled` | |
| `lang` | Local names, `;`-separated, each prefixed by language, e.g. `H. Chawal; Mar. Tandool` | |
| `enerc` | Energy | kJ |
| `protcnt` | Protein | g |
| `fatce` | Total fat | g |
| `choavldf` | Available carbohydrate | g |
| `fibtg` | Total dietary fiber | g |
| `fsugar` | Free sugars | g |
| `na` | Sodium | g (converted to mg) |

English (`E.`), Hindi (`H.`) and Marathi (`Mar.`) local names become aliases. Change `IFCT_ALIAS_LANGUAGES` in `ifct.ts` for others.

## UK CoFID 2021

The Composition of Foods Integrated Dataset 2021 from Public Health England (now OHID) is published under the Open Government Licence v3.0. Credit the source in any UI that shows these foods: "Contains public sector information licensed under the Open Government Licence v3.0."

Get the data from https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid. Export two sheets from the xlsx as CSV, keeping only the first header row:

- "1.3 Proximates" → `cofid_proximates.csv`
- "1.4 Inorganics" → `cofid_inorganics.csv`

Columns are read by header name. The mapper needs these proximates columns: Food Code, Food Name, Group, Protein (g), Fat (g), Carbohydrate (g), Energy (kcal) (kcal), Total sugars (g), AOAC fibre (g), NSP (g). Sodium comes from the inorganics sheet, matched by food code.

- "Tr" (trace) is 0. "N" (not determined) or an empty cell is unknown (null).
- Energy, protein, fat and carbs are required. A food missing one is skipped and counted.
- Fiber is AOAC fibre, else NSP.
- Alcoholic drinks (CoFID group codes starting with `Q`) are left out, because CoFID gives them per 100 ml.

## Exercises

`exercises.ts` reads `dist/exercises.json` from https://github.com/yuhonas/free-exercise-db (Unlicense) at a pinned commit. It keeps id, name, category, equipment, mechanic, level and muscles. It does not import or reference the images, which are derived from bodybuilding.com (plan 007 section 6).

## Indian household measures

The seed is committed code, not an import: `src/nutrition/household_measures.ts`. It holds katori, bowl, glass, ladle, cup and spoon volumes, piece weights for roti, chapati and phulka, food densities, and a source note on every value. Users override any of them through `user_measures`.

## Indian names and own rows

The `indian` step in `import-data.ts` does two things. It writes no file of its own.

- Adds aliases and two renames to public rows, and katori and bowl portions to the dal rows. The table is `CURATED` in `indian_foods.ts`. Examples: "dal" and "toor dal" on CoFID pigeon pea dahl, "roti" on the FNDDS chappatti row. The FNDDS "Dal" row is renamed to "Dal, US recipe with butter oil", and "Buttermilk" to "Buttermilk, cultured, US style", so the names stay free. The dal portions use the dal density, since the name's head word does not match the density seed.
- Builds four own rows from CoFID ingredients: sweet and unsweet chai, Indian coffee with milk, and chaas. Each row has a household portion. These are estimates and the recipe is in the code comments.

Every curated alias is checked against every row's name and aliases, using the matcher's `canonicalTokens`. A collision or a missing listed row stops the step and prints both rows. `ifct_foods.ndjson` is read for this check when it exists, but not rewritten.

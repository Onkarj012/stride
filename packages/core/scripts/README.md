# Food and exercise import scripts

These scripts turn public food and exercise datasets into NDJSON rows shaped for the `foods`, `food_portions` and `exercises` tables in plan 007 section 3.2. They only write local files. Loading the rows into Convex is slice 3's job.

They use Node built-ins only and need Node 22.6 or newer, which runs TypeScript directly. CI does not run them.

## Run

From the repo root:

```sh
pnpm --filter @stride/core data:import                       # FDC + exercises
pnpm --filter @stride/core data:import fdc                   # FDC only
pnpm --filter @stride/core data:import exercises             # exercises only
pnpm --filter @stride/core data:import ifct ~/Downloads/ifct2017.csv
```

Downloads are cached in `packages/core/data/cache/`. Delete that folder to download again. Output goes to `packages/core/data/out/`. Both folders are gitignored.

| Output file | Table | Source |
|---|---|---|
| `fdc_foods.ndjson` | `foods` | USDA FDC SR Legacy (2018-04) and Foundation (2026-04-30) |
| `fdc_food_portions.ndjson` | `food_portions` | Same two FDC zips |
| `ifct_foods.ndjson` | `foods` | Your local IFCT 2017 CSV |
| `exercises.ndjson` | `exercises` | free-exercise-db, pinned commit |

Each line is one JSON object. The types are `FoodRecord`, `FoodPortionRecord` and `ExerciseRecord` in `src/nutrition/types.ts`. Nutrients are per 100 g and unrounded.

## USDA FoodData Central

`fdc.ts` downloads the official CSV zips listed at https://fdc.nal.usda.gov/download-datasets. When USDA publishes a new Foundation release, update the URL in `FDC_DATASETS`. SR Legacy is frozen at 2018-04.

What gets mapped:

- Energy comes from nutrient 1008, then Atwater specific (2048), then Atwater general (2047), then kJ (1062) ÷ 4.184. Foundation foods often lack 1008.
- Protein 1003, fat 1004 (else 1085), carbs 1005 (else 1050), fiber 1079, sugar 2000 (else 1063), sodium 1093 in mg.
- A food missing kcal, protein, carbs or fat is skipped and counted. Fiber, sugar and sodium may be null.
- Portions become grams per one measure (`gram_weight ÷ amount`). Foundation lists one row per lab sample, so samples of the same measure are averaged. Yield pairs and mass units (oz, lb) are skipped, since the resolver handles mass itself.

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

## Exercises

`exercises.ts` reads `dist/exercises.json` from https://github.com/yuhonas/free-exercise-db (Unlicense) at a pinned commit. It keeps id, name, category, equipment, mechanic, level and muscles. It does not import or reference the images, which are derived from bodybuilding.com (plan 007 section 6).

## Indian household measures

The seed is committed code, not an import: `src/nutrition/household_measures.ts`. It holds katori, bowl, glass, ladle, cup and spoon volumes, piece weights for roti, chapati and phulka, food densities, and a source note on every value. Users override any of them through `user_measures`.

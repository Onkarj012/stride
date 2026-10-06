# Stack Research — Stride Mobile & Data Sources

Date: 2026-09-18. All versions checked live (npm registry, vendor docs, APIs) on this date. Read-only research; no repo code touched.

## 1. Expo SDK

- Current stable: **Expo SDK 57** — `expo` npm `latest` = **57.0.24** (checked 2026-09-18 via `npm view expo dist-tags`; https://registry.npmjs.org/expo). SDK 57 released 2026-06-30 with React Native 0.86 and React 19.2 (https://expo.dev/changelog/sdk-57).
- `next` tag is `58.0.0-preview.3`; SDK 58 canaries exist (`58.0.0-canary-20260909-*`) — not stable (https://registry.npmjs.org/expo).
- SDK release cadence changed: SDK 57 was a small RN-bump release; SDKs still live ~1 year, so SDK 54 gets critical fixes only until ~Sep/Oct 2026 (https://expo.dev/changelog/sdk-57).
- **Reanimated 4: yes.** SDK 57 bundles `react-native-reanimated` 4.5, `react-native-worklets` 0.10, `react-native-gesture-handler` 2.32 (https://expo.dev/changelog/sdk-57). Reanimated latest on npm is 4.6.0; 4.5.x officially supports RN 0.83–0.86, 4.6.x supports RN 0.83–0.87 (https://registry.npmjs.org/react-native-reanimated, https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility). Reanimated 4 requires the New Architecture (default on SDK 57) (https://github.com/software-mansion/react-native-reanimated).
- **Moti: risky.** Latest stable `moti` = 0.30.0, published 2025-01-29 (https://registry.npmjs.org/moti); docs still target Reanimated 3 (https://moti.fyi/installation); GitHub issue #391 "Expo 54 and Reanimated 4.1.0 support" is still **open** (updated 2026-06-19) (https://github.com/nandorojo/moti/issues/391); repo last pushed 2025-03-11 (https://api.github.com/repos/nandorojo/moti). No official Reanimated 4 support.
- **Skia: yes.** `@shopify/react-native-skia` latest = 2.12.0 (2026-09-16) (https://registry.npmjs.org/@shopify/react-native-skia). Docs: requires RN ≥0.79, React ≥19, Android API 21+ (26+ for video); Reanimated interop needs reanimated ≥4.0.0 + worklets ≥0.7.0; Android builds need the NDK installed (https://shopify.github.io/react-native-skia/docs/getting-started/installation).
- **expo-router:** latest = 57.0.22; since SDK 55 all Expo packages share the SDK major version (https://registry.npmjs.org/expo-router, https://expo.dev/changelog/sdk-55). SDK 56's router release dropped React Navigation internals and added new features (https://expo.dev/sdk/56). SDK 56 also shipped an official **Convex integration** template (https://expo.dev/sdk/56).
- Android gotchas (macOS → physical phone, zero mobile experience):
  - **Expo Go is not a reliable path right now**: the store build lags the current SDK (SDK 57 Expo Go is pending App Store/Play Store approval; on Android you install it via Expo CLI, iOS via `eas go`) (https://expo.dev/changelog/sdk-57, https://expo.dev/go). Since 2026-09-03 an Expo account **login is required** to run projects in Expo Go (https://expo.dev/changelog). Expo itself says Expo Go is "not recommended as a development environment for production apps" (https://expo.fyi/expo-go-usage).
  - **Use a development build instead.** Local: install JDK + Android Studio toolchain, then `npx expo run:android --device` (runs prebuild, compiles, installs over USB, starts Metro); cloud: `eas build --platform android --profile development` (https://docs.expo.dev/develop/development-builds/expo-go-to-dev-build, https://docs.expo.dev/get-started/set-up-your-environment).
  - **ADB over USB:** plug in phone, enable USB debugging, accept the RSA prompt; `expo run:android --device` then handles install+attach; rebuild only needed when native deps change — otherwise just `npx expo start` (https://docs.expo.dev/develop/development-builds/expo-go-to-dev-build).
  - **EAS internal distribution (Android):** must produce an **APK** (AAB is Play-Store-only); `distribution: "internal"` or `android.buildType: "apk"` profile; install by URL/email or `adb install app.apk`; `eas build:run -p android --latest` installs straight to a connected device/emulator; build URLs are public-by-default UUID links unless you require sign-in (https://docs.expo.dev/build/internal-distribution, https://docs.expo.dev/build-reference/apk).
  - **Stay on latest SDK 57 patch:** SDK 56/early-57 had a Hermes V1 memory regression that hit apps importing reanimated/worklets (fixed in expo@57.0.9) and a dev startup-time regression (fixed in 57.0.17) (https://expo.dev/changelog/sdk-57).
  - `expo prebuild` now **cleans and regenerates** android/ios dirs by default (pass `--no-clean` to keep edits) — don't hand-edit native dirs (https://expo.dev/changelog/sdk-57).
  - Skia adds ~4 MB to the Android binary and needs the NDK/CMake; a missing CMake version errors out until installed via SDK Manager (https://shopify.github.io/react-native-skia/docs/getting-started/installation).
  - RN 0.86 includes Android edge-to-edge fixes — relevant since Android 15+ forces edge-to-edge (https://reactnative.dev/blog/2026-06-11/react-native-0.86, https://expo.dev/changelog/sdk-57).

Recommendation: Expo SDK 57 (expo@57.0.24+) with a dev client (`eas build --profile development` or `npx expo run:android --device`), Reanimated 4.5+/Skia 2.12, and no Moti (use Reanimated 4 APIs directly); share builds via EAS internal-distribution APKs.

## 2. NativeWind & design-token sharing

- NativeWind stable = **4.2.7** (npm `latest`, published ~Jul 2026); it targets **Tailwind CSS v3**, not v4 (https://registry.npmjs.org/nativewind, https://www.npmjs.com/package/nativewind).
- NativeWind **v5 = 5.0.0-rc.0** (npm `preview`/`rc` tags) targets **Tailwind CSS v4.1+**; it is a thin wrapper over `react-native-css` (3.0.7) and requires RN 0.81+ (https://registry.npmjs.org/nativewind, https://www.nativewind.dev/v5/guides/migrate-from-v4, https://github.com/nativewind/nativewind/blob/main/DEVELOPMENT.md). Docs banner: "pre-release … not intended for production use" (https://www.nativewind.dev/v5/core-concepts/tailwindcss).
- Tailwind v4 itself is at 4.3.3 (npm `latest`) with CSS-first `@theme` config (https://registry.npmjs.org/tailwindcss, https://tailwindcss.com/docs/upgrade-guide). Tailwind Labs joined Shopify on 2026-09-09 (continuity signal) (https://tailwindcss.com/blog/tailwind-is-joining-shopify).
- Alternatives for sharing tokens with an Expo app:
  - **Uniwind 1.12.0** (MIT) — Tailwind-v4-only bindings for RN from the Unistyles creators; same `global.css` + `@theme` works on web (Vite) and native (Metro); supports Expo; free core, paid Pro C++ engine; 1,712 stars, pushed 2026-09-04 (https://registry.npmjs.org/uniwind, https://uniwind.dev/, https://docs.uniwind.dev/quickstart, https://github.com/uni-stack/uniwind).
  - **Unistyles 3.3.0** (stable) — StyleSheet superset with themes/breakpoints/variants; requires RN 0.78+, New Architecture, `react-native-nitro-modules`; **does not run in Expo Go** (dev client only) (https://registry.npmjs.org/react-native-unistyles, https://www.unistyl.es/v3/start/getting-started). Its v3 web parser can coexist with Tailwind classes on web (https://www.unistyl.es/v3/start/new-features).
  - **Tamagui 2.7.7** — compiler-based UI kit + tokens; large surface area, opinionated (https://registry.npmjs.org/tamagui, https://tamagui.dev).
  - **Plain `tokens.ts`** — single TS module of colors/spacing/radii imported by both apps; on web emit Tailwind v4 `@theme` CSS variables from it (or define once in CSS and mirror in TS); zero native deps, works in Expo Go, no build magic (https://tailwindcss.com/docs/upgrade-guide — v4 theming is CSS-first via `@theme`).

Recommendation: For a solo dev, keep one `tokens.ts` as the source of truth → generate/inline Tailwind v4 `@theme` variables for web and consume the same object via `StyleSheet` (or Unistyles if you want variants/dark-mode machinery); adopt Uniwind only if you truly want `className` DX on native — and avoid pinning the app to NativeWind v5 while it is still an RC.

## 3. OpenRouter models & pricing

All IDs/pricing below pulled live from `https://openrouter.ai/api/v1/models` on 2026-09-18 (prices = USD per 1M tokens, prompt/completion):

- **GPT-5.6 family** (added 2026-07-09, 1.05M ctx each):
  - `openai/gpt-5.6-luna` — **$0.20 / $1.20** — fast, cost-efficient tier for high-volume, latency-sensitive tasks (https://openrouter.ai/openai/gpt-5.6-luna).
  - `openai/gpt-5.6-terra` — **$2.00 / $12.00** — balanced middle tier (https://openrouter.ai/openai/gpt-5.6-terra).
  - `openai/gpt-5.6-sol` — **$2.00 / $10.00** — flagship for complex reasoning/coding/agentic work (https://openrouter.ai/openai/gpt-5.6-sol).
  - Each has a `-pro` variant at the same listed pricing, and a `:batch` endpoint at 50% off (luna:batch $0.10/$0.60; sol:batch $1.00/$5.00) (https://openrouter.ai/api/v1/models).
- **Claude Sonnet 5**: `anthropic/claude-sonnet-5` — **$2.00 / $10.00**, 1M ctx, added 2026-06-30; `:batch` at $1.00/$5.00 (https://openrouter.ai/anthropic/claude-sonnet-5, https://openrouter.ai/api/v1/models).
- **Latest Gemini Flash**: `google/gemini-3.8-flash` — **$0.75 / $3.75**, 1M ctx, added 2026-09-02 (text+image+file+audio+video input); `:batch` at $0.375/$1.875 (https://openrouter.ai/google/gemini-3.8-flash, https://openrouter.ai/api/v1/models).
- **Structured outputs / JSON schema + tool calling**: all of the above list `structured_outputs`, `response_format`, `tools`, and `tool_choice` in `supported_parameters` in the live models API (verified for gpt-5.6-luna/terra/sol, claude-sonnet-5, gemini-3.8-flash) (https://openrouter.ai/api/v1/models). Feature docs: Structured Outputs (https://openrouter.ai/docs/guides/features/structured-outputs), Tool Calling (https://openrouter.ai/docs/guides/features/tool-calling) — both verified 200 on 2026-09-18.

Recommendation: use `openai/gpt-5.6-luna` for high-volume structured parsing (food/photo/text → JSON schema, 10× cheaper than Sonnet 5 at similar capability tier) and `anthropic/claude-sonnet-5` for coaching chat; keep `google/gemini-3.8-flash` as multimodal fallback (audio/video input).

## 4. USDA FoodData Central bulk downloads

- Download page (all formats JSON + CSV, zipped): https://fdc.nal.usda.gov/download-datasets. April 2026 releases:
  - **Foundation Foods** (04/2026): CSV 3.7 MB zipped / 32 MB unzipped; JSON 459 KB / 6.5 MB (https://fdc.nal.usda.gov/download-datasets).
  - **SR Legacy** (04/2018, final release, never updated): CSV 6.7 MB / 54 MB; JSON 12.3 MB / 205 MB (https://fdc.nal.usda.gov/download-datasets).
  - **Branded** (04/2026): CSV 428 MB zipped / 2.9 GB unzipped; JSON 195 MB / 3.1 GB; **Full Download (all types)** CSV 460 MB / 3.1 GB (https://fdc.nal.usda.gov/download-datasets).
  - FNDDS (10/2024, survey foods): CSV 200 MB / 1.6 GB (https://fdc.nal.usda.gov/download-datasets).
- **License: public domain, CC0 1.0** — "USDA FoodData Central data are in the public domain and they are not copyrighted" (https://fdc.nal.usda.gov/ homepage, Licensing section).
- **Household-measure gram weights ARE in the CSV bulk files** — verified by downloading the archives on 2026-09-18:
  - SR Legacy CSV zip contains `food_portion.csv` with **14,449 rows** (official count file inside the zip), columns: `id, fdc_id, seq_num, amount, measure_unit_id, portion_description, modifier, gram_weight, data_points, footnote, min_year_acquired` (https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip).
  - Foundation CSV zip (04/2026) contains `food_portion.csv` with **10,951 rows** (https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip).
  - USDA explicitly fixed/restored `foodPortions.amount` in the SR Legacy archive (https://fdc.nal.usda.gov/log).
- Verified row counts (from official `all_downloaded_table_record_counts.csv` inside the zips): SR Legacy = **7,793 foods**, **644,125 food_nutrient rows**, 14,449 portions; Foundation (04/2026) = 469 `foundation_food` records in `food.csv` (395 rows in `foundation_food.csv`) plus ~87k sample/sub-sample records, 170,469 `food_nutrient` rows (https://fdc.nal.usda.gov/download-datasets).
- Foundation/SR Legacy update twice yearly (April/October); Branded updates monthly; SR Legacy is frozen (https://fdc.nal.usda.gov/data-documentation).

Recommendation: Import SR Legacy's 7,793 foods × ~6 curated nutrients (energy, protein, fat, carbs, fiber, sodium ≈ 47k rows) plus all 14,449 `food_portion` rows for household measures, and layer Foundation's ~400–470 foods on top — total under ~65k rows, CC0-clean; skip the 2.9 GB Branded bulk and use Open Food Facts for packaged/barcode items.

## 5. Indian Food Composition Tables (IFCT 2017)

- The official IFCT 2017 book (Longvah, Ananthan, Bhaskarachary, Venkaiah; NIN/ICMR Hyderabad) covers **528 key foods, 151 nutrients**; full PDF is free to read at https://www.nin.res.in/ebooks/IFCT2017_16122024.pdf — but it is "Copyright © 2017 National Institute of Nutrition" with no open-data license stated (same PDF, front matter).
- **Machine-readable mirror exists**: `nodef/ifct2017` (GitHub) — CSV/JSON for **542 foods** (compositions, columns, regions, pictures, yield factors, recommended intakes), queryable via JSR/npm; also archived on Zenodo (https://github.com/ifct2017/ifct2017, https://github.com/nodef/ifct2017/blob/main/compositions/index.csv, https://zenodo.org/records/7088653). **License: AGPL-3.0** (repo metadata, https://api.github.com/repos/ifct2017/ifct2017) — the repo's *code* is AGPL; the underlying *data* remains NIN-copyrighted, so redistribution rights are legally gray.
- **INDB (Indian Nutrient Databank)**: academic database built from IFCT 2017 + IFCT 2004 + UK/US tables, including ~commonly consumed recipes; analysis code + files public at https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- (46 stars, pushed 2025-04; **no LICENSE file** = default copyright) (https://api.github.com/repos/lindsayjaacks/Indian-Nutrient-Databank-INDB-, paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795).
- Smaller mirror: `nithyamani/IndianFoodComposition` — IFCT in Excel + JSON "for public use", no license declared (https://github.com/nithyamani/IndianFoodComposition).
- Other open options: Open Food Facts has an India country subset (ODbL) but coverage of Indian staples/composite dishes is thin compared to IFCT (https://world.openfoodfacts.org/data, https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795 notes IFCT lacks composite dishes like curries/chapatis).

Recommendation: Use `nodef/ifct2017` CSVs as the practical source for Indian raw foods (542 items, clean schema) and cross-check against the official NIN PDF; treat it as reference data for a personal-use app (avoid republishing the dataset verbatim), since NIN never granted an open license and the mirror is AGPL.

## 6. Open Food Facts

- **Rate limits** (official API docs): **15 req/min/IP** for product reads (`GET /api/v*/product`), **10 req/min/IP** for search endpoints; no limit on writes; global limits return HTTP 503; a custom **User-Agent is mandatory**; limits apply per-user when requests originate from user devices (mobile apps); if you need more than a few hundred products, download bulk data instead; heavy apps are told to self-host or use daily exports (https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md, https://openfoodfacts.github.io/openfoodfacts-server/api/).
- **Per-barcode endpoint**: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json` (v2 is current; docs index above; v0 pattern also documented at https://www.openpublicapis.com/api/open-food-facts).
- **Bulk exports** (regenerated nightly, https://world.openfoodfacts.org/data): MongoDB dump (`openfoodfacts-mongodbdump.gz`), full **JSONL** (`openfoodfacts-products.jsonl.gz`, DuckDB-friendly), **CSV ~0.9 GB compressed / ~9 GB uncompressed** (`en.openfoodfacts.org.products.csv.gz`), and **delta exports for the previous 14 days** (`/data/delta/index.txt`) for incremental sync.
- **License**: database = **ODbL**, individual contents = Database Contents License, images = CC-BY-SA (https://world.openfoodfacts.org/data). ODbL obligations for an app: **attribution** — "(c) Open Food Facts contributors" linking to https://world.openfoodfacts.org/terms-of-use on every screen showing OFF data, plus the app-store listing and legal page — and **share-alike**: any derived/mixed *database* you redistribute must be ODbL (safest compliance: contribute corrections back via the API); your app code itself is not covered by ODbL, only redistributed databases (https://wiki.openfoodfacts.org/ODBL_License, https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api).
- Account + API usage form recommended for apps to avoid bans (https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md).

Recommendation: Query per-barcode `api/v2` on demand (with a proper User-Agent and local cache — you'll stay far under 15 req/min for a personal app), show the required attribution on the food-detail screen + legal page, and only pull the JSONL/delta exports if you later add offline search.

## 7. Exercise databases

- **`yuhonas/free-exercise-db`**: license **Unlicense** (public domain); 1,895 stars; actively pushed (2026-08-30) (https://api.github.com/repos/yuhonas/free-exercise-db, https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md). Verified `dist/exercises.json` (downloaded 2026-09-18): **876 exercises**; fields `name, force, level, mechanic, equipment, primaryMuscles, secondaryMuscles, instructions, category, images, id`; **17 muscle values** (abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps); 7 categories (cardio, olympic weightlifting, plyometrics, powerlifting, strength, stretching, strongman); 13 equipment values; force = push/pull/static; level = beginner/intermediate/expert; **873/876 exercises have images (1,746 JPGs, 2 poses each)** (https://github.com/yuhonas/free-exercise-db, https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json).
- Caveat: the dataset is a restructure of `wrkout/exercises.json`, which was scraped from bodybuilding.com — the **images' provenance is legally gray** despite the Unlicense (https://github.com/yuhonas/free-exercise-db README credits it; https://github.com/wrkout/exercises.json).
- Alternatives:
  - **wger**: full FLOSS tracker; code AGPL-3.0; **exercise/ingredient data under Creative Commons (per-entry licenses, attribution required)**; docs CC-BY-SA-4.0; ~845+ exercises with muscles/equipment/images via free REST API (`https://wger.de/api/v2/exercise/`, `/muscle/`, `/equipment/`, `/exerciseimage/`); 6.9k stars, active (pushed 2026-09-13) (https://github.com/wger-project/wger, https://www.openpublicapis.com/api/wger).
  - **`exercemus/exercises`**: MIT-curated merge of wger + exercises.json with per-exercise license metadata preserved (49 stars) (https://github.com/exercemus/exercises).

Recommendation: Use free-exercise-db as the seed taxonomy (876 exercises, 17 muscles, Unlicense JSON that maps 1:1 onto a Convex `exercises` table), but display/replace the bodybuilding.com-derived images with your own or wger's CC-licensed (attributed) images to stay legally clean.

## 8. Adaptive TDEE estimation

- **Hacker's Diet (John Walker)** — the canonical DIY algorithm:
  - Weight trend = exponentially smoothed moving average: `T[d] = T[d-1] + P·(W[d] − T[d-1])` with smoothing constant S=0.9, i.e. **P = 0.1 (10% smoothing)** per daily weigh-in (https://www.fourmilab.ch/hackdiet/www/subsubsection1_4_1_0_8_3.html).
  - Energy balance from trend: least-squares slope `m` (lb/day) of the trend over a window (~1 month); daily calorie deficit/surplus = **3500·m** (3500 kcal ≈ 1 lb) (https://www.fourmilab.ch/hackdiet/www/subsubsection1_4_1_0_8_4.html). Control-loop framing (adjust intake in rungs, watch the trend not daily noise) (https://en.wikipedia.org/wiki/The_Hacker's_Diet).
- **MacroFactor** (commercial reference implementation):
  - Weight trend is a recency-weighted moving average with **linear interpolation across missing weigh-ins**; expenditure and weekly calorie targets are driven by the trend, not raw scale weight; daily weigh-ins recommended, ≥3×/week acceptable (https://help.macrofactorapp.com/dashboard/weight_trend).
  - **Expenditure estimates start updating on day 3**; accuracy keeps improving — expect good estimates after **2–4 weeks (14–30 days) of consistent logging**; missing/estimated days are tolerated (intake estimates within ±30% are fine) (https://macrofactor.com/algorithm-accuracy, https://macrofactor.com/welcome/).
  - V3 algorithm: **~35% smaller day-to-day expenditure updates** than V2 while detecting real trend reversals **1–5 days sooner**; tolerant of missing data; uses **3,500 kcal/lb** energy density; measured median error ≈ **110 kcal/day (~4.4% of TDEE)** over a user's first 100 days vs formula-based estimates drifting to ~3.1 lb cumulative error (https://macrofactor.com/expenditure-v3/, https://macrofactor.com/algorithm-accuracy).
- **Literature**:
  - Hall et al., *Quantification of the effect of energy imbalance on bodyweight*, Lancet 2011 — dynamic metabolic model: weight responds slowly (half-time ~1 year); rule of thumb: a permanent **±10 kcal/day intake change → ~1 lb eventual weight change**; the static 3500 kcal/lb rule **overestimates long-term** weight change because expenditure adapts (https://pubmed.ncbi.nlm.nih.gov/21872751, https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593, https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(11)60812-X/abstract).
  - Hall & Chow, *Why is the 3500 kcal-per-pound weight-loss rule wrong?*, Int J Obes 2013 (https://www.niddk.nih.gov/about-niddk/staff-directory/biography/hall-kevin/publications).
  - Open-source estimator worth copying ideas from: `tdee-adaptive` (Go) — residualizes weight by trapezoidal-integrated logged calories (**7700 kcal/kg**), fits piecewise-linear trends, BIC-weighted model averaging (https://pkg.go.dev/github.com/francescoalemanno/tdee-adaptive).
- **Concrete recommended formula** (synthesis of the above; safe for a personal app):
  1. On each weigh-in (interpolate linearly across gaps): `T ← T + 0.1·(W − T)` (α=0.1, Hacker's Diet).
  2. Over a rolling **14–28 day window**, fit least-squares slope `m` (kg/day) to `T`.
  3. `TDEE_est = Ī − m·7700`, where `Ī` = mean logged intake over the same window (7700 kcal/kg ≈ 3500 kcal/lb).
  4. Guardrails: require ≥14 days, ≥10 weigh-ins, intake logged on ≥70% of days before first update (MacroFactor's day-3 start / 2–4-week convergence); clamp `TDEE_est` to [0.75, 1.3]× the initial Mifflin-St Jeor estimate; damp updates (change ≤ ~5–10%/day, per MacroFactor V3's smoothing); recompute the estimate daily but only adjust user-facing calorie targets weekly.
  5. Expect ±100–150 kcal/day accuracy; note short-window 7700 kcal/kg slightly overstates deficit during rapid loss (water/glycogen + adaptation, per Hall 2011) — fine for tracking direction, not for clinical prediction.

Recommendation: Implement the 5-step EMA(α=0.1) + 14–28d least-squares + 7700 kcal/kg balance equation with MacroFactor-style guardrails; it reproduces the proven Hacker's Diet/MacroFactor behavior in ~30 lines.

## 9. Convex

- Current version: **convex 1.46.0** (npm `latest`, published 2026-09-16) (https://registry.npmjs.org/convex; changelog: https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md).
- 2026-relevant platform features (from the official changelog):
  - **Components** are fully productized: sandboxed mini-backends with their own schemas/functions (https://docs.convex.dev/components/overview); 26 official components + 145 in the directory (https://www.convex.dev/components/components.md, https://www.convex.dev/components/get-convex.md). 2025-26 additions: per-component HTTP routes with URL prefixes (1.35), typesafe component `env` declarations (1.39), omittable `env` when all vars optional (1.43), `ComponentApi` codegen by default (1.35) (https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md).
  - **Commit timestamps** (1.43): `ctx.db.vars.commitTs` + `v.commitTs()` — strictly-ordered Int64 commit time, ideal for ledger ordering (https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md, https://docs.convex.dev/database/advanced/commit-timestamp).
  - **`useStaleSnapshot` for `runQuery`** (1.42) — lets internal queries avoid OCC conflicts; used by official components like Workpool (https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md).
  - Validator ergonomics: `.optional()` on all validators (1.46); `schema.doc()` whole-document validators (1.44) (https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md).
  - DX/ops: local deployments upgrade in place (1.45), `npx convex deployment usage` (1.43), `npx convex project create` (1.42), `--names-only` env listing for AI agents (1.42), stateless MCP server (1.45), `getServiceToken` ahead of the **Convex AI gateway** (1.45) (https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md).
  - Company momentum: **$57M Series B** announced 2026-08-04; ~10k paying teams reported April 2026 (https://news.convex.dev/, https://ai.engineer/orgs/convex).
- Components relevant to a fitness ledger with revisions:
  - **`@convex-dev/aggregate` 0.3.1** — denormalized, scalable sums/counts (daily/weekly kcal + macro totals without rescanning entries) (https://registry.npmjs.org/@convex-dev/aggregate, https://github.com/get-convex/aggregate, https://www.convex.dev/components/get-convex.md).
  - **`@convex-dev/migrations` 0.3.6** — backfill/transform documents safely as the ledger schema evolves (https://registry.npmjs.org/@convex-dev/migrations).
  - **Vector search** — built-in `vectorSearch` + embedding schema fields, GA and documented (https://docs.convex.dev/vector-search); useful for semantic food search over your food corpus.
  - **`@convex-dev/expo-push-notifications` 0.3.1** — official Expo push component (https://www.convex.dev/components/get-convex.md).
  - Expo SDK 56 ships an official **Convex integration** in its templates (https://expo.dev/sdk/56).
- For "revisions": Convex has no built-in document versioning — the idiomatic pattern is append-only ledger rows (never mutate a logged entry; corrections are new rows referencing the old `_id`) with `commitTs` for ordering, aggregate component for totals, and the migrations component for schema changes.

Recommendation: Stay on convex@1.46.x, model the ledger as append-only revision rows ordered by `commitTs`, use @convex-dev/aggregate for rolling daily/weekly totals and @convex-dev/migrations for backfills; vector search is available if you later want semantic food lookup.

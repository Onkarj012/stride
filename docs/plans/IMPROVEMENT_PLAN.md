# Stride — Drastic Improvement Plan

**Date:** 2026-06-24
**Scope:** Full-system scan + external research. Focus areas: **accessibility**, **AI agent accuracy**, **ease of logging & tracking (diet + workout)**, and **chat**.
**Method:** 6 parallel code-audit agents (a11y, AI accuracy, diet logging, workout logging, chat, engines/data) + 5 online-research agents (nutrition-AI accuracy, accessibility standards, chat/competitor UX, workout/wearables, LLM-agent engineering).

---

## 0. Executive Summary

Stride is further along than a typical tracker: it has a real deterministic nutrition engine grounded in USDA/Open Food Facts, a MET-based calorie engine, cross-session AI memory, multi-coach personas, gamification, and daily/weekly cron insights. The bones are strong.

But the audit found a consistent pattern: **good capabilities built then left unwired, and accuracy/UX shortcuts that quietly undermine trust.** The highest-leverage work is mostly *connecting and hardening what already exists*, not greenfield.

The five biggest wins, ranked:

1. **Stop the LLM from inventing macros.** The cheap parser model (`gpt-4o-mini`) hallucinates calories whenever the DB doesn't match, with no structured-output enforcement and a silent fallback to fake numbers (400/20/35/15). This is the #1 accuracy risk. Fix = JSON-schema enforcement + live USDA/OFF grounding + honest confidence.
2. **Mount the dead fast-path logging UI.** `QuickLogBar` and `FoodSearch` are fully built but rendered nowhere; every user is funneled through the slow LLM chat path even for repeat meals. Wiring, not new code.
3. **Real token streaming + unify the two chat engines.** Responses aren't streamed — a fake typewriter reveals an already-complete reply *after* the full wait. Two parallel chat flows (home vs. Coach page) behave inconsistently (one auto-logs silently, one confirms).
4. **Fix accessibility fundamentals.** Focus rings stripped app-wide, toasts/chat invisible to screen readers, no focus trap in modals, reduced-motion ignored by Framer, failing text contrast.
5. **Make workout tracking actually track.** The main Workouts page reads the wrong schema field and shows garbage sets; there's no way to edit sets/reps/weight; no progression/volume charts; calorie burn ignores load.

Plus a product-defining gap: **"calibration" is not adaptive TDEE.** There is no weight-log table; the system never recalibrates targets from intake + weight trend (the MacroFactor moat). It only nudges a workout-burn multiplier.

---

## 1. AI Agent Accuracy

### Current architecture
- `ai/llm.ts` → `callAI` does a single blocking `fetch` to OpenRouter. No `response_format`, no `temperature`, retries on HTTP/network only.
- `gpt-4o-mini` parses **and** estimates macros; `claude-sonnet-4.6` for chat; `claude-haiku-4.5` fallback.
- Deterministic `nutrition_engine.ts` grounds macros against `food_cache` when it can; otherwise the LLM's guessed numbers are used.

### Critical findings (code)
| ID | File:line | Problem | Fix |
|----|-----------|---------|-----|
| C1 | `ai/llm.ts:53-58` | No JSON-schema / `response_format` on any call. Every parse depends on the model voluntarily emitting clean JSON, then a brace-matcher. | Add `response_format: { type: "json_schema", strict: true }` per parse; set OpenRouter `provider.require_parameters: true`. |
| C2 | `ai/llm.ts:110-146`, `parse.ts:119-152` | On parse failure → silent hardcoded fallback **400 kcal / 20P / 35C / 15F**, shown as a real `confidence: 0.3, source: "ai"` estimate. No retry on unparseable-but-200 responses. | Replace silent fallback with Zod validate → error-feedback repair loop (≤2 retries) → escalate to stronger model → surface "couldn't parse" instead of fabricating. |
| C3 | `ai/llm.ts:11`, `parse.ts:93-116 #8` | `gpt-4o-mini` is explicitly asked to *estimate* macros as fallback — a weak nutritional estimator confidently inventing numbers for novel/ethnic foods. Seed DB is tiny (~12 foods). | Route unresolved ingredients through live `foods.searchFoods` (USDA/OFF) before any LLM guess; use a stronger model for the estimate role; label LLM-only estimates clearly. |

### High findings (code)
- **H1 — Naive food matching** (`nutrition_engine.ts:90-129`): substring/word-overlap scoring; `"oil"` matches olive/coconut/oil-free indiscriminately; no cooked-vs-dry disambiguation. → Require token coverage, penalize length mismatch, honor parsed cooking method.
- **H2 — Live DBs bypassed on the hot path** (`parse.ts:290`): engine only consults `searchFoodsInCache`; the live USDA/OFF `searchFoods` (`foods.ts:155`) is never called during parse, so new foods → cache miss → LLM hallucination.
- **H3 — Coach blind to confidence** (`ai.ts:436-473`): chat context has meal totals but not per-meal `confidence`/`nutritionSource`, so the coach treats a 0.3 guess like a 0.95 DB value.
- **H4 — Fake uncertainty band** (`ai.ts:1705-1706`): displayed range is always ±12% regardless of real engine confidence.
- **H5 — Workout burn silently zeroes** (`parse.ts:206-244`): no body weight or unmatched exercise → 0 kcal shown.

### Medium findings (code)
- **M1** keyword-substring coach routing (`coaches.ts:137-173`) — misroutes; `"ab"` matches "about". → LLM/embedding classifier or word-boundary.
- **M2** no few-shot examples in the meal/workout parse prompts (homepage path has them and parses better).
- **M3** no macro-reconciliation self-check (kcal vs 4/4/9).
- **M4** sleep/water/mood/steps each burn a separate LLM call for regex-trivial extraction (steps regex `replace(/[^0-9]/g,"")` concatenates "5k...8000" → 58000).
- **M5** `cookingMethodAdjustment` adds phantom 45 kcal oil to every "unknown"-method meal (`nutrition_engine.ts:170`).
- **M7** vision label parse bypasses `callAI` (no retry), weak model, misreads → silent 0.

### External research → recommendations
- **Principle:** *LLM = parser/router, DB = source of truth.* The model maps NL → `{food, qty, unit, brand, confidence}`; macros are computed in code from retrieved per-100g values. The model rarely emits a raw calorie number.
- **Grounding stack:** USDA FoodData Central (CC0, ~380k foods) as the spine; **self-host the Open Food Facts bulk dump** for barcodes (live API is 15 req/min — unusable at scale; self-hosting also sidesteps ODbL share-alike); add Nutritionix later for restaurant coverage.
- **NutriBench (arXiv 2407.12843):** GPT-4o + chain-of-thought hit 66.8% / 8.6g MAE, matching nutritionists ~20× faster. CoT is the cheapest accuracy lever and prevents multi-item meals from degrading — but do CoT in a *separate* non-strict call, not bolted onto strict JSON (CoT can raise hallucination on the structured step).
- **Portion is the accuracy ceiling**, not food ID: 15–25% error from 2D photos, 5–12% with depth/LiDAR. Return estimates with a confidence band + quick S/M/L adjustment; capture depth on native iOS later.
- **Robustness:** `temperature: 0` on all extraction calls; Zod + provider structured outputs; retry on *invalid output* not just HTTP; Anthropic prompt-cache the static coach system prompt (~90% cost / 85% latency on cache hits).
- **Evals:** stand up a **promptfoo golden-set** (25–50 food-parse cases, grow from prod failures) in CI — for a nutrition app, parse accuracy *is* the product, and there's no regression net today.

### Top accuracy wins
1. JSON-schema enforcement + `temperature:0` + Zod repair loop (kills the silent-fake-macro class). `ai/llm.ts`
2. Ground unresolved ingredients via live USDA/OFF before any LLM guess. `parse.ts`, `foods.ts`
3. Fix `matchBestFood` (token coverage + cooked/raw). `nutrition_engine.ts`
4. Surface real confidence (drive band + source label from engine confidence; inject into coach context). `ai.ts`
5. promptfoo golden-set eval harness in CI.

---

## 2. Ease of Logging — Diet

### How it works today
5 nominal entry points, only 3 live: **chat (text)**, **voice** (Groq Whisper → composer), **photo** (vision describe → chat). **Barcode** is live but degraded (manual digit entry, no camera). **Recipe log** works. The whole **search-food-set-grams** flow (`FoodSearch`) and **one-tap recent chips** (`QuickLogBar`) are fully built but **mounted nowhere**.

Even a repeat meal that hits `food_memory` still requires typing the description, waiting, and tapping Confirm — `autoApplied: false` is hardcoded (`ai.ts:1579`). Memory saves an LLM call, not a single tap.

### Findings
- **P0 — Dead fast-path UI.** `QuickLogBar.tsx:19` and `FoodSearch.tsx:32` are rendered nowhere (grep-confirmed). The two features that would most cut friction ship in the bundle invisibly. → Mount `QuickLogBar` on home; surface `FoodSearch` behind "+"/Nutrition.
- **P0 — No true one-tap repeat** despite `food_memory`. → Surface top memories as one-tap chips and/or silent-log+undo for high-`timesLogged` entries.
- **P1 — Barcode "scanner" is manual typing** (`BarcodeModal.tsx:112`), mislabeled "Scan barcode". Backend OFF lookup is real. → Add `BarcodeDetector` + camera, ZXing WASM fallback (no Safari/desktop support for native), `facingMode:"environment"`, custom User-Agent; relabel until then.
- **P1 — No undo on log.** `addMeal` returns an id; wire "Undo" → `deleteMeal` into the success toast.
- **P2 — Grams-only entry.** `unit_converter.ts` (cups, tbsp, "1 roti", "1 bowl") is quarantined behind the chat path; structured UIs force grams. → Expose `servingSize`/`servingUnit` (already fetched, `foods.ts:49`) + household units.
- **Bug — `getRecentFoods` ignores `userId`** (`foods.ts:140`): ranks by global `searchCount`, returns app-wide popular foods, not the user's recents. → Derive from the user's `meals` or `food_memory`.
- **Missing vs competitors:** store meal photo on the record; quick-add bare calories; copy-yesterday/copy-a-day; first-class "save this meal" templates; favorites.

### External research
Per-meal logging speed (2025 study): manual search **3.2 min** → barcode **45s** → photo **10s** → **voice 6s**. Friction is the enemy of adherence — *an imperfect AI draft logged in 6s beats a perfect 3-min entry.* Make every AI estimate a **one-tap-editable confirm-to-log card** (directly counters Cal AI's "undercounts and you can't fix it" weakness). Cal AI was acquired by MyFitnessPal (~$100M, Mar 2026); SnapCalorie uses LiDAR depth (~16% error). Voice + NL quick-add is Stride's natural strength.

### Top 5 logging-friction fixes
1. Mount the dead fast-path UI (`QuickLogBar`, `FoodSearch`).
2. Genuine one-tap repeat from `food_memory`.
3. Undo on the post-log toast.
4. Real barcode camera (or honest relabel).
5. Household units/servings in structured entry; fix `getRecentFoods` userId bug.

---

## 3. Ease of Logging & Tracking — Workout

### How it works today
Chat/voice-first only. The "Log a workout" button just opens the chat composer — **there is no structured manual form**. `parseWorkoutDescription` is the only path that captures structured sets/reps/weight. `relogWorkout` clones a prior workout but lives on secondary pages.

### Findings
- **CRITICAL — No way to view/edit/enter sets, reps, weight.** `EditLogModal` exposes only name/duration/calories/intensity. If the AI mis-parses a set, the user cannot fix it. → Build a structured set editor; persist `structuredSets` via `updateWorkout`.
- **CRITICAL — Main Workouts page shows garbage sets** (`WorkoutsPage.tsx:112`): reads `ex.sets`/`ex.weight` as scalars, but schema stores per-set arrays in `structuredSets`. HistoryPage does it right (`structuredSets ?? exercises`). → Mirror HistoryPage parsing.
- **CRITICAL — `updateWorkout` omits `structuredSets`/`exercises`** (`workouts.ts:91`), so any edit desyncs/freezes the breakdown.
- **HIGH — Calorie burn ignores load.** MET formula uses only duration + body weight; a 60kg and 200kg squat burn identically. `calculateVolumeLoad` (`workout_scorer.ts:88`) exists but is **never called**.
- **HIGH — No progression tracking at all.** No volume trends, no strength-progression charts, no PR detection, no per-exercise history. The single biggest competitive gap.
- **HIGH — No rest timers / live in-session logging.** Logging is purely retrospective.
- **HIGH — Fragile exercise matching** (`exercise_db.ts:181`): flat Levenshtein ≤3 — "row" within 3 edits of "rows/bow/low/raw"; unknown → silent MET 5.0. DB only ~95 exercises. → Length-normalize, tighten short-token threshold, surface unmatched.
- **MED:** duration parser `parseInt("1h 30m")` → 1 (frontend undercounts); cardio pace/incline parsed then ignored by the engine; `workout_memory` only feeds AI context, never pre-fills a one-tap "log my usual Push Day."

### External research
- **Catalog:** seed from **free-exercise-db** (Unlicense/public domain, 800+, structured + images) → instant 1000+, zero license risk. Copy assets locally.
- **Logging loop table-stakes:** pre-filled last-session numbers, auto rest timer, inline history, templates. **Highest-ROI delight:** supersets as first-class objects + automatic PR detection/celebration (Hevy's signature).
- **Calories:** use 2024 Adult Compendium METs × bodyweight as a *labeled estimate*; wearables are off 27–93% on calories. For strength, lead with **volume-load** as the real effort metric.
- **Analytics users credit for results:** volume-load (per exercise + muscle group), est-1RM (Epley/Brzycki), and an explicit **week-over-week progression delta** ("chest volume up 4%").

### Top 5 workout fixes
1. Structured set editor + persist `structuredSets`.
2. Fix the broken set display on WorkoutsPage.
3. Progression tracking: per-exercise history + volume-load & est-1RM trends (wire up the unused `calculateVolumeLoad`).
4. Harden exercise matching + expand DB to 1000+ via free-exercise-db.
5. One-tap repeat workout from `workout_memory`.

---

## 4. Chat

### Findings
- **P1 — Responses are NOT streamed.** `callAI` blocks for the full reply (`ai/llm.ts:53-81`), then `useTypewriter` fake-reveals it at ~18ms/char — worst of both worlds: full wait *then* slow reveal. → True streaming: action streams from OpenRouter with `stream:true`, incrementally patches a `chat_messages` row, client subscribes via `useQuery`; retire the typewriter for fresh messages.
- **P1 — Two parallel chat engines, inconsistent behavior.** Home (`AssistantConsole`/`homepageInput`) uses confirm cards; Coach page (`chat`) **auto-logs silently** via `⟦LOG_MEAL⟧` markers (`ai.ts:614-718`). Same message, different outcome. → Unify on one action + one confirm-before-log policy.
- **P1 — No conversation search.** No search index on chat tables (only `food_cache` has one). → Add `searchIndex` on `chat_messages.content` / `chat_sessions.title` + a sidebar search box.
- **P1 — Keyword routing + invisible specialists.** `coaches.ts:137-173` substring matching; CoachPage hardcodes `coachType:"auto"` with no picker — the 7 personas are essentially invisible. → LLM/word-boundary routing + a composer coach selector.
- **P1 — Markdown strips all images** (`Markdown.tsx:24`). → Allow safe images / render result cards.
- **P2 — No follow-up suggestion chips after a reply** (chips only show before the first message). → Coach reply carries structured follow-ups rendered as chips.
- **P2 — Generic, in-app-only nudges** (`nudges.ts:93-98`): 4 hardcoded strings, no push. → Personalize from each user's daily gaps (already computed in `getTodayBrief`) + web/native push. Key retention lever.
- **P2 — History windows inconsistent** (chat 40, homepage question path 12, display 30) — homepage coach silently loses earlier turns.
- **P2 — Errors leave dangling user messages**; no retry button. CoachPage shows "Loading…" as a fake assistant bubble.
- **Dead code risk:** `hooks/useVoice.ts:59-63` injects a fake transcript ("Logged a 20 minute run this morning") for unsupported browsers — confirm dead and remove.

**Strengths to preserve:** deep cross-session context injection (`ai.ts:417-577`), silent `MemoryAgent` fact-learning, editable `LogConfirmCard`, daily/weekly cron insights, solid Markdown tables/code.

### External research
- Streaming is baseline 2026 expectation; target **first-token < 800ms**, batch token paints into 30–60ms windows, optimistic-render the user's message, auto-scroll only when near bottom.
- **One unified coach persona** beats exposing multiple agents — research shows users dislike "which bot do I talk to?" Route to specialist *capabilities* invisibly. (Reconsider exposing the 7 personas; orchestrate behind one front door.)
- Differentiate error types → distinct recovery; preserve partial output on stop; navigable regeneration carousel; auto-generated thread titles.
- Retention: AI personalization → +12% 90-day retention; streaks **with a monthly freeze**; data-anchored proactive check-ins.

### Top 5 chat improvements
1. Real token streaming (retire the fake typewriter).
2. Unify the two chat engines + consistent confirm-before-log.
3. Conversation search + a real coach picker (or collapse to one persona with hidden specialists).
4. Smarter routing + contextual follow-up chips.
5. Personalized, push-capable proactive coaching.

---

## 5. Accessibility

### Findings (prioritized)
- **P0 — Focus rings stripped app-wide.** `focus-visible:outline-none` on `IconButton`, `ListRow`, `SuggestionChip`, `DesktopSidebar` NavItem, `NavTrigger` — keyboard users get no visible focus. → Replace with `focus-visible:ring-2 ring-lavender ring-offset-2` (OnboardingPage already does this right).
- **P0 — Toasts & chat streaming silent to screen readers.** `ToastContext.tsx:43` is a plain div; CoachPage message list has no live region. → `role="status"`/`aria-live="polite"` on toasts; single persistent `role="log" aria-live="polite"` region that announces **settled** text, not every typewriter frame.
- **P0 — No focus trap / focus return in any modal** (`ConfirmModal`, `EditLogModal`, `BarcodeModal`, FloatingTabBar, history sheet, NutritionPage delete). → Use native `<dialog>` or Radix; `inert` on background; restore focus to trigger on close.
- **P1 — Reduced motion ignored by Framer.** `useReducedMotion` wired into only 2 places; CSS media query doesn't touch JS transforms / `repeat:Infinity`. → Wrap app in `<MotionConfig reducedMotion="user">` + honor the in-app `prefs.reduceMotion`.
- **P1 — Failing text contrast.** `--color-text-subtle` (#9099ad) ≈ 2.5:1 (fails AA), used for placeholders/timestamps/captions; `text-white/55` on ink card ≈ 3.4:1. → Darken tokens; re-check dark mode.
- **P1 — Sub-44px touch targets** on edit/delete icon buttons (24–28px), several hover-only-visible on desktop.
- **P1 — Voice state not announced** (recording/transcribing/errors). → Polite live region + `aria-pressed`.
- **P2:** charts lack `role="img"`/data-table fallback; required `aria-label` on `IconButton` (TS-enforced); skip link to `<main>`; tab panels missing `role="tabpanel"`/arrow-key roving; form errors not linked via `aria-describedby`/`aria-invalid`.

### External research (target: WCAG 2.2 AA — EU Accessibility Act in force June 2025)
- New 2.2 criteria that fit Stride: **2.5.8 Target Size (24px min; aim 44–48px** for a health app skewing older), **3.3.7 Redundant Entry** (don't re-ask onboarding fields), **3.3.8 Accessible Auth** (allow paste/passkeys), **2.4.11 Focus Not Obscured** (sticky composer must not cover focus).
- **Accessible streaming pattern:** one persistent polite live region present on load; render tokens visually but announce the **completed** message once (or a "Generating…" status while streaming) — never per-token.
- Charts: wrap in `<figure>`, decorative SVG `aria-hidden`, pair with a `<details>` data table; never color-only.
- Tooling: wire **eslint-plugin-jsx-a11y** + **@axe-core/react** + axe-in-CI + manual VoiceOver/NVDA passes.

### Top 5 a11y fixes
1. Restore visible focus indicators everywhere.
2. Announce toasts + chat to screen readers (live regions, settled text).
3. Focus trap + focus return in all modals (native `<dialog>`/Radix + `inert`).
4. Honor reduced motion in Framer (`MotionConfig` + in-app pref).
5. Fix text contrast tokens (light + dark).

---

## 6. Engines, Data Model & Performance (supporting accuracy + UX)

### Engine / data accuracy
- **CRITICAL — "Calibration" is not adaptive TDEE.** No `weight_logs` table exists; the system never recalibrates targets from intake + weight trend. `calibration.ts` only nudges a workout-burn multiplier ±0.02 on manual thumbs. The MacroFactor-style moat is unimplemented. → Add `weight_logs` (`userId,date,kg`, `by_user_date`); compute observed maintenance = `meanIntake − (Δweight_kg × 7700 / days)` over a 10–14 day rolling window, smooth, feed into the target. (MacroFactor reports 120–170% more accurate than static TDEE after 3–4 weeks.)
- **HIGH — Timezone bugs.** `timezoneOffsetMinutes` is honored only in `insights.ts`; streaks (`gamification.ts`), meal/workout dates, progress, calibration all use UTC `toISOString()`. A meal logged at 11pm local lands on the wrong "day" → breaks streaks and daily windows for all non-UTC users. → Shared `localDate(ts, offsetMin)` everywhere.
- **HIGH — `totalWorkoutsTracked` double-counted** (`calibration.ts:92` vs `182-205`), conflating workouts logged with feedbacks given; gates the adjustment threshold wrongly.
- **MED:** EAT double-counts ~1-MET baseline (`tdee_engine.ts:162` uses full MET, NEAT uses MET−1); `goalWeightKg` stored but never used (no rate-of-change safety/projection); deprecated `calculateTDEE` action still live with different formulas; macro split can clamp carbs to 0 without rebalancing, so reported calories ≠ macro sum; units (`weight`/`height`) not normalized to kg/cm at the data layer; streak-freeze "grace" branch is dead code.

### Frontend performance
- **CRITICAL — Always-mounted WebGL canvas for nothing.** `App.tsx:121` mounts `<VoxelCanvas>` (three.js context + RAF loop) on every authenticated route, but no in-app component portals into it (only the orphaned `SpecialistDock` and OnboardingPage, which is outside the wrapper). → Remove it; drop `three`/`@react-three/fiber`/`@react-three/drei` if 3D isn't actually used. Biggest bundle + battery win.
- **CRITICAL — No route code-splitting.** All 11 pages statically imported; signed-out Landing bundled with the authenticated app. → `lazy()` + `<Suspense>`; split signed-out bundle.
- **HIGH:** `RightPanel` runs 6 Convex queries on every page even when CSS-hidden on mobile (gate the mount behind `xl`); `useLogs` over-fetches for action-only consumers (split reads vs. actions); no error boundary / `Suspense fallback={null}` white-screens on chunk failure; `OnboardingGuard` returns `null` (blank) during profile load.
- **MED:** context values recreated each render (Toast/Theme/Snapshot) → consumer churn; unvirtualized chat list re-runs typewriter; no optimistic updates on logging; **no PWA/offline** despite being a daily-use mobile tracker (add `vite-plugin-pwa` + manifest); self-host/preload Manrope.
- **Dead code:** `QuickLogBar`, `SpecialistDock`, `NudgeInbox`, `StreakCard`, `Clay3D` imported nowhere.

---

## 7. New Features to Add (research-backed)

| Feature | Why | Source signal |
|---------|-----|---------------|
| **Adaptive TDEE** (weight-trend + intake recalibration) | The durable moat over photo-logging rivals | MacroFactor 120–170% > static TDEE |
| **Confirm-to-log editable cards** everywhere (incl. Coach page) | Fixes "AI undercounts and you can't fix it" | Cal AI/SnapCalorie reviews |
| **Voice + NL quick-add as primary fast path** | 6s vs 3.2 min manual | 2025 logging-speed study |
| **One-tap repeat** meals & workouts from memory | Lowest-friction adherence | Hevy/MFP patterns |
| **Real barcode camera** (BarcodeDetector + ZXing) | Backend OFF lookup already exists | MDN/caniuse |
| **Progression analytics** (volume-load, est-1RM, week-over-week delta) | What lifters credit for results | Stronger By Science |
| **Supersets + automatic PR detection/celebration** | Highest-ROI workout delight + virality | Hevy |
| **Wearable sync** (Garmin/Fitbit/Oura/Whoop via Terra API cloud-OAuth; Apple Health/Health Connect need a native bridge) | Steps/HR/sleep/workouts; Google Fit dead July 2025 | Terra docs |
| **Push notifications** for personalized, data-anchored nudges | Top retention lever (77% DAU lost in 3 days) | retention research |
| **Streaks with monthly freeze** | Streaks only retain with a safety valve | engagement research |
| **PWA / offline** | Daily-use mobile tracker | — |
| **Meal photos stored on the record** + photo-then-log-later | MFP added this in 2025 | MFP changelog |

---

## 8. Suggested Sequencing

**Phase A — Trust & accuracy (highest leverage, mostly hardening):**
1. JSON-schema + `temperature:0` + Zod repair loop in `callAI`; kill silent fake-macro fallback.
2. Ground unresolved ingredients via live USDA/OFF; fix `matchBestFood`.
3. Surface real confidence (band + source label + coach context).
4. promptfoo golden-set in CI.
5. Timezone-correct all daily windows; fix calibration double-count.

**Phase B — Logging friction (mostly wiring existing code):**
6. Mount `QuickLogBar` + `FoodSearch`; one-tap repeat from memory; undo toast.
7. Structured workout set editor + fix WorkoutsPage display + `updateWorkout` persistence.
8. Real barcode camera; household-unit entry; fix `getRecentFoods`.

**Phase C — Chat:**
9. Real token streaming; unify the two chat engines + confirm-before-log.
10. Conversation search; coach picker (or single-persona orchestration); follow-up chips.

**Phase D — Accessibility (can run in parallel throughout):**
11. Focus rings, live regions (toasts + chat), modal focus traps, MotionConfig, contrast tokens.
12. Wire eslint-jsx-a11y + axe-in-CI.

**Phase E — Differentiators:**
13. Adaptive TDEE; progression analytics (volume-load/est-1RM); supersets + PR detection.
14. Wearable sync (Terra); push notifications; streak freeze; PWA.

**Phase F — Perf/cleanup:**
15. Remove VoxelCanvas + 3D deps; route code-splitting; error boundary; optimistic updates; delete dead components.

---

## Appendix — Key files
- AI: `backend/convex/ai/llm.ts`, `ai/parse.ts`, `ai/intent.ts`, `ai.ts`, `nutrition_engine.ts`, `foods.ts`, `coaches.ts`, `chat.ts`
- Engines/data: `tdee_engine.ts`, `calorie_engine.ts`, `calibration.ts`, `gamification.ts`, `progress.ts`, `schema.ts`
- Diet logging: `meals.ts`, `food_memory.ts`, `recipes.ts`, `unit_converter.ts`; `frontend/.../NutritionPage.tsx`, `food/FoodSearch.tsx`, `home/QuickLogBar.tsx`, `coach/BarcodeModal.tsx`
- Workout: `workouts.ts`, `workout_scorer.ts`, `exercise_db.ts`, `workout_memory.ts`; `frontend/.../WorkoutsPage.tsx`, `coach/EditLogModal.tsx`
- Chat/a11y: `frontend/.../CoachPage.tsx`, `home/AssistantConsole.tsx`, `chat/MessageBubble.tsx`, `primitives/*`, `context/ToastContext.tsx`, `hooks/useReducedMotion.ts`
- Perf: `frontend/.../App.tsx`, `components/voxel/*`, `layout/RightPanel.tsx`, `hooks/useLogs.ts`

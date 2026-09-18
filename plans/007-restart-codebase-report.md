# Stride Codebase System Report

Audit date: 2026-09-18 · Branch: `fix/chat-logging-reliability` (29 commits ahead of `origin/main`, plus uncommitted changes) · Read-only audit; nothing was modified.

Purpose: baseline for a development restart against four goals — (1) state-of-the-art fitness tracking, (2) rock-solid reliability, (3) numerically accurate calculations, (4) best-in-class UI.

Note on docs: `AGENTS.md` (root), `packages/backend/AGENTS.md`, `packages/backend/CLAUDE.md`, and `README.md` all describe a stale `backend/` + `frontend/` layout. The real layout is `apps/web`, `apps/mobile`, `packages/backend`, `packages/shared`. `AI_CONFIG.md` describes an Express backend (`backend/src/routes/ai.ts`, `backend/src/coaches.ts`) that no longer exists; the real AI layer is `packages/backend/convex/ai/llm.ts`. `AI_CONFIG.md`'s coach list (5 coaches) also disagrees with the code (`packages/backend/convex/coaches.ts`).

---

## 1. Repo map

```
stride/
├── apps/
│   ├── web/          # React 19 + Vite + Tailwind v4 SPA (main product)
│   └── mobile/       # Expo 56 / React Native 0.85 + NativeWind v4 (early parity effort)
├── packages/
│   ├── backend/      # Convex functions: schema, queries, mutations, actions, crons (vitest)
│   └── shared/       # chat-turn card contract + design tokens (424 LOC)
├── docs/             # specs/, plans/, prd/, tickets/, ui-kit/, stride-ui-kit/
├── plans/            # 001–006 implementation plans + README status table
├── prd/              # phase docs + ui-revamp-v2-issues.md
├── Stride_Design_System/  # standalone HTML/JS design-system bundle (not wired into build)
├── scripts/dev-all.sh     # untracked; runs convex dev + web dev with shared cleanup
├── t3.json           # untracked; t3 checkpointing tool config
├── pnpm-workspace.yaml, pnpm-lock.yaml (522 KB), vercel.json, .npmrc, .vercel/
```

LOC (excl. node_modules, generated, ios/android):

| Package | LOC | Language |
|---|---|---|
| `apps/web/src` | 17,519 | TS/TSX/CSS |
| `packages/backend/convex` | 26,425 | TS (incl. ~6,700 LOC tests) |
| `apps/mobile` (excl. native) | 3,726 | TS/TSX |
| `packages/shared/src` | 599 | TS |

Largest backend files: `convex/ai.ts` (4,663), `convex/checkins.ts` (1,187), `convex/chat.ts` (810), `convex/schema.ts` (637), `convex/wellness.ts` (552), `convex/nutrition_draft.ts` (524), `convex/workouts.ts` (514).

Largest web files: `ProfilePage.tsx` (956), `CoachPage.tsx` (816), `RecipesPage.tsx` (701), `AssistantConsole.tsx` (627).

Package manifests:

- **Root `package.json`** — scripts: `dev`, `dev:all` (uncommitted), `dev:convex` (uncommitted), `dev:mobile`, `build`, `typecheck` (`pnpm -r typecheck`), `test`, `build:tokens`. `packageManager: pnpm@10.34.3`, engines node ≥20.
- **`apps/web`** — deps: react 19, react-router-dom 7.1, convex 1.39, @clerk/react 6.7, motion 12, gsap 3.15, @sentry/react 10.20, recharts absent (charts are hand-rolled SVG — see §5), react-markdown 8, lucide-react 0.468, tailwind-merge, cva. dev: vite 6, vitest 4.1.7, tailwindcss 4, testing-library, jsdom 29, vitest-axe. Scripts: `dev`, `build` (with `prebuild` running token build + `scripts/check-env.mjs`), `typecheck` (`tsc -b --noEmit`), `test` (vitest run).
- **`apps/mobile`** — expo ~56.0.12, react-native 0.85.3, react 19.2.3, convex 1.36, @clerk/clerk-expo 2.19.42, nativewind 4.2.6 (tailwindcss **3.4.17** — v3, not v4), moti, reanimated 4.3.1, expo-router. **No `test` script, no test files.** Scripts: start/android/ios/typecheck only.
- **`packages/backend`** — deps include **express 5, cors, @clerk/express, better-sqlite3, uuid** — all unused by the Convex deployment (legacy from the pre-Convex Express server that `AI_CONFIG.md` documents). dev: convex-test 0.0.53, vitest 4.1.7, tsx, @edge-runtime/vm. Scripts: dev (tsx watch of a nonexistent `src/index.ts`), typecheck, test, convex.
- **`packages/shared`** — no runtime deps; exports `.` / `./chat-turn` / `./tokens`; `build:tokens` script generates `apps/web/src/styles/tokens.generated.css` via `tsx src/build-tokens.ts`.

Tooling:

- `pnpm-workspace.yaml`: packages `apps/*`, `packages/*`; `allowBuilds` contains a literal placeholder string `react-native-svg: set this to true or false` — malformed config value.
- `vercel.json`: install filtered to web/shared/backend; build = tokens + web build; output `apps/web/dist`; SPA rewrites. Mobile not deployed anywhere.
- `apps/mobile/eas.json`: dev/preview/production profiles configured; `app.json` has EAS projectId and placeholder env injection (`__EXPO_PUBLIC_CONVEX_URL__`).
- tsconfigs: backend strict + `allowImportingTsExtensions` + verbatimModuleSyntax; web project-references (`tsconfig.app/node`); mobile extends `expo/tsconfig.base` with path aliases into backend and shared.
- vitest: web = jsdom, globals, setup file, alias `@convex/_generated/api` → `apps/web/src/lib/convex-api-shim.ts`; backend = `edge-runtime` environment with `convex-test` inlined.
- Tests could not be executed: `node_modules` are not installed anywhere in the workspace (`pnpm -r typecheck` fails with `tsc: command not found`; pnpm prints "node_modules missing" warnings). `pnpm -r test` was not runnable for the same reason. Per the read-only constraint no install was performed.

---

## 2. Architecture and data flow

### 2.1 Convex schema (`packages/backend/convex/schema.ts`, 637 lines, 33 tables)

| Table | Key fields | Indexes |
|---|---|---|
| `users` | clerkId, email, name | by_clerk_id |
| `meals` | userId, date, name, calories, protein, carbs, fat, time, mealType, confidence, nutritionSource, nutritionVerified, structuredItems (JSON string), ingredientBreakdown (JSON string), reportedCalories, estimatedCalories, calorieSource (reported\|estimated), foodMemoryId, logSource, idempotencyKey, sourceActionId, undoneAt | by_user_date; by_user_date_and_idempotency_key |
| `workouts` | same pattern + sets, reps, weight, duration, intensity, exercises (any), caloriesBurned, calorieConfidence, calorieRangeLow/High, calorieEstimateRough, calorieBreakdown, calculationVersion, reportedCalories/estimatedCalories/calorieSource, calorieEstimateProvenance, structuredSets, workoutDraft | by_user_date; by_user_date_and_idempotency_key |
| `daily_goals` | userId, date, calorieGoal, proteinGoal, carbGoal, fatGoal | by_user_date |
| `insights` | userId, date, content, sourceRowIds, inputsVersion, generatedAt, stale | by_user_date |
| `derived_state_versions` | userId, date, version, updatedAt | by_user_date |
| `weekly_summaries` | userId, weekStart, content | by_user_week |
| `user_profiles` | ~30 fields incl. weight/height/age/sex/activityLevel, 4-component TDEE inputs (occupationType, workHoursPerDay, lifestyleActivity, weeklyWorkouts JSON), planBreakdown JSON, waterTarget | by_user |
| `user_settings` | openRouterKey (BYOK), openRouterModel, units, coachingStyle, timezoneOffsetMinutes | by_user |
| `chat_sessions` | userId, title (`__HOMEPAGE_YYYY-MM-DD__` convention), previewTitle, updatedAt | by_user |
| `chat_messages` | role, content, clientSubmissionId, submissionFingerprint, processingLeaseOwner/Version/ExpiresAt, turnContractVersion (1), turnOutcome (committed\|confirmation_required\|failed\|no_action), turnCards (validated ChatTurnCard[]), actionGroupId, actionIds | by_session; by_user; by_action_group; by_user_submission_and_role |
| `food_cache` | barcode, name, brand, per-100g macros, servingSize/Unit, source, verified, fdcId, searchCount | by_barcode; by_search_count; searchIndex by_name_search |
| `user_gamification` | xp, streakDays, longestStreak, lastLoggedDate, streakFreezes, frozenDates, totals | by_user |
| `water_logs`, `sleep_logs`, `mood_logs`, `steps_logs`, `weight_logs` | date-keyed wellness rows; sleep supports band vs hours (missing ≠ zero); all carry sourceActionId, undoneAt | by_user_date each |
| `check_in_answers`, `check_in_template_settings`, `check_in_llm_questions` | per-window Q&A registry | 3 + 2 + 1 indexes |
| `user_metabolic_profiles`, `calorie_feedback` | adaptive metabolicFactor, per-workout feedback | by_user |
| `user_behavior`, `nudges` | behavior memory + nudge inbox | 2–3 indexes each |
| `food_memory`, `user_ingredients`, `workout_memory` | learned profiles with approvalStatus, provenance, undoneAt/deletedAt | by_user + by_user_name each |
| `recipes` | servings, ingredients JSON, perServing/total macro objects | by_user |
| `actionGroups` | groupIdempotencyKey, sourceSurface (7 literals), rawInput, status, clientLocalDate/Time/Zone, submissionFingerprint | by_user_created_at; by_group_idempotency_key |
| `actions` | actionType (meal\|workout\|recovery\|rest\|memory), memberIdempotencyKey, payload + originalPayload, provenance (user_reported\|ai_extracted\|ai_estimated\|database_match), confidence, validation{status,messages}, status, reversible, committedRowRef, undoneAt | by_group; by_user_status; by_user_committed_row; by_member_idempotency_key |
| `action_telemetry` | per-action event stream incl. mutationResult, undoResult, derivedStateVersion | by_group; by_action; by_user_created_at |
| `ai_usage_buckets`, `ai_usage_reservations` | rate-limit + cost-budget accounting | by_scope_owner_bucket |

Serialization smell: many complex structures are stored as JSON strings (`meals.structuredItems`, `meals.ingredientBreakdown`, `workouts.structuredSets`, `profiles.planBreakdown`, `weeklyWorkouts`, `check_in_llm_questions.questions`) rather than typed subdocuments — unvalidatable at DB level.

### 2.2 Function inventory (abridged to every exported public function; `internal*` counted)

**Core pipeline (`ai.ts`)** — `stageClarificationGroup` (i:370), `recordFailedTurnGroup` (i:476), `resolveClarification` (a:766), `getActionGroupForClarification` (i:778), `getActionGroupByKey` (i:785), `getPendingMembersForClarification` (i:795), `expireActionGroup` (i:802), `recordConfirmationMemberFailure` (i:843), `finalizeConfirmationGroup` (i:888), `confirmGroup` (a:1062 — commit a confirmed batch), `logAnywayForAction` (a:1236), `getActionMember` (i:1337), `discardConfirmationMember` (i:1342), `commitHomeDraft` (m:1374), `parseOnboarding` (a:1490), `recipeInsight` (a:1526), `parseIngredients`/`parseSteps` (a:1553/1592), `estimateMeal` (a:1620), `parseMeal` (a:1643), `parseWorkout` (a:1677), `logMeal` (a:1713), `logWorkout` (a:1797), **`chat` (a:1903 — the coach pipeline, ~440 lines)**, `generateDailyInsights` (a:2345) / `ForUser` (i:2354) / `cronDailyInsights` (i:2371), `generateWeeklySummary` (a:2444) / `ForUser` (i:2453) / `cronWeeklySummary` (i:2465), `suggestWorkout` (a:2536), `parseNutritionImage` (a:2636 — label OCR), `estimatePortion` (a:2688), `calculateProfileMacros` (a:2736), `regenerateSuggestion` (a:2778), `getCoaches` (q:2826), `transcribe` (a:2834 — Groq Whisper), `getActiveCanonicalLoggedItems` (i:3995 — ownership-aware row hydration), `homepageInput` (a:4222 — home logging pipeline).

**Chat (`chat.ts`)** — `getSessions` q:34, `createSession` m:62, `deleteSession` m:76, `updateSessionTitle` m:92, `getMessages` q:102, `clearAllMessages` m:127, `getMessagesForContext` i:141, `getMessageCount` i:157, `addMessage` i:170 (validates turnCards against shared contract), `updateAssistantOutcomeForGroup` i:557, **`claimTurn` i:570 (durable lease: fingerprint check + owner/version/expiry)**, `linkResolvedTurnMessage` i:667, `getAssistantOutcomeForGroup` i:692, `updateSessionTitleFromAI` i:710, `touchSession` i:719, `getOrCreateHomepageSession` i:737, `getHomepageMessages` q:757, `clearHomepageMessages` m:792.

**Domain CRUD** — meals: getMeals q:145, addMeal m:158, updateMeal m:210, setMealCalorieSource m:286, deleteMeal m:315, relogMeal m:335, addMealFromAI i:431; workouts (parallel set, incl. deleteWorkout ~350, relogWorkout); foods: searchFoods a:283, lookupBarcode a:390, searchFoodsLive i:225, cacheFood i:160; recipes (CRUD + logRecipe m:190); wellness: addWater m:232, upsertSleep m:295, logSleepFromCoach m:308, deleteSleep m:321, undoSleepLog m:332, addMood m:367, upsertSteps m:404, getTodaySummary q:444, getRecoveryState q:515; profile: getProfile q:20, upsertProfile m:71, calculateTDEE a:155, getSettings/upsertSettings q/m:262/286, calculateNutritionPlan q:377, upsertPlanFromOnboarding m:386.

**Envelope & undo** — `actions_writer.ts`: writeMealAction i:220, writeWorkoutAction i:242, writeRecoveryAction i:264; `actions_undo.ts`: undoAction m:334, undoGroup m:358, getCommittedActionForRow i:407; `actions_idempotency.ts`: deriveGroupKey / deriveMemberKey / deriveLogicalMemberKey / deriveSubmissionFingerprint.

**Engines (pure)** — `tdee_engine.ts`, `calorie_engine.ts`, `nutrition_engine.ts`, `unit_converter.ts`, `exercise_db.ts` (345 LOC, ~100 exercises), `workout_scorer.ts`, `time_resolve.ts`, `nutrition_draft.ts`, `workout_draft.ts`, `recovery_draft.ts`, `food_memory_match.ts` (threshold 0.55, AUTO_APPLY_MIN_LOGGED 2), `plan_resolve.ts` (FALLBACK_TARGETS 2000/90/250/65), `ai/intent.ts`, `ai/parse.ts`, `ai/llm.ts`.

**Others** — gamification (getState q:139, recordActivity m:336, useStreakFreeze m:369, MISSIONS at :7), calibration (submitCalorieFeedback m:57, setFitnessLevel m:123, incrementWorkoutCount i:186), goals (getDailyGoal q:19, upsertDailyGoal m:31, syncDayAdjustment m:116, applyDayAdjustment helper :74), derived_state (`recomputeForAction` — goals + gamification + calibration + insight invalidation + version bump), history (getCalendar q:10, getDayHistory q:47, getHistoryInsights q:102, getStreak q:171), insights (getDailyInsights q:41, saveInsights i:77, getTodayBrief q:129), patterns q:117, behavior (recordBehavior m:34, listActiveUsers i:132), nudges (dispatchWindowNudges i:111), checkins (getNextCheckIn q:762, submitAnswer m:861, ensureDailyLlmQuestions a:1130), agents (runMemoryAgentAction i:143, MEMORY_AUTO_PERSIST=false), food_memory (recordFromMeal i:154, updateFromCorrection i:164, approve/reject/undo/delete m:213–249, createExplicitFact m:261), users.ensureUser, seed.seedTestUser, telemetry.record, ai_guard (checkAndReserve i:290, settleUsage i:384, releaseReservation i:417).

**Crons (`crons.ts`)** — daily insights 06:00 UTC, weekly summary Monday 07:00 UTC, hourly window nudges. All three AI crons are gated on `process.env.AI_CRONS_ENABLED === "true"`; fan-out is batched (`AI_CRON_BATCH_SIZE`) with `scheduler.runAfter` staggering.

### 2.3 Auth flow

Clerk → Convex: `apps/web/src/main.tsx:56` wraps `ClerkProvider` → `ConvexProviderWithClerk` (`useAuth`); every backend function calls `ctx.auth.getUserIdentity()` and uses `identity.subject` as `userId` (no users-table indirection; the `users` table is a mirror written by `users.ensureUser` from `App.tsx` EnsureUser). Backend trust config: `packages/backend/convex/auth.config.ts` (JWT issuer domain set in Convex dashboard). Mobile uses `@clerk/clerk-expo` with the same Convex provider. Test coverage of auth boundaries exists (`auth_boundaries.test.ts`, 5 tests). BYOK: `user_settings.openRouterKey` overrides the deployment OpenRouter key per user; deployment-key use is restricted to allow-listed models (`ai/llm.ts:48` `MODEL_NOT_ALLOWED_WITH_DEPLOYMENT_KEY`).

### 2.4 AI pipeline end to end

Canonical spec: `docs/specs/canonical-ai-action-pipeline.md` (50 user stories + implementation decisions). It is largely implemented:

```
raw input (text/voice/image/barcode/label/clipboard)
→ claimTurn (durable submission lease, chat.ts:570)
→ intent heuristics (ai/intent.ts: classifyHomepageIntent, LOG_RE, NEGATED_LOG_RE)
→ structured extraction (extractStructuredLogItems → JSON validated by validateStructuredExtraction, ai.ts:2965)
→ typed drafts (nutrition_draft.buildMealDraft / workout_draft / recovery_draft)
→ deterministic calc (unit_converter → nutrition_engine → calorie_engine/exercise_db)
→ food memory match (food_memory_match.findBestMatch; threshold 0.55, ≥2 logs to auto-apply)
→ write policy (actions_envelope: AUTO_WRITE_MAX_ACTIONS=4, LOW_CONFIDENCE_CONFIRM_THRESHOLD=0.6, CONFIRMATION_TTL_MS=24h)
→ canonical writers (actions_writer.writeMeal/Workout/RecoveryAction)
→ derived state (derived_state.recomputeForAction)
→ persisted turn outcome + validated ChatTurnCards (shared/src/chat-turn.ts, assertChatTurnCards)
→ web/mobile render cards; undo via actions_undo (undoAction/undoGroup)
```

Marker-based logging (`⟦LOG_MEAL⟧` described in PRODUCT.md and AI_CONFIG.md) is **gone** — the chat action now explicitly instructs the model never to claim logging (`loggingPrompt`, ai.ts:1983) and reports status from persisted state only. `docs/specs` says markers are removed; PRODUCT.md:66 still advertises them (stale).

Input modalities:
- **Text**: home (`homepageInput`) and coach (`chat`), 4,000-char limit.
- **Voice**: `apps/web/src/hooks/useAudioRecorder.ts` → MediaRecorder webm → `ai.transcribe` (ai.ts:2834) → Groq `whisper-large-v3-turbo`, 30s timeout, cost reserved at conservative 8 kbps.
- **Image (meal photo / chat image)**: vision via `VISION_MODELS` set, sent as data URL to the reply model.
- **Barcode**: `foods.lookupBarcode` (foods.ts:390) — OFF product API → cache → manual fallback. Web `BarcodeModal` is **manual barcode entry only** — no camera (plan 003 never executed).
- **Label OCR**: `parseNutritionImage` (ai.ts:2636) — vision model returns per-100g JSON, validated field-by-field.
- **Clipboard**: paste image into input (CoachPage, 5MB/1600px caps).

Confirm card flow: low confidence or ≥5 items → `stageClarificationGroup`/confirmation card with `expiresAt` = createdAt + 24h; `confirmGroup` (ai.ts:1062) executes members with per-member idempotency; failures stay visible (`recordConfirmationMemberFailure`, `logAnywayForAction`); undo remains 24h.

Mobile parity: mobile renders the same persisted `ChatTurnCards` (`apps/mobile/components/ChatTurnCards.tsx`, 221 LOC, a hand-port of the web renderer) and consumes `@stride/shared` types directly (`packages/backend/convex/chat.ts:5` imports from `../../shared/src/chat-turn`). Gaps: mobile AddSheet modalities (chat/voice/photo/barcode/OCR — `(tabs)/nutrition.tsx:79`) are **decorative** — every option just closes the sheet; there is no camera, mic, or barcode wiring in mobile at all.

### 2.5 Model routing and prompts

`packages/backend/convex/ai/llm.ts` is the single client:
- `DEFAULT_MODEL = openai/gpt-4o-mini` (parsing/extraction/titles)
- `CHAT_MODEL = anthropic/claude-sonnet-4.6` (coach + homepage replies)
- `FALLBACK_MODEL = anthropic/claude-haiku-4.5` (attempt 3)
- 3 attempts, 250ms×2^n backoff, 60s AbortController timeout, reservation/settle/release through `ai_guard` before/after each attempt; BYOK bypasses pricing gate and reserves zero cost.
- Budgets (`ai_guard.ts:5-9`): 20 req / 5 min / user; $0.25/day/user; $3/month/user; $50 global/month. Pricing table: gpt-4o-mini 0.15/0.60, haiku-4.5 1/5, sonnet-4.6 3/15 per Mtok. Token estimates at chars/3 when usage metadata absent.
- Prompts live inline: `NUTRITION_ACCURACY_RULES` (ai/parse.ts:29 — portion-first, Indian-food oil rules, macro-plausibility ±25%, missing_fields semantics), coach system prompts in `coaches.ts` (7 canonical personas + legacy mapping in `personas.ts`), safety gating via `hasRestrictedRecoverySignal` + `RESTRICTED_GUIDANCE` (ai.ts), weekly/daily insight prompts inline in `runDailyInsights`/`runWeeklySummary`.

### 2.6 Web app

Router (`App.tsx`): `/` HomePage (AssistantConsole chat + quick log + nudges), `/nutrition`, `/workouts`, `/insights`, `/history`, `/settings`, `/profile`, `/coach` (CoachPage multi-session chat), `/sign-in`, `/sign-up`, `/onboarding`, `/` landing for logged-out. State: Convex subscriptions + local contexts (Theme, Sidebar, Toast, NavSheet, Snapshot). Motion via `motion/react` with `useReducedMotion` gating (`App.tsx:48`). Sentry initialized with aggressive key-based scrubbing (`main.tsx:11-35`); global error + unhandledrejection listeners.

### 2.7 Mobile app

Expo Router tabs: home `(tabs)/index.tsx`, nutrition `(tabs)/nutrition.tsx` (503 LOC — richest screen), workouts, insights; push screens: stry (chat), history, account, settings. `apps/mobile/data` contains **hardcoded mock recipes/macro data**; `MacroSummary` computes today's totals client-side by summing meal rows (nutrition.tsx:445-448) — duplicating the web/`getTodaySummary` path with different rounding. NativeWind v3-config under Tailwind **3.4.17** while web uses v4 — two styling systems. No tests, no voice, no camera, no barcode.

### 2.8 Shared package

`packages/shared/src`: `chat-turn.ts` (268 LOC — versioned card union + runtime validators `assertChatTurnCards`), `tokens.ts` (135 LOC — colors/typography/spacing/radius/motion), `index.ts` re-exports, `build-tokens.ts` → CSS custom properties. Consumers: backend (`chat.ts:5`), web (vitest alias + components), mobile (package.json dep + tsconfig alias). Tokens also exist independently in `Stride_Design_System/_ds_bundle.js` and `docs/ui-kit/ds-bundle` (three token sources; only shared → web is automated).

---

## 3. Calculation and accuracy audit

Every numeric path, with formula, provenance, and failure modes.

### 3.1 TDEE / BMR / goal targets — `packages/backend/convex/tdee_engine.ts`

- **BMR** (`getBMR`, :66): Katch-McArdle `370 + 21.6 × leanMass` when bodyFat ∈ (0,70), else Mifflin-St Jeor `10w + 6.25h − 5a ± 5/−161`. Inputs guarded by `pos()` fallbacks (weight 70kg, height 170cm, age 30) — **silent fallbacks**: a missing weight silently computes for a 70kg reference body. Round to whole kcal.
- **TDEE** (`calculateTDEE`, :105): `BMR + NEAT_job + NEAT_lifestyle + EAT` then `× 1.10` TEF, rounded. NEAT_job = `(OCCUPATION_MET−1) × kg × workHours` (desk 1.2 → mixed 1.5 → standing 1.8 → physical 2.6; constants hardcoded, no citation comments beyond "Compendium" lineage for METs generally). NEAT_lifestyle = `lifeMet × kg × (16 − workHours − avgWorkoutHours)` — note lifeMet here is **not** MET−1 based (0.1–0.35 additive constant, fine) but `LIFESTYLE_MET_EXTRA` is applied to full waking-leisure hours, so `active` (0.35) contributes 0.35×kg×h — this is an additive-NEAT model, consistent.
- **EAT**: gross weekly `MET × kg × h × sessions / 7`; separately `plannedDailyEAT`/`plannedEatPerTrainingDay` use **net** `(MET−1)` to match logged-burn convention (:146-160 comment). Documented dual convention; risk: gross EAT inside TDEE plus net EAT baseline for day adjustments is correct but subtle — any future refactor mixing them shifts targets by ~1 MET·kg·h.
- **Goal adjustment** (`applyGoalAdjustment`, :193): `finalTDEE × (1 + GOAL_CALORIE_ADJUSTMENT[goal])` with goal deltas −25%…+18%, capped at −25% deficit and sex floors (1500 male / 1200 female). Solid.
- **Macros** (`calculateMacros`, :210): protein-first g/lb (0.8–1.1 by goal) × kg→lb (2.20462), fat g/lb (0.35–0.45), carbs fill remainder at 4/4/9. Each macro independently rounded **before** the remainder is computed, so `calories ≠ 4P+4C+9F` by up to ~±10 kcal. Cosmetic, not cumulative.
- **Day adjustment** (`adjustCaloriesForDay`, :247): `delta = round(actualBurn − plannedEatPerTrainingDay)`, carbs absorb delta/4 clamped ≥0, calorieGoal floored at `4P+9F`. Uses `|| 0` on `todayActualBurn` (:249) — a NaN burn silently becomes a rest day.
- Persisted as JSON in `user_profiles.planBreakdown`; parsed/validated by `plan_resolve.parseStoredPlan` before any reuse (fallback 2000/90/250/65 constants).

Risks: `getBMR` silent 70kg fallback feeds every downstream number when onboarding was skipped; `applyGoalAdjustment` rounds after `Math.max(floor)`, fine; no DST exposure (pure math on kg/cm).

### 3.2 Workout burn — `packages/backend/convex/calorie_engine.ts` + `exercise_db.ts` + `workout_scorer.ts`

- **Formula** (`calculateWorkoutCalories`, :76): `base = (MET−1) × kg × hours` (net of resting — correct Compendium convention), then × `intensityMult` (0.85–1.2) × `densityMult` (0.9–1.2) × `compoundMult` (0.95–1.08), then `+ EPOC` (5–12.5% of during-workout), then `× metabolic_factor`, all rounded to whole kcal.
- **Constants**: intensity/density/EPOC multipliers and compound mapping are **invented heuristics**, not literature values; the METs themselves claim the 2011 Compendium (`exercise_db.ts:19`) with ~100 hardcoded entries (squat 5.0, deadlift 6.0, running 8.0 …). Individually plausible, some aggressive (Power clean 8.0, C&J 9.0).
- **Layered rounding**: during-workout rounded, EPOC rounded from the rounded value, total rounded again — three sequential `Math.round`s. Max drift a few kcal; not a real accuracy problem but makes the "breakdown" not exactly reproducible from stored fields.
- **Confidence** (:155): additive score −0.3 missing duration, −0.25 no exercises, −0.15 implausible MET, −0.3 unknown weight, −0.05 default fitness, −0.05 default metabolic factor; floor 0.1. Range = ±`total × (1−confidence) × 0.25`.
- **Non-personalized path** (`calculateNonPersonalizedWorkoutCalories`, :112) deliberately refuses to invent age/sex/fitness; confidence fixed 0.35, range ±40% or ≥25 kcal. Good honesty design.
- **Duration parsing** (`parseDurationMinutes`, :238): handles "45 min", "1h 30m", raw numbers. "90" → 90 **minutes** — but "1.5" → 1.5 minutes, so a user typing "1.5 hours" without a unit yields 1.5 min of burn (~4 kcal). Unit-less ambiguity unhandled.
- **`estimateDuration`** (workout_scorer.ts:60): 2 min/set fallback when AI omits duration — an invented value that becomes the basis of a calorie number (labeled only through confidence).
- **Adaptive factor** (`calibration.ts`): ±0.02 per feedback after ≥5 feedbacks, clamped 0.7–1.4, snapshot stored per feedback. Feedback counting uses total all-time count as the gate — fine.
- **Provenance** is first-class: `calorieEstimateProvenance` ∈ personalized_met | non_personalized_met | broad_unknown_exercise | provided_estimate | unavailable_missing_profile (workout_draft.ts:31), with reported-vs-estimated split persisted on the row (schema `workouts`).

Biggest accuracy gap: MET × modifiers × kg treats strength training as steady-state cardio; sets/reps/load are stored but don't influence burn beyond the density/compound proxies. This is industry-standard but a known ~±30% error band that the UI must keep communicating.

### 3.3 Nutrition per ingredient — `nutrition_draft.ts`, `unit_converter.ts`, `nutrition_engine.ts`

- **Unit conversion** (`unit_converter.toGrams`): exact for g/kg/mg/oz (28.35)/lb (453.59); volume via `VOLUME_TO_ML` (cup 240, tbsp 15, katori 150, glass 250…) × `FOOD_DENSITIES` (~50 foods; flour 0.55, oats 0.4, honey 1.42); piece weights (~60 foods, egg 50g, roti 40g, idli 40g…). Unknown food + known vessel → **unresolved (0g, confidence 0)** rather than a guess — correct "unresolved over invented" policy. Unresolved ingredients contribute **zero** calories by construction (`buildMealDraft`, nutrition_draft.ts:280 "Never accept a whole-meal estimate as a substitute for ingredient math").
- **Per-item rounding before summation**: each ingredient's kcal is `Math.round`, macros `round1` (nutrition_draft.ts:289-292), then totals are summed (:296-301). With N ingredients the total can drift ~±0.5N kcal from exact. Totals are then re-rounded. Bounded, but a true per-item error pattern; a sum-then-round would be exact.
- **computeNutrition** (`nutrition_engine.ts:60`): per-100g × grams/100, calories rounded whole, macros rounded to 0.1. Duplicated a second time in `foods.ts:442` (`computeNutrition` there returns unrounded-to-0.1 macros — two near-identical functions with different rounding; drift risk if one is edited).
- **Sanity clamps** (`nutrition_draft.ts:130-150`): ingredient kcal > 3500 clamped with flag, > 5000 rejected; quantity > 1000/10000; grams > 2000/10000; macros > (600/900/450)/(1000/1500/750). Flags recorded as `*_clamped` validation messages. Good AI-hallucination firewall.
- **Candidate selection** (`rankFoodCandidates`/`selectFoodCandidate`, :197-223): score = exact 1 / prefix 0.88 / contains 0.78 / Jaccard word overlap; requires ≥0.7 AND beat runner-up by ≥0.15 else unresolved → forces clarification. This is the main defense against wrong-database-row nutrition.
- **Cooking oil adjustment** (`nutrition_engine.cookingMethodAdjustment`, :110): fried 15g oil, sauté 7g, curry 8g, tadka 5g, unknown 45 kcal/5g fat, at 8.84 kcal/g. Hardcoded heuristic; reasonable but invisible to the user unless surfaced.
- **Recipe math** (`recipes.ts`, `logRecipe` :190): totals from per-100g ingredients × grams / servings; `scaleResult` re-rounds each item.
- **Food memory** (`food_memory.ts` + `food_memory_match.ts`): normalized-name matching, smoothed averages, `AUTO_APPLY_MIN_LOGGED = 2`, `MATCH_THRESHOLD = 0.55`; memory path in `buildMealDraftFromParsed` (:432) applies a **whole-meal average** (1 serving = entry.kcal) with confidence `min(0.95, 0.7 + score×0.25)` — a blended history average, clearly labeled `memory` provenance.
- **AI estimation vs database vs barcode**: barcode = OFF per-100g (verified when complete) → high reliability; USDA join when `USDA_API_KEY` configured (optional; `getUsdaApiKey()`), else OFF-only — OFF data quality for generic Indian foods is weak, which is why memory/ingredients tables exist. `ai_estimate` provenance is carried all the way to rows/cards. There is **no serving-size-aware USD FDC query** (text search only) and no image-model nutrition verification loop.

### 3.4 Totals, dates, streaks

- **Daily totals**: `meals.ts:210` getMeals → sum in clients and in `wellness.getTodaySummary`, `runDailyInsights` (ai.ts:2398), `chat` context (ai.ts:1962), mobile `(tabs)/nutrition.tsx:445`. All sum the **already-rounded** per-meal values — consistent everywhere, but the displayed day total is the sum of rounded values, which can differ by a few kcal from an exact sum. Notably `getMeals` filters `undoneAt` but several context queries (`getMealsForContext` etc.) rely on the same filter — verified consistent.
- **Date bucketing**: canonical server helper `time_resolve.ts` — proper `Intl.DateTimeFormat` per-user-timezone resolution, vague-phrase clarification, future-actual rejection. BUT it requires `userTimeZone` (an IANA name) while the schema only stores `timezoneOffsetMinutes` (number, from `getTimezoneOffset()`) — `resolveActionDate` with a numeric offset is impossible, so the canonical resolver is effectively usable only where callers pass "UTC" (e.g. `resolveTargetDateTime`). Most write paths still fall back to `new Date().toISOString().split("T")[0]` — **server-UTC dates** (ai.ts:1392, 1725, 1809, 4251; meals.ts:159; chat.ts:740,796; gamification.ts:186,210; calibration.ts:90,110; behavior.ts:124). Clients pass `today` (web sends local date) which papers over this for chat/home, but any mutation invoked without `date`/`today` (e.g. `addMeal` with no date, streak "yesterday" computed from UTC) is wrong for UTC−x users between 00:00 and their local midnight, and for UTC+x users after local midnight. DST: offset-minutes encoding is wrong by one hour for half the year in DST zones (stored at one moment, applied at another — e.g. weekly summary `runWeeklySummary` ai.ts:2489 uses `Date.now() − offsetMin*60000` with `.getUTCDay()`).
- **Streaks — three divergent implementations**:
  1. `gamification.recordActivityForUser` (gamification.ts:186): `today = date ?? UTC-today`; `yesterday = UTC-now − 86400000` (:210) — UTC-based, drifts for non-UTC users; "grace" branch at :228 (`dayDiff <= 2`) resets streak to 1 in **both** branches — dead code (`if/else` identical).
  2. `history.getStreak` (history.ts:171).
  3. Legacy client `apps/web/src/lib/streaks.ts` `computeStreak` — operates on `LogEntry` from `@/lib/storage` (localStorage), `toDateString()` day keys; DST handled by string comparison in best-streak but current-streak walks via `setDate` which is DST-safe-ish; this file appears orphaned (storage-based) — a third streak source of truth.
- **Weight trends**: `weight_logs` (schema :388) with by_user index; trend math appears in InsightsPage client-side; no ADR on smoothing. Steps/water: `water_logs.ml`, `steps_logs.count` — plain sums.
- **`getRecentCalories`** (meals.ts:412): 7-day window via `gte("date", startDate)` with UTC startDate — same UTC bias.
- **AI-estimated numbers stored as exact**: chat context tells the model "Calories consumed: N" computed from mixed-provenance rows without flagging estimates; insight prompts likewise (`goal?.calorieGoal || 2400` — ai.ts:2430 hardcoded 2400 default goal inside prompt text, inconsistent with `FALLBACK_TARGETS.calories = 2000`).
- **`estimatePortion`** (ai.ts:2688): trusts the **model's own arithmetic** when it returns calories/protein (`result.calories || Math.round(...)`) — if the model returns a plausible-but-wrong number it is used verbatim instead of recomputing from grams × per-100g; only the fallback path is deterministic.
- **`parseNutritionImage`** (ai.ts:2636): label OCR values are used as-is after finite/negative checks — no cross-check that macros×4/4/9 ≈ kcal (the ±25% rule exists only in the prompt).

### 3.5 Where numbers come from — reliability rating

| Source | Path | Rating |
|---|---|---|
| Barcode (OFF) | foods.lookupBarcode → per-100g × grams | High (brand data; OFF variance moderate) |
| USDA | only if `USDA_API_KEY` set; text search | High when present; **absent by default** |
| Food memory | smoothed averages ≥2 logs | Medium-high for repeat meals; blends old estimates |
| user_ingredients | user-stated per-100g | High (user truth) |
| AI estimate (vision/text) | parseMeal/parseNutritionImage/estimateMeal → per-ingredient → toGrams → computeNutrition | Low-medium; heavily fenced (thresholds, clamps, unresolved=0) |
| Whole-meal AI fallback | estimateMeal raw JSON | Low; only gated by prompt rules — no arithmetic cross-check |
| Workout burn | MET engine + heuristics + adaptive factor | Medium (±30% inherent); provenance labeled |
| TDEE/macros | deterministic engine | High math quality; input fallbacks are the weak link |

**No integrated nutrition DB abstraction layer** exists beyond `food_cache` + two providers; there is no OFF image-search, no USDA FDC ID detail fetch, no verification workflow beyond the `verified` boolean.

---

## 4. Reliability audit

### 4.1 Known open reliability findings (from `plans/006-chat-logging-reliability-findings.md`, OPEN, dated 2026-08-28, plus code verification)

Six P1s were identified by the branch's own review; the uncommitted diff on this branch addresses part of this list (row-ownership hydration via `getActiveCanonicalLoggedItems`, undo returning canonical turn snapshots, resolved-confirmation `reason`/`resolution` fields, truthful toasts). Still open / partially open:

1. **Distinct actions can claim one canonical row** — `meals.ts:90`/`workouts.ts:134` idempotency returns an existing active row without checking `sourceActionId` ownership; hydration now rejects mismatches (ai.ts:3995) so cards and API can disagree instead of silently cross-linking — improvement, but the writer still reports success against a foreign row.
2. **Lease takeover can leave stale/conflicting members** (`ai.ts:439`, `actions_writer.ts:144`) — `stageClarificationGroup` early-returns when members exist; changed candidate count/type after takeover diverges. Tests cover changed payload only (`chat_concurrency.test.ts:375`).
3. **Current user message can enter model context twice** — `trimHomepageHistory` (ai.ts:2940) does `slice(0,-1)` positional removal instead of removing by `clientSubmissionId`; coach path appends the message again after claimed-history already includes it (ai.ts:2141). With overlapping submissions the wrong message can be trimmed (P1 in 006; not fixed in uncommitted diff).
4. **Home Enter allows overlapping submissions** (`AssistantConsole.tsx:291`, `InputBar.tsx:171`) — send button disabled while busy, Enter not; `useSubmissionId` is a single mutable cell → retry identity can be clobbered (open).
5. **Reconciliation trusts committed action metadata** — `reconcileCards` (chat.ts:350, pre-diff) built committed items from status + committedRowRef without row checks; the uncommitted diff routes logged-items through `getActiveCanonicalLoggedItems` (ai.ts:3995) which does check action status/user/undoneAt/sourceActionId — but `reconcileCards` itself still trusts metadata for card construction.
6. **Manual edits don't invalidate Undo ownership** (`meals.ts:223`, `workouts.ts:312`, `actions_undo.ts:257`) — edits preserve `sourceActionId`; undo can tombstone a user-edited row with a stale snapshot (open; no row revision field in schema).

Additional P2/P3 from 006 still open: direct deletes (`deleteMeal`/`deleteWorkout`/wellness deletes) don't reconcile the assistant turn (transcript can keep showing "saved" + live Undo); `linkResolvedTurnMessage` doesn't check session equality (chat.ts:667); mobile clarification handler ignores canonical result (`ChatPanel.tsx:196`); empty `clientSubmissionId` bypasses claims/dedup (validators `v.optional(v.string())` accept `""` at ai.ts:1903/4222); empty result cards render contradictory copy (shared chat-turn.ts:199 allows `items: []`).

### 4.2 Other reliability observations

- **Idempotency**: two-layer scheme is genuinely well-designed (`actions_idempotency.ts`: group key from clientSubmissionId else content-hash; member key from logical type+ordinal so payload changes don't fork members). Domain-level legacy keys (`meals.idempotencyKey` with NEAR_DUPLICATE handling in BarcodeModal) coexist — spec says they should be subsumed; not yet.
- **Unhandled promise paths**: fire-and-forget `ctx.runAction(internal.agents.runMemoryAgentAction, ...).catch(() => {})` (ai.ts:4291) — memory agent failures are fully silent (no telemetry). `bumpSearchCount` fire-and-forget in foods.ts swallows errors. Session title generation has try/catch fallback (ai.ts:2270).
- **AI failure modes**: JSON parsing via `parseJSON` with fenced extraction and `validateStructuredExtraction` shape checks; truncation detected (`TRUNCATED_RESPONSE`); extraction failure becomes a persisted `failed` turn with retriable flag — strong. Marker parsing is gone. Timeout: 60s LLM, 30s Groq, `FOOD_LOOKUP_TIMEOUT_MS` for OFF/USDA via `lib/fetch_timeout.ts`.
- **Rate limits/budgets**: enforced mutationally via `ai_guard.checkAndReserve` with reservations table; Groq reserves by byte-estimated duration. Global monthly budget $50. Risk: reservations from crashed actions linger in `reserved` state (no reaper cron — `releaseReservation` exists but only called in `callAI` catch paths; a killed action leaks the reserve until… nothing cleans it).
- **Cron safety**: gated by `AI_CRONS_ENABLED`, batched fan-out with delays, per-user local-date derived from stored offset (the UTC-offset DST issue applies). `behavior.listActiveUsers` scans `user_behavior` by_date index (bounded 3/7 days).
- **Data integrity**: orphan risk — `deleteSession` deletes messages in a loop of single deletes (`Promise.all` over `ctx.db.delete`, chat.ts:85) — fine but chatty. `insights.stale` invalidation only touches the action's date (+next for recovery); a workout edit on day D does not invalidate the weekly summary. `chat_sessions` have no TTL/cleanup for `__HOMEPAGE_` sessions (one per user per day, grows unbounded). `action_telemetry`, `ai_usage_buckets.rateLimitTimestamps` arrays grow unbounded (timestamps array pruned? `checkAndReserve` filters within window — bounded).
- **Unbounded queries**: `getSessions` collects all sessions; `getMessages` collects all messages of a session with no limit (chat.ts:112) — a long-lived homepage session per day means the homepage subscription loads a growing day's transcript; `searchFoodsInCache` take(12) fine; `getRecentFoods` take(20) fine.
- **Offline**: no service worker on main (PWA work sits on `claude/phase-4-pwa`, unmerged). Convex client queues nothing; optimistic updates exist in a few components (water tracker, toasts) but chat is strictly round-trip.
- **Auth edge cases**: empty-string submission IDs (above); `ensureUser` failure is retried with toast (App.tsx EnsureUser); all functions require identity — `auth_boundaries.test.ts` covers 5 cases.
- **Type/test verification could not run** (no node_modules). Test inventory: backend 37 test files, **267 test cases** (`grep -c "test(|it("`), web 10 test files, **27 test cases**, mobile **0**. Web coverage: chat cards, error boundary, FoodSearch, AssistantConsole, NudgeInbox, useLogs, usePrefs, check-env, onboarding persistence, LogConfirmCard. Backend coverage is deep on: pipeline e2e (20), tdee engine (21), validation (14), actions undo/confirm/writer/envelope/idempotency (50), chat concurrency (9) + turn contract (10), time resolve (11), unit converter (2), nutrition draft (11), workout draft (9), recovery draft (10), plan resolve (8), checkins (10). **Coverage gaps**: foods.ts (2 tests for search/barcode/USDA/OFF normalization), recipes (7), gamification streak logic (0 direct), weekly/daily insight generation (0 beyond crons.test.ts structural checks), wellness CRUD (0 direct), coaches prompts (6 structural), exercise_db (1), no `ai.ts` chat-action integration test at the public boundary (covered indirectly via homepage_pipeline/pipeline_e2e), no mobile tests at all.

---

## 5. UI and UX audit

### 5.1 Design system state — three systems, one wired

1. **`packages/shared/src/tokens.ts`** (135 LOC) + `build-tokens.ts` → `apps/web/src/styles/tokens.generated.css` — the only automated path (web `predev`/`prebuild` regenerate it).
2. **`docs/ui-kit/`** — a separate Vite app with its own package.json, `bun.lock`, `dist/`, `ds-bundle/` including a `_ds_needs_recompile` marker and `_ds_sync.json` — a parallel design-system build that is not referenced by web/mobile.
3. **`Stride_Design_System/`** — an HTML/JS bundle (App Mockup v1/v2, `_ds_bundle.js`, `_ds_manifest.json`, screenshots) — design exploration artifacts, source of the web look but not machine-consumed.

Web styling: Tailwind v4 (`@tailwindcss/vite`) + `global.css` (188 LOC) + generated tokens. Mobile: NativeWind 4 on Tailwind **3.4.17** with its own `tailwind.config.js` and a hand-rolled `theme.ts` — token divergence is structural.

### 5.2 Web component inventory

- `components/ui-kit/` (18 components, 1,796 LOC): InputBar (216), RecipeViews (268), MealLogCard (129), ChatMessage (154), WaterTracker, StreakCard, MacroCard, WorkoutCard, WorkoutSessionCard, NutritionSourceBadge (provenance chip), AnimatedNumber, StatChip, MilestoneCard, NarrativeCard, DailyGuidanceCard, CoachBubble, AgentBadge, StrideMark. Index barrel at `ui-kit/index.ts`.
- `components/primitives/` (15): Button, Card, Pill, IconButton, QuickChip, ProgressBar, Skeleton, Avatar, Markdown, ListRow, MacroLine, SuggestionChip, Clay3D, PixelAgent.
- `components/chat/cards/`: ChatTurnCards (432) + ConfirmationCard (304) + ChatTurnMessage (96) + useChatCardActions + cardSizing — the canonical card renderer, tested (470-LOC test file).
- `components/coach/`: LogConfirmCard (+test), ConfirmModal, EditLogModal, BarcodeModal (manual entry only).
- `components/layout/`: AppLayout, DesktopSidebar, RightPanel, PageHeader, NavTrigger, ThemeToggle, Brand.
- `components/home/`: AssistantConsole (627), QuickLogBar, SpecialistDock, NudgeInbox.
- Charts: `charts/MacroBars.tsx`, `MacroDonut.tsx` — hand-rolled; Recharts is in no package.json (README/AGENTS claim Recharts — stale).
- `components/mobile/MobileKit.tsx` — mobile tab bar emulation inside the responsive web app.

### 5.3 Mobile components

14 components (2,793 LOC app-wide): ChatPanel (307), ChatTurnCards (221 — port of web renderer), WaterTracker, MealLogCard, MacroCard/Summary, StreakCard, MilestoneCard, NarrativeCard, StatChip, AgentBadge, StrideMark, WorkoutSessionCard, Icon, plus `ui/` (Button, SegToggle, Pill, AppText) and `theme.ts`. **Duplication with web is near-total and manual**: MacroCard, MealLogCard, StreakCard, MilestoneCard, NarrativeCard, StatChip, WaterTracker, WorkoutSessionCard, AgentBadge, ChatTurnCards all have web twins with independent implementations. Mobile uses inline StyleSheet objects + Manrope font families rather than NativeWind classes in most components — NativeWind is configured but barely used.

### 5.4 Specific UI/UX observations

- **Polished**: chat card system (typed, validated, tested, persisted outcomes — genuinely best-in-class intent), web layout/motion system (page transitions, reduced-motion, AnimatePresence), provenance surfacing (NutritionSourceBadge, confidence/validation messages on cards), Sentry scrubbing, dark/light with system detection, greeting/time-window logic (useDailyWindow).
- **Rough**: `LandingPage` Showcase has a `_backup/` folder with old mock screens committed; mobile AddSheet is a facade (no modality implementations); mobile data is mock (`apps/mobile/data`); ProfilePage is a 956-LOC monolith mixing SettingsPage and ProfilePage exports; two Settings-ish pages (`App.tsx:25` imports both `SettingsPage` and `ProfilePage` from the same file); charts hand-rolled while docs claim Recharts; `docs/ui-kit` has a `_ds_needs_recompile` flag sitting unaddressed.
- **Accessibility**: vitest-axe is a dependency and `setup.ts` present, but only a subset of tests exercise it; mobile touches use haptics + pressable opacity, no accessible-name audit found; desktop sidebar/nav has a NavSheet a11y pattern (unverified depth).
- **Loading/empty/error states**: Skeleton primitive + web toasts + AppErrorBoundary exist; AssistantConsole and CoachPage have explicit pending/failed/retriable card states (result of the reliability branch). Mobile lacks error-state parity (ChatPanel handles only success/toast-less failure — 006 P2 finding).
- **PWA**: `claude/phase-4-pwa` branch (last commit 2026-07-17 "actually reload on user-confirmed SW update") not merged; main `index.html` has no manifest/SW registration. Vercel rewrite config is SPA-ready only.
- **Responsiveness**: web has a dedicated mobile kit (MobileTabBar, PUSH_PATHS/TAB_PATHS) — responsive web is a real target; native mobile is the weaker surface.

---

## 6. Git and project state

Local branches (last commit, intent):

| Branch | Last commit | Intent / status |
|---|---|---|
| `main` | 2026-07-18 · docs(plans): record P0 execution status | Stable baseline; PRs #36–39 merged (envelope, health-data honesty, observability, UX honesty) |
| `fix/chat-logging-reliability` ★ current | 2026-08-07 (+t3 checkpoints 09-18) · fix(chat): enforce session ownership | 29 commits of chat turn-claim/outcome durability work; **not merge-ready per plans/006** (6 P1 open) |
| `feat/mobile-app` | 2026-07-05 | Expo app bootstrap; partially merged into main? (mobile dir exists on current branch) |
| `claude/phase-4-pwa` | 2026-07-17 | Service worker + update flow; **unmerged** |
| `claude/phase-2-number-correctness` | 2026-07-17 | Adjusted macro target propagation; unmerged |
| `claude/phase-1-logging-flow` | — | logging flow phase |
| `claude/phase-3-date-unit-fixes` | 2026-07-17 | date/unit fixes; unmerged |
| `feat/pipeline-hardening` / `feat/pipeline-hardening-vercel-fix` | 2026-07-10 | parse-error rejection, relog vs retry; superseded by main merges |
| `fix/calorie-day-adjustment` (+ review-fixes) | 2026-07-11 | day adjustment fixes |
| `feat/beta-salvage`, `feature/onboarding-revamp`, `checkin-redesign`, `pr24/pr25-merge-main`, `backup/main-pre-untangle`, `backup/onboarding-pre-untangle` | — | backup/scrap branches |
| remotes | origin/claude/browser-mobile-ui-ux-inch8q, origin/feat/pipeline-features, origin/feature/quality-of-life-addons, origin/fix/chat-session-ownership | claude-generated branches |

Commit counts: main 191, current branch 220 (29 ahead + t3 checkpoint refs mixed in history). Recent commits are overwhelmingly `fix(chat)`/`test(chat)` — the last ~6 weeks of work were entirely chat-logging reliability.

**Uncommitted changes** (15 modified files, +622/−119; do not touch): ownership-aware logged-item hydration (`getActiveCanonicalLoggedItems` added in ai.ts, all card→loggedItem conversions now async + ownership-checked), undo mutations return canonical `turn` snapshots (actions_undo.ts:45,358,398), resolved-confirmation `reason`/`resolution` fields end-to-end (chat.ts `resolvedReason`, shared chat-turn.ts types, web+mobile renderers), truthful toast data in CoachPage (finiteNumber guards), 2 new root scripts (dev:all/dev:convex), +115 test lines (actions_confirm.test.ts, chat_concurrency.test.ts, ChatTurnCards.test.tsx). Untracked: `.scratch/`, `plans/006-…md`, `scripts/`, `t3.json`.

Plans inventory: `plans/001–004` (from 2026-06-13, all marked TODO — 001 ingredient breakdown now actually implemented in nutrition_draft; status table stale), `plans/005-beta-audit-dossier.md`, `plans/005-beta-release.md`, `plans/006` (OPEN). `docs/plans/`: IMPROVEMENT_PLAN.md, LANDING_SHOWCASE_PLAN.md, MOBILE_APP_PLAN.md, MOBILE_TODO.md (all stale vs current branch state). `prd/`: phase-1/2/3 + coach-agent batch + ui-revamp-mockup-v2 + issues/ui-revamp-v2-issues.md.

Stale docs: `AGENTS.md` (root; backend/frontend layout, bun commands, no pnpm workspace), `README.md` (backend/frontend layout, claims Recharts), `AI_CONFIG.md` (describes deleted Express backend, wrong model config location, 5-coach list vs 7), `PRODUCT.md` (advertises ⟦LOG_MEAL⟧ markers, removed), `docs/plans/*` (pre-reliability-branch), `plans/README.md` status table, `packages/backend/AGENTS.md`/`CLAUDE.md` (bun references, convex-ai block).

TODO/FIXME/HACK grep: **2 matches** in app code (`packages/backend/convex/ai.ts`, `apps/web/src/pages/ProfilePage.tsx`) — negligible; debt is tracked in plans/006 instead of inline markers.

---

## 7. Dependency and infra health

- **Duplicate/parallel deps**: `apps/mobile` convex 1.36 vs web 1.39 vs backend 1.36 (pin drift); tailwind v4 (web) vs 3.4.17 (mobile); `packages/backend` carries express 5/cors/@clerk/express/better-sqlite3/uuid — dead weight from the removed Express server (also `dev` script points at nonexistent `src/index.ts`).
- **Risky/outdated**: react-markdown 8 + remark-gfm 3 (2 majors behind; v8 has known ReDoS advisories fixed in 9+ — worth verifying), typescript ~6.0.3 in mobile vs 5.7 elsewhere (mobile on a TS version newer than web/backend — potential lib mismatches), @clerk/clerk-expo pinned exact 2.19.42, pnpm-workspace `allowBuilds` contains a non-boolean placeholder for react-native-svg.
- **Env vars**: web build-time `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY` (enforced by `apps/web/scripts/check-env.mjs` in prebuild), optional `VITE_SENTRY_DSN`, `VITE_APP_VERSION`/`VITE_COMMIT_SHA`; Convex dashboard: `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, optional `USDA_API_KEY`, `AI_CRONS_ENABLED`; root `.env.local` exists at repo root (untracked, 1.2KB). Mobile: `EXPO_PUBLIC_CONVEX_URL`/`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` injected into app.json extra at build time (placeholders currently committed — build step must substitute).
- **Secrets handling**: keys only in env/Convex dashboard; BYOK stored in plaintext in `user_settings.openRouterKey` (DB-stored third-party secret — acceptable for a hobby app, flag for scale); Sentry event scrubbing is unusually thorough (main.tsx:11-35).
- **Deploy**: Vercel (web, filtered workspace install, token CSS build step), Convex (dev deployment via `CONVEX_DEPLOYMENT` in backend/.env.local; functions pushed with `npx convex dev/deploy`), EAS configured but unproven (placeholders in app.json). No CI config found (no .github/workflows) — typecheck/tests run only locally.
- **Bundle signals**: no bundle-size tooling; heavy web deps are motion, gsap (3.15 — imported somewhere? `apps/web` has gsap dep but components use motion/react; possible unused dep), @sentry/react (full SDK), lucide-react. `docs/ui-kit/dist` and `Stride_Design_System` add repo weight but aren't shipped.

---

## 8. Ranked findings

1. [reliability] [critical] [M] Six open P1 chat-reliability findings (row ownership, takeover divergence, double context, Enter race, reconciliation trust, edit-vs-undo) — plans/006-chat-logging-reliability-findings.md — this branch is the product's core write path and its own review says "not merge-ready". Fix: finish the 006 work order (items 1–10) with the uncommitted diff as the base.
2. [accuracy] [critical] [M] UTC-date fallbacks in nearly every write path — packages/backend/convex/ai.ts:1392, meals.ts:159, gamification.ts:186-210, calibration.ts:90, behavior.ts:124 — any log without an explicit date lands on the wrong calendar day for non-UTC users. Fix: store IANA `userTimeZone` at onboarding and route all date resolution through `time_resolve.resolveActionDate`.
3. [accuracy] [high] [M] `timezoneOffsetMinutes` cannot express DST and is applied at arbitrary later times — schema user_settings + ai.ts:2489, 2387 — weekly-summary week-start and daily-insight local dates are wrong ±1h half the year. Fix: IANA tz string + Intl-based resolution.
4. [accuracy] [high] [S] `estimatePortion` trusts model-computed macro numbers verbatim — packages/backend/convex/ai.ts:2710-2726 — model arithmetic errors become persisted nutrition. Fix: always recompute macros from returned grams × per-100g deterministically.
5. [accuracy] [high] [M] No kcal↔macro plausibility cross-check on barcode/OCR/AI per-100g inputs — foods.ts cacheFood, ai.ts:2670 — mislabeled products propagate silently. Fix: apply the ±25% macro-plausibility rule as a validation flag, not just a prompt instruction.
6. [accuracy] [med] [S] Per-item rounding before summation in buildMealDraft — packages/backend/convex/nutrition_draft.ts:289-301 — ±0.5 kcal × ingredient-count drift, contradicts "numerically accurate" goal. Fix: sum unrounded values, round once at total.
7. [accuracy] [med] [S] `getBMR` silently substitutes a 70kg/170cm/30yo reference body — tdee_engine.ts:66-70 — every target for an incomplete profile is fiction presented as a plan. Fix: force plan recomputation prompt or mark plan provisional until weight/height/age/sex are known.
8. [accuracy] [med] [S] Streak logic exists in three divergent implementations, one UTC-based with a dead grace branch — gamification.ts:186-232, history.ts:171, apps/web/src/lib/streaks.ts — users see different streaks on different screens. Fix: single backend streak function; delete client legacy path.
9. [accuracy] [med] [S] Two diverging `computeNutrition` implementations with different rounding — nutrition_engine.ts:60 vs foods.ts:442 — future edits will silently desync. Fix: keep the engine version, import it in foods.ts.
10. [accuracy] [med] [S] `parseDurationMinutes` misreads unit-less decimals ("1.5" = 1.5 minutes) — calorie_engine.ts:238 — workouts logged as "1.5" burn ~4 kcal instead of ~600. Fix: heuristics for <24 values without unit → hours, or ask.
11. [accuracy] [low] [S] Insight prompt uses hardcoded default goal 2400 inconsistent with FALLBACK_TARGETS 2000 — ai.ts:2430 vs plan_resolve.ts:5. Fix: read from one constant.
12. [accuracy] [med] [S] USDA integration is optional and off by default; OFF is the only nutrition DB — foods.ts:245 — generic/cooked Indian foods (the app's clear focus) get poor OFF matches. Fix: enable USDA key + add FDC detail fetch and a quality score on cacheFood rows.
13. [reliability] [high] [S] Empty-string `clientSubmissionId` bypasses claim/dedup entirely — ai.ts:1903/4222 validators — duplicated turns and writes under retry storms. Fix: `v.string()` with minLength or normalize-empty-to-undefined at one boundary.
14. [reliability] [high] [S] `trimHomepageHistory` removes the last message positionally, not by submission ID — ai.ts:2940 — overlapping submissions corrupt model context. Fix: filter by `clientSubmissionId`/message id from the claim.
15. [reliability] [high] [S] Home Enter key bypasses the busy guard and shares one mutable submission-ID cell — AssistantConsole.tsx:291, InputBar.tsx:171, submissionId.ts — overlapping requests clobber each other's retry identity. Fix: disable on busy in InputBar onKeyDown + per-request submission IDs.
16. [reliability] [high] [S] Manual edits preserve `sourceActionId`, so stale chat Undo can tombstone newer user data — meals.ts:223, workouts.ts:312, actions_undo.ts:257. Fix: add row revision counter; undo requires revision match.
17. [reliability] [med] [S] Direct deletes (meal/workout/water/sleep/mood) bypass assistant-turn reconciliation — meals.ts:315, workouts.ts:350, wellness.ts:269/321/380 — transcripts show saved rows that no longer exist. Fix: route all deletes through the action-aware tombstone helper.
18. [reliability] [med] [S] AI-cost reservations leak when an action is killed — ai_guard reservations table + `releaseReservation` only called inside callAI — budget counter drifts high, eventually blocks all AI. Fix: expiry sweep in an existing hourly cron.
19. [reliability] [med] [S] `getMessages` and `getSessions` are unbounded collects — chat.ts:34/112 — long homepage sessions grow the subscription payload daily. Fix: limit + paginate.
20. [reliability] [med] [M] No CI (no .github/workflows), and typecheck/tests can't even run without manual installs — repo root — regressions land unnoticed between agent sessions. Fix: minimal GitHub Action: install, typecheck, vitest on PR.
21. [reliability] [med] [S] Memory-agent failures are swallowed (`catch(() => {})`) with no telemetry — ai.ts:4291 — a broken learning loop is invisible. Fix: record to action_telemetry or console structured event.
22. [sota] [high] [M] Mobile AddSheet modalities are decorative; mobile has no voice/camera/barcode — apps/mobile/app/(tabs)/nutrition.tsx:79-140 — the "effortless multi-modal" product promise is web-only. Fix: either implement expo-camera/expo-mic paths or remove the facade until ready.
23. [sota] [high] [M] No live barcode camera on web either — apps/web/src/components/coach/BarcodeModal.tsx:37 (manual entry only); plan 003 still TODO — barcode logging requires typing digits. Fix: BarcodeDetector/getUserMedia flow (plan 003 is already written).
24. [sota] [med] [M] Strength training burn ignores sets/reps/load entirely (steady-state MET model) — calorie_engine.ts:76 — the app stores rich structured sets but computes burn from duration+proxies only. Fix: volume-load-aware burn model or document as v2 engine work.
25. [ui] [high] [L] Three divergent design systems, only one automated — packages/shared/src/tokens.ts, docs/ui-kit (has `_ds_needs_recompile`), Stride_Design_System/ — web drifts from the design source, mobile already diverged. Fix: declare shared/tokens.ts the single source; delete or archive the other two.
26. [ui] [high] [L] Web↔mobile component duplication is ~14 hand-ported components — apps/mobile/components/* vs apps/web/src/components/ui-kit/* — every design fix is done twice with drift (already visible in ChatTurnCards). Fix: extract RN-safe logic/labels to @stride/shared; keep only thin platform renderers.
27. [ui] [med] [M] Mobile runs Tailwind v3/NativeWind while web runs v4, and barely uses NativeWind classes — apps/mobile/tailwind.config.js, components theme.ts — two styling mental models. Fix: pick one (v4 + nativewind v4 has support) or commit to StyleSheet theming.
28. [ui] [med] [S] PWA work exists but is stranded on `claude/phase-4-pwa` — no manifest/SW on main — offline/reliability goal unmet for the web app. Fix: rebase and merge the phase-4 branch.
29. [sota] [med] [S] Dead weight in backend package (express/cors/better-sqlite3/uuid, `dev` script points at missing src/index.ts) — packages/backend/package.json — confuses every future agent/session. Fix: prune deps and scripts.
30. [sota] [low] [S] Stale docs systematically mislead (AGENTS.md, README, AI_CONFIG.md, PRODUCT.md markers, docs/plans) — repo root — every restart session pays a re-discovery tax. Fix: one docs pass against current code, add doc-of-record pointers in AGENTS.md.

---

## 9. Open questions for the owner

1. **Target user device priority**: is the native mobile app (3.7k LOC, mock data, no modality implementations) a restart pillar or should web+PWA be the only surface for the next phase? This decides findings 22, 26, 27.
2. **Chat reliability branch disposition**: merge `fix/chat-logging-reliability` after finishing the 006 work order, or rebase the 29 commits onto main selectively? The uncommitted diff is coherent work-in-progress — should it be committed as-is first?
3. **Nutrition data strategy**: is USDA API key acquisition acceptable (paid tier beyond 2k req/hr for scale), and is Indian-food coverage (the unit-converter and prompt bias suggest it) the intended core market? This decides whether memory-first estimation is the primary accuracy strategy (findings 5, 12).
4. **Timezone model**: OK to add an IANA timezone field and require onboarding completion for target math (findings 2, 3, 7), or must the app work with no profile at all?
5. **Budget ceilings**: $0.25/day/user and $50/month global were set for a beta — what's the real budget envelope post-restart, and is BYOK-first (users bring OpenRouter keys) the intended default?
6. **Claude Sonnet 4.6 for chat replies**: cost is 20× gpt-4o-mini; is the reply-quality difference valued over rate-limit headroom (20 req/5min hits fast with Sonnet)?
7. **What is "state-of-the-art" for goal 1**: wearable integrations (explicitly out of scope in the canonical spec), voice-first logging, recipe/photo pipelines, or deeper coach memory? The current roadmap docs disagree.
8. **Check-ins/nudges/gamification**: three sizeable systems (checkins.ts 1,187 LOC, nudges, gamification) with thin UI presence — invest, freeze, or cut?
9. **`t3.json` and checkpoint refs** in git history: is t3 session tooling meant to stay in this repo, and should the `t3 checkpoint` commits be squashed out of the branch history before merge?
10. **Deployment reality**: is the Vercel+Convex deployment live with real users (beta dossier plans/005 suggests a beta), and is there production data that constrains schema changes like the timezone fields?

# Stride — First Public Beta Readiness Dossier (2026-07-18)

Repo: /Users/onkarj012/Projects/AI/stride (pnpm monorepo: apps/web = React 19 + Vite + Tailwind v4 on Vercel; packages/backend/convex = Convex backend; Clerk auth; AI via OpenRouter + Groq).
Audits ran on branch `feat/canonical-action-envelope` (= open PR #33).

## Repo / PR state (verified inline)

Open PRs, all MERGEABLE + CLEAN checks (Greptile + Vercel preview pass):
- #33 feat: canonical AI action pipeline (envelope, idempotency, undo, domain pipelines) — base main, +12165/−2056. CURRENT BRANCH.
- #31 fix(chat): single-step log confirm, race-free card ordering, multi-draft — base main, +1192/−101.
- #30 fix(nutrition): source targets from user's real plan (N1–N5) — base main, +589/−99.
- #32 fix(dates,units): local-day relogs, vessel units, single rounding (N6–N8, N10) — base = claude/phase-2-number-correctness (STACKED on #30), +499/−71.
- #29 feat(pwa): manifest, icons, service worker — base main, +2187/−16.
- #21 feat(mobile): Expo app — PARKED, ignore.
Overlap risk: #33 rewrote the AI logging pipeline; #31/#30/#32 touch the same chat/nutrition surfaces and predate it. Semantic conflicts likely even though git says mergeable.

Build/test state on #33 branch:
- Frontend: typecheck clean; production build passes (warning: chunk > 600 kB, no code splitting).
- Backend: 12 TS errors — 11 in test files, 1 real: `convex/recovery_draft.ts:184` (string | undefined).
- Tests: 230 pass, 3 FAIL in `convex/derived_state.test.ts` (undo rebuilds streak/XP; delete+relog counts; memory undo independence). PR #33 not shippable as-is.

## Audit 1 — Security / auth / abuse (top findings)

1. Unauthenticated AI billing paths: `ai.ts:871,894,928,2296,2372,2419` (OpenRouter) and `ai.ts:2515` transcribe (Groq) run without identity check. `foods.ts:275,380` unauthenticated + mutate shared food cache. `profile.ts:135` calculateTDEE unauthenticated action.
2. NO rate limiting, per-user quota, or input-size caps on ANY AI endpoint. `ai/llm.ts:37-56` retries up to 4×, unbounded payloads. Chat (`ai.ts:1154`, `ai.ts:2577`) uncapped message/image/history, multiple LLM calls per request. Cost-blowup risk #1 for public beta.
3. LLM-derived writes: `ai.ts:1888-1950` auto-writes candidates ≤ AUTO_WRITE_MAX_ACTIONS without confirmation; `agents.ts:97-124` memory agent silently persists LLM-extracted facts with weak validation. Prompt-injection → data writes.
4. `foods.ts:19` hardcoded USDA `DEMO_KEY` (shared public credential, exhaustible).
5. `calibration.ts:57` no ownership check on workoutId.
6. No secrets committed; VITE_/EXPO_PUBLIC_ values are public identifiers (OK).

## Audit 2 — Deploy / env / observability (top findings)

1. No production environments wired: `packages/backend/.env.local` targets `dev:quirky-hummingbird-822`; `apps/web/.env.local` points at same dev Convex URL. No `convex deploy` production workflow/script (`packages/backend/package.json:10`).
2. No React error boundary, no window error/unhandledrejection capture, no Sentry/error reporting anywhere (`main.tsx:21`).
3. Silent failures: `App.tsx:47` ensureUser console.error-only; `OnboardingPage.tsx:41` AI parse swallowed; `CoachPage.tsx:611` fire-and-forget delete; `ProfilePage.tsx:762` clearAllData un-awaited; `WaterTracker.tsx:23` void'd async; backend `meals.ts:134`, `workouts.ts:342`, `agents.ts:127` swallow write failures.
4. Env-var failure modes: missing VITE_ vars throw only in browser at runtime (blank app, deploy still green); missing OPENROUTER/GROQ keys fail only on feature use; USDA silently degrades to DEMO_KEY.
5. Crons: daily insights 06:00 UTC, weekly Mon 07:00 UTC, hourly nudges. `ai.ts:2058,2137` cron fan-out one scheduled action per active user, unbounded/no batching.
6. `vercel.json:2` installs entire workspace incl. Expo/mobile for a web-only deploy.
7. PWA absent on this branch (manifest/SW live in unmerged PR #29).

## Audit 3 — First-run UX (top findings)

1. Blank signed-in shell while onboarding/profile guard loads (`App.tsx:59`); ensureUser failure = permanently blank.
2. Onboarding: no error/retry on plan calculation (`OnboardingPage.tsx:213`); refresh loses whole form, no back button (`:146`); NL parse failures silent (`:38`).
3. Fabricated first-run data: RightPanel hardcoded "72%" weekly adherence + fake bars (`RightPanel.tsx:44,119-140`); InsightsPage hardcoded macro targets contradicting user plan (`InsightsPage.tsx:420`).
4. Loading rendered as empty data everywhere: Home brief (`HomePage.tsx:96`), meals (`NutritionPage.tsx:93`), workouts (`WorkoutsPage.tsx:96`), Insights (`:375`), History (`:414`), Coach sessions (`:100`).
5. Mobile-web: Nutrition add-modality buttons (Voice/Photo/Barcode/Label) all open same generic Coach nav (`NutritionPage.tsx:78`); mobile Settings missing most desktop settings (`ProfilePage.tsx:884`); fake "9:41" status bar chrome in MobileKit (`MobileKit.tsx:19`).
6. Copy: "v0.3" footer, "Ask Stride" vs assistant self-naming "Stry", diagnostic labels ("unknown source", "state: unknown") in History, shorthand labels in onboarding form.

## Audit 4 — Data integrity / AI pipeline (top findings)

1. Fabricated values remain: `useLogs.ts:105-122` missing nutrition → 0kcal logged as real; `:143-145` missing water → invented 250ml; `ai/parse.ts:100-113,342-400` workout fallbacks 5 kcal/min + 70kg default weight; `foods.ts:80-123` missing food macros coerced to 0; zero-calorie meal confirmable without parseError (`ai.ts:1501-1512`).
2. Validation gaps: optional reported/estimated calorie fields bypass range checks (`meals.ts:92-117`, `workouts.ts:137-165`); no upper bounds on draft ingredient/exercise values (`nutrition_draft.ts:210-248`, `workout_draft.ts:211-417`); profile allows zero/implausible weight (`profile.ts:93-128`); calorie-source switch patches without revalidation (`meals.ts:298-310`).
3. Timezone splits persist: RightPanel logs local-date vs streaks UTC; meals/workouts/wellness default to server UTC when date omitted; chat actions mix client-local dates with server times (`ai.ts:1581,1718,1758`).
4. Idempotency/undo gaps: water writes have no idempotency key (`wellness.ts:43-55`) and frontend calls mutation directly; hard deletes bypass action records (`meals.ts:315-323` etc.); undo excludes weight_logs (`actions_undo.ts:10-16`); weight check-in writes profile+weight_logs outside action envelope (`checkins.ts:951-973`).
5. Cost robustness: no request-wide AI budget; one message can fan out per-item LLM parses + tier-2 call uncapped (`ai.ts:2856-2901`); history capped at 40 messages but no per-message size cap; food fetches lack abort timeouts (`foods.ts:309-325`).

## Standing constraints

- Main Claude session = orchestrator only; all code via delegated agents (codex sol/luna for spec'd builds, Fable/Opus for taste/review).
- Convex is the only backend. Mobile parked. User verifies UI himself.
- Recent merged work (PRs #24-28): pipeline hardening, check-in redesign, calorie-day adjustment, near-dup detection — don't re-plan what's merged.

# Stride — First Public Beta Release Plan

> Produced 2026-07-18. Audits: 4× gpt-5.6-luna (security/abuse, deploy/observability, first-run UX, data integrity) on branch `feat/canonical-action-envelope` (PR #33). Plan synthesis: gpt-5.6-sol. Findings dossier: `plans/005-beta-audit-dossier.md`.
> Orchestrator rule applies: all code via delegated agents, separate branch/PR per workstream.

## 1. MERGE STRATEGY

Merge order: **#33 → #31 salvage → #30 salvage → #32 salvage → close #29**. Do not merge any predecessor wholesale after #33 establishes the canonical pipeline.

| Order | PR | Decision | Release treatment |
|---:|---|---|---|
| 1 | **#33 canonical action envelope** | **Rebase + re-verify** | First fix `convex/recovery_draft.ts:184`, all 11 test-file TS errors, and the 3 failing `convex/derived_state.test.ts` cases. Then rebase once onto current `main`; require zero TS errors, all 233 backend tests passing, frontend typecheck, and production build. |
| 2 | **#31 logging flow** | **Cherry-pick salvage, then close** | Port its behavioral tests and only missing single-confirm, multi-draft, ordering, and rollover fixes onto post-#33 code. Do not merge its older `ai.ts`, `LogConfirmCard.tsx`, or `AssistantConsole.tsx` implementations, which #33 also rewrote. |
| 3 | **#30 real-plan targets** | **Cherry-pick salvage, then close** | Port canonical target calculations and regression tests onto post-#33 `main`. Reimplement against current `goals.ts`, `insights.ts`, `progress.ts`, `workouts.ts`, `InsightsPage.tsx`, and `NutritionPage.tsx`; do not merge the predecessor branch wholesale. |
| 4 | **#32 dates/units** | **Cherry-pick salvage, then close** | Process strictly after #30 salvage because #32 is stacked on #30. Port its local-day, unit-resolution, and single-rounding tests/fixes onto the resulting baseline. |
| 5 | **#29 PWA** | **Close** | Do **not** ship PWA in beta v1. Service-worker caching expands rollback and stale-client risk while `main.tsx` and deployment/error handling are still changing. Recreate it later as a small P2 PR from final `main`. |

## 2. WORKSTREAMS

1. **Canonical baseline stabilization — existing PR #33**

   - **Goal:** Make the new action pipeline the trustworthy merge base.
   - **Findings:** `convex/recovery_draft.ts:184`; 11 test-file TS errors; 3 failures in `convex/derived_state.test.ts` covering streak/XP rebuild, delete-and-relog counts, and memory-undo independence.
   - **Acceptance:** Backend and frontend typechecks clean; 233/233 backend tests pass; production build passes; confirmation, deletion, relog, and undo regressions are explicitly covered.
   - **Size:** L
   - **Dependencies:** None; blocks every other coding workstream.

2. **Public API and AI cost shield — one new branch/PR**

   - **Goal:** Prevent anonymous billing, cross-user access, and unbounded provider spend.
   - **Findings:** `ai.ts:871,894,928,2296,2372,2419,2515`; `foods.ts:275,380`; `profile.ts:135`; `calibration.ts:57`; `ai/llm.ts:37-56`; `ai.ts:1154,2577,2856-2901`; `foods.ts:19,309-325`; cron fan-out at `ai.ts:2058,2137`. The audit found no committed secrets.
   - **Acceptance:** Every billable endpoint requires server-derived identity; ownership is checked; endpoint-weighted per-user token buckets, concurrency leases, payload/history/image caps, request-wide LLM-call/token budgets, daily user/global fuses, and `429` responses exist; vendor fetches time out; USDA requires a private key or is visibly disabled. AI crons remain off for beta until batched and budgeted.
   - **Size:** L
   - **Dependencies:** Workstream 1.

3. **Truthful numbers and local-day semantics — one new branch/PR**

   - **Goal:** Never invent health data or silently accept implausible values.
   - **Findings:** `useLogs.ts:105-122,143-145`; `ai/parse.ts:100-113,342-400`; `foods.ts:80-123`; `ai.ts:1501-1512,1581,1718,1758`; `meals.ts:92-117,298-310`; `workouts.ts:137-165`; `nutrition_draft.ts:210-248`; `workout_draft.ts:211-417`; `profile.ts:93-128`; UTC/local-date splits across RightPanel, meals, workouts, wellness, and chat; hardcoded targets at `InsightsPage.tsx:420`. Includes #30 salvage followed by #32 salvage.
   - **Acceptance:** Missing values remain unknown; zero-calorie or unresolved-unit drafts cannot be confirmed; all write and patch paths share plausible bounds; targets come from the user’s validated plan; rounding occurs once; client local date/time is validated and used consistently around midnight.
   - **Size:** L
   - **Dependencies:** Workstream 1; #30 salvage precedes #32 salvage.

4. **Canonical writes, confirmation, and undo — one new branch/PR**

   - **Goal:** Ensure every domain-changing action is intentional, idempotent, attributable, and reversible.
   - **Findings:** LLM auto-writes at `ai.ts:1888-1950`; silent memory persistence at `agents.ts:97-124`; water idempotency gap at `wellness.ts:43-55`; hard-delete bypass at `meals.ts:315-323` and equivalent paths; missing weight undo at `actions_undo.ts:10-16`; check-in writes outside the envelope at `checkins.ts:951-973`. Includes #31 behavioral salvage.
   - **Acceptance:** LLM-derived domain writes require explicit confirmation; silent memory writes are disabled for beta; all supported writes, deletes, water logs, and weight check-ins use the canonical envelope and idempotency keys; undo restores derived state and covers `weight_logs`; multi-draft ordering remains deterministic.
   - **Size:** L
   - **Dependencies:** Workstream 1; integrates after #31 salvage review.

5. **Trustworthy first run and mobile-web essentials — one new branch/PR**

   - **Goal:** Let a stranger sign up, onboard, and log without blank, fake, or misleading UI.
   - **Findings:** `App.tsx:47,59`; `OnboardingPage.tsx:38,41,146,213`; fake adherence at `RightPanel.tsx:44,119-140`; empty-data loading at `HomePage.tsx:96`, `NutritionPage.tsx:93`, `WorkoutsPage.tsx:96`, `InsightsPage.tsx:375`, `HistoryPage.tsx:414`, `CoachPage.tsx:100`; misleading modality routing at `NutritionPage.tsx:78`; incomplete mobile settings at `ProfilePage.tsx:884`; fake status chrome at `MobileKit.tsx:19`; “v0.3,” “Ask Stride”/“Stry,” diagnostic labels, and onboarding shorthand.
   - **Acceptance:** No blank authenticated shell; ensure-user and onboarding failures show recovery; onboarding survives refresh and supports back navigation; loading is distinct from empty; fabricated metrics are removed; unsupported modalities are hidden or honestly labeled; core flows work at a 360px viewport; product name and customer-facing copy are consistent.
   - **Size:** L
   - **Dependencies:** Workstreams 3 and 4. Core mobile usability gates launch; broader mobile polish and settings parity do not.

6. **Production configuration and minimum observability — one new branch/PR**

   - **Goal:** Make production failures detectable, attributable, and recoverable.
   - **Findings:** dev-only configuration and missing deployment workflow at `packages/backend/package.json:10`; missing boundary/reporting at `main.tsx:21`; silent failures at `App.tsx:47`, `OnboardingPage.tsx:41`, `CoachPage.tsx:611`, `ProfilePage.tsx:762`, `WaterTracker.tsx:23`, `meals.ts:134`, `workouts.ts:342`, `agents.ts:127`; runtime-only env failures; full-workspace Vercel install at `vercel.json:2`; production chunk above 600 kB.
   - **Acceptance:** Build/startup validates required environment variables; React error boundary and global rejection capture exist; Sentry receives environment, release, route, and pseudonymous-user context with source maps; backend/AI calls emit structured error, latency, provider, token, and cost signals; destructive async operations are awaited and recoverable; Vercel builds only the web app.
   - **Size:** L
   - **Dependencies:** Workstream 1; must land before production provisioning.

7. **Installable PWA fast-follow — replacement for #29**

   - **Goal:** Add installation and safe service-worker updates after beta stability.
   - **Findings:** PWA absent from the audited branch; manifest/service worker exist only in #29.
   - **Acceptance:** Fresh branch from final `main`; no automatic activation reload; user-confirmed updates; rollback-tested cache versioning; assets constrained from oversized precache; install verified on iOS and Android.
   - **Size:** M
   - **Dependencies:** Workstream 6 and at least one stable beta release.

## 3. PRIORITY TIERS

**P0 — cannot open beta without**

- **Workstream 1:** #33 must compile and pass all regressions; knowingly shipping a broken undo/derived-state baseline invalidates every later fix.
- **Workstream 2:** Rate limiting is **P0** because authenticated strangers can otherwise create unbounded OpenRouter/Groq spend; use weighted per-user buckets, concurrency and payload caps, daily/global fuses, and keep AI crons off.
- **Workstream 3:** Fabricated nutrition, water, workout, or date values directly corrupt the product’s core promise.
- **Workstream 4:** Unconfirmed LLM writes, duplicate actions, and incomplete undo can silently alter user health records.
- **Workstream 5 P0 slice:** Signup/onboarding recovery, honest loading, removal of fake data, consistent copy, and usable core mobile logging must ship because these are first-session trust failures.
- **Workstream 6 P0 slice:** Production env validation, error boundary, Sentry, structured AI telemetry, and awaited destructive operations are the minimum viable observability needed to detect and diagnose a stranger’s failure.

**P1 — first week of beta**

- Finish mobile settings parity and deeper responsive polish beyond signup, onboarding, logging, history, and profile basics.
- Re-enable insight/nudge crons only after batching, per-run caps, budget accounting, and operational review.
- Add richer product analytics and funnel dashboards beyond error, latency, and cost telemetry.
- Split the >600 kB frontend chunk and finish non-critical silent-failure cleanup.
- Implement real specialized photo/barcode/label flows if beta feedback validates demand; P0 only requires hiding or honestly labeling unsupported controls.
- Reintroduce memory automation only with explicit product consent, strict validation, and independent undo behavior.

**P2 — fast-follow**

- Replace #29 with Workstream 7; PWA does **not** ship in beta v1.
- Add offline behavior, background synchronization, and broader install-platform polish only after rollback-safe service-worker behavior is proven.

## 4. LAUNCH CHECKLIST

1. Freeze the release SHA after all P0 PRs land; record rollback SHA and prohibit direct production-branch changes.
2. Create the Clerk production instance; configure production domains, redirect URLs, allowed signup policy, JWT template/audience, and Convex issuer.
3. Create the Convex production deployment; set `CLERK_JWT_ISSUER_DOMAIN`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, USDA key, rate/cost limits, and beta feature flags; leave AI crons disabled.
4. Deploy the pinned backend SHA with `convex deploy`; verify schema/index completion, auth identity mapping, and that no production URL references `dev:quirky-hummingbird-822`.
5. Create the Sentry production project; configure DSN, auth token/source-map upload, release/environment tags, PII scrubbing, alerts, and the incident recipient.
6. Configure the Vercel production project for `apps/web`; wire production `VITE_CONVEX_URL`, Clerk publishable key, Sentry variables, and any required build-time flags; ensure preview variables remain isolated.
7. Configure OpenRouter and Groq hard spending limits/low-balance alerts; add internal per-user daily/monthly and global beta ceilings with an owner-notification path.
8. Deploy the pinned web SHA to Vercel; verify canonical domain, HTTPS, Clerk redirects, CSP/CORS expectations, and that no production request reaches development Convex.
9. Run the written smoke script in a clean desktop browser and a 360px mobile viewport: stranger signup, onboarding, refresh recovery, meal/workout/water/weight logging, multi-draft confirmation, edit/delete/relog/undo, local-midnight date, AI chat, transcription if enabled, rate-limit response, logout/login, and account-data clearing.
10. Confirm the smoke user’s Convex records, action envelopes, idempotency keys, derived state, Sentry canary event, AI cost telemetry, and provider billing totals.
11. Exercise rollback once: redeploy the recorded prior frontend/backend release, verify compatibility, then restore the approved release.
12. Open the invite cohort, monitor errors and AI spend live for the first hour, and pause invitations on any P0 invariant breach.

## 5. RISKS & OPEN QUESTIONS

- Owner approval: launch beta v1 as **invite-gated**; open signup is out until abuse and support data are known.
- Approve explicit AI ceilings per user and globally; proposed starting point is $0.25/user/day, $3/user/month, and $50 total beta spend/month.
- Decide which countries and units beta officially supports; unsupported USDA coverage or measurement systems must be stated.
- Approve the production retention, export, account-deletion, privacy-policy, and terms-of-use rules before collecting health data.
- Decide whether error reports may include redacted prompts; default should exclude message, image, nutrition, and health-record content.
- Name one incident owner with authority to disable AI, close invitations, roll back, and communicate with testers.
- Approve AI insight/nudge cron activation separately; the launch default is **off**.
- Decide the provider-outage experience: read/write tracking should remain available while AI features fail closed with a clear retry message.



## 6. OWNER DECISIONS (approved 2026-07-18)

- Merge strategy approved as-is (incl. closing #29; PWA is P2).
- Beta is invite-gated.
- AI ceilings: $0.25/user/day, $3/user/month, $50 global/month; in-app metering + provider hard caps.
- Execution started with Workstream 1 (stabilize PR #33).

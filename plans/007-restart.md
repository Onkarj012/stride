# 007 — Stride restart plan

Status: APPROVED DESIGN, execution not started
Date: 2026-09-18
Owner: Onkar Jadhav
Inputs: `plans/007-restart-codebase-report.md` (GLM 5.3 flash audit), `plans/007-restart-stack-research.md` (qwen3.8-max research), four grilling rounds with owner.
Supersedes: `plans/005-beta-release.md`, `plans/006-chat-logging-reliability-findings.md`, `docs/plans/*`, `prd/*`.

## 1. Goals

1. State-of-the-art fitness tracking: nutrition, strength, weight, adaptive energy expenditure.
2. Reliable: every log lands once, on the right day, and is editable and undoable.
3. Accurate: numbers come from verified food databases and deterministic math. AI parses, never estimates macros.
4. Best-in-class UI: animated, fun, mobile-first. Existing "Sunday yoga" design language kept, execution tightened.

Constraints: solo dev, ~10 hrs/week, 2-week slices. Owner on Android. Zero prior mobile experience. Personal use first, 2-3 family later. Data can be reset. All code via delegated agents (orchestrator rule in `CLAUDE.md`).

## 2. Decisions (settled)

| # | Decision | Choice |
|---|---|---|
| D1 | In-flight branch | Commit uncommitted work, merge `fix/chat-logging-reliability` as-is. Open P1s marked superseded by rewrite. No polish on code slated for deletion. |
| D2 | Primary surface | Android mobile (Expo). Web frozen, later retargeted as desktop analysis view. Separate React app, shares `core` + tokens only. |
| D3 | Accuracy source | USDA FDC (SR Legacy + Foundation) + IFCT 2017 + Open Food Facts barcodes. AI maps text to DB entries. Owner-editable Indian household measures. |
| D4 | Tracking scope v1 | Nutrition + workouts + weight trend + adaptive TDEE + strength engine (library, sets, e1RM, weekly volume). Wearables v1.5 via Health Connect, read-only steps + sleep. |
| D5 | Logging paradigm | One global input bar (text/voice/photo/barcode). AI extracts structured draft, deterministic matcher resolves, confidence gate auto-commits or asks. Ledger is truth, chat is a view. |
| D6 | Rebuild vs evolve | Keep Convex, Clerk, tests, food memory ideas. Rewrite AI pipeline, ledger schema, mobile app. Delete chat-transcript-as-ledger machinery. |
| D7 | Auto-apply | Auto-commit when every item: match score ≥ 0.85, portion resolved, no clamp flags. Else draft card. 10 s undo toast, edit anytime. Photo items badged "estimated". |
| D8 | Corrections | Chat edits ledger rows via tool calls `add / edit / delete`. Every mutation is a new revision row. Undo = revert revision. |
| D9 | Food DB hosting | Import curated subset into Convex tables. OFF fetched per barcode and cached. On-device SQLite is v2. |
| D10 | Portion model | AI outputs `{food, quantity, unit}` only. Grams resolved from `food_portions`. Seed katori 150 ml, roti 40 g, bowl, plate, glass, ladle, piece. |
| D11 | Adaptive TDEE | EMA α=0.1 weight trend, 14-28 day least-squares slope, `TDEE = meanIntake − slope × 7700`. Gate: ≥14 days, ≥10 weigh-ins, ≥70% days logged. Clamp 0.75-1.3× Mifflin. Recompute daily, targets update weekly. Manual morning weight prompt. |
| D12 | Chat model | Multi-chat like ChatGPT/Claude. Each chat has own context and attachments. Chat list, new chat, delete. Model context per turn: chat history + today's entries + user foods. |
| D13 | AI models | OpenRouter only. `openai/gpt-5.6-luna` for extraction, chat, tools. Photo: luna if vision works, else `google/gemini-3.8-flash`. Voice: Groq Whisper. |
| D14 | Tools | Hybrid. Single-shot extraction, server matches. Model gets `search_food`, `lookup_barcode`, `get_portion_weights`, `get_user_foods`, `recent_entries` only when matcher returns unresolved. |
| D15 | Timezone | IANA `timeZone` on user settings, captured at onboarding, refreshed each session. All dates through one resolver. |
| D16 | Meal slots | Inferred: <11 breakfast, 11-16 lunch, 16-19 snack, >19 dinner, local time. Model may override from text. Editable. |
| D17 | Home tabs | Today, Log (calendar history), Progress (weight, TDEE, strength), Coach (chats). Global input bar. Revisable after UI review. |
| D18 | Kill list | Delete: check-ins, nudges, gamification/XP/streaks, 7 specialist coaches, daily/weekly narrative crons, recipes (back in v1.5 as saved meals), landing showcase, BYOK keys, session titles, homepage sessions, Express/sqlite deps. |
| D19 | Monorepo | `apps/mobile`, `apps/web`, `packages/backend`, `packages/core` (pure TS math, zero deps, property-tested), `packages/ui-tokens`. `packages/shared` folds into `core`. |
| D20 | Styling | `tokens.ts` single source. Web: Tailwind v4 `@theme`. Native: StyleSheet from same object (NativeWind v5 is RC, skip). |
| D21 | Mobile stack | Expo SDK 57, expo-router, Reanimated 4.5, Skia 2.12, no Moti. Dev build over USB via Android Studio SDK + ADB. EAS internal APK for family. iOS via simulator later. |
| D22 | Reliability bar | Property tests on `core` against known FDC values. Pipeline tests on backend. Manual UI check. Sentry + PostHog. E2E deferred. |
| D23 | CI | GitHub Action: install, typecheck, vitest on PR. |
| D24 | Docs | Archive `docs/plans`, `docs/ui-kit`, `docs/stride-ui-kit`, `Stride_Design_System`, `prd/`, old plans to branch `archive/pre-restart`, delete from main. Rewrite AGENTS.md, README, PRODUCT.md. Delete AI_CONFIG.md. |
| D25 | Plan artifact | Markdown only. |

## 3. Target architecture

### 3.1 packages/core (pure TypeScript, zero runtime deps)

- `nutrition/compute.ts`: per-100g × grams, single rounding at total. One implementation.
- `nutrition/units.ts`: mass, volume × density, household measures. Unknown → unresolved, never guessed.
- `nutrition/match.ts`: candidate scoring (exact 1.0, prefix 0.88, contains 0.78, token Jaccard). Threshold and runner-up gap as exported constants.
- `nutrition/gate.ts`: confidence gate, exported thresholds.
- `energy/bmr.ts`: Mifflin-St Jeor, Katch-McArdle. No silent fallbacks, returns `null` on missing input.
- `energy/adaptive_tdee.ts`: D11 algorithm.
- `energy/workout_burn.ts`: net MET × kg × h, existing modifiers ported, constants cited.
- `strength/e1rm.ts`: Epley + Brzycki, weekly volume per muscle.
- `time/local_day.ts`: IANA date bucketing, slot inference.
- Tests: property tests, golden values from FDC rows, DST boundary cases.

### 3.2 packages/backend (Convex 1.46)

Tables:

- `users`, `user_settings` (timeZone, units, goal, sex, height, dob, activity)
- `foods` (name, aliases, per100g nutrients, source: fdc|ifct|off|user, sourceId, verified)
- `food_portions` (foodId, measure, grams, source)
- `user_measures` (userId, measure, ml or grams)
- `entries` (userId, localDate, timeZone, slot, foodId, grams, snapshot nutrients, source: db|barcode|ai|memory, confidence, flags, revision, supersedes, createdBy: user|ai, chatId, messageId, deletedAt)
- `workouts`, `sets` (exerciseId, reps, weightKg, rpe, revision)
- `exercises` (free-exercise-db seed)
- `weights` (userId, localDate, kg)
- `tdee_snapshots` (userId, date, estimate, trendKg, windowDays, confidence)
- `chats`, `messages` (chatId, role, text, attachments, toolCalls, draftIds)
- `drafts` (pending extraction awaiting confirmation)

Functions: entries CRUD with revision, day summary via `@convex-dev/aggregate`, extraction action, tool-call action, barcode lookup with OFF cache, weight log, tdee recompute cron (daily, deterministic, no LLM).

### 3.3 Extraction pipeline

1. Input → (voice: Groq Whisper) → text, or image.
2. luna structured output: `[{food, quantity, unit, slot?, date?}]`.
3. Matcher: user foods → memory → `foods` search. Score per item.
4. Portion resolver: unit → grams via `food_portions` / `user_measures` / density.
5. Compute nutrients in `core`.
6. Gate: all resolved → commit entries, return card with undo. Else → `drafts` row, card asks.
7. Unresolved items → second luna call with tools enabled.
8. Corrections in chat → luna tool calls `edit_entry / delete_entry / add_entry` → new revision rows.

### 3.4 apps/mobile

expo-router tabs per D17. Screens: Today, Log, Progress, Coach (chat list + chat), Settings, Onboarding. Global `InputBar` component with text, mic, camera, barcode. Skia for rings and sparkline. Reanimated for cards and sheets.

### 3.5 apps/web

Frozen until slice 10. Then retargeted to new entries API: log + day view + Progress charts on desktop layout.

## 4. Slices

Each slice: one branch, one PR, agent-implemented, owner reviews. Two weeks nominal.

| Slice | Deliverable | Depends | Agents |
|---|---|---|---|
| 1 | Commit + merge current branch. Archive docs to `archive/pre-restart`. Delete kill list code and dead deps. CI action. Rewrite AGENTS.md/README/PRODUCT.md. | — | Codex luna (mechanical) |
| 2 | `packages/core` with all modules + tests. Food DB import scripts: FDC SR Legacy + Foundation + portions, IFCT CSV, exercises. Seed Indian measures. | 1 | Codex luna |
| 3 | New Convex schema, entries API with revisions, tz resolver, aggregate day totals, weight log, migrations wipe. | 2 | Codex luna |
| 4 | Extraction pipeline: luna structured output, matcher, portion resolver, gate, drafts, tools, chat corrections. Pipeline tests. | 3 | Codex luna, review by luna |
| 5 | Mobile foundation: Expo 57, expo-router, tokens → StyleSheet, Clerk auth, Android dev build, setup wizard for Android Studio + ADB. Design-directions run on Today screen. | 1 (parallel with 2-4) | Codex luna + Opus for design |
| 6 | Mobile log flow: InputBar (text, voice, photo, barcode), draft card, undo toast, Today screen, Log calendar. | 4, 5 | Codex luna, Opus UI review |
| 7 | Weight prompt, adaptive TDEE cron, Progress tab (trend, expenditure, targets). | 3, 6 | Codex luna |
| 8 | Strength: exercise picker, set logging, e1RM, weekly volume charts. | 6 | Codex luna |
| 9 | Polish: motion pass, empty/loading/error states, onboarding, Sentry + PostHog, EAS internal APK. | 6-8 | Opus UI, Codex luna |
| 10 | Web retarget: minimal desktop log + day view + Progress. | 7 | Codex luna |

v1.5 backlog: saved meals (recipes), Health Connect steps + sleep, program templates + progressive overload, on-device SQLite offline, iOS build.

## 5. Acceptance per goal

- Accuracy: any entry's kcal reproducible from `foods` per-100g × grams in `core` tests. Zero AI-produced macro numbers persisted. Day totals equal sum of unrounded entry values rounded once. Local date correct across IST midnight and DST cases in tests.
- Reliability: same submission id twice → one entry. Every mutation has revision row. Undo restores prior revision. No unbounded queries.
- SOTA: text, voice, photo, barcode all functional on Android. Adaptive TDEE updates after 14 days of owner data.
- UI: Today screen passes owner review against design-directions mockup. 60 fps on owner's phone for rings and sheets.

## 6. Open items (not blockers)

- luna vision support unconfirmed; verify in slice 4, fallback Gemini 3.8 flash.
- IFCT license is personal-use only; do not redistribute dataset.
- free-exercise-db images are bodybuilding.com derived; use wger CC images or none.
- Tab layout D17 revisable after slice 6 review.

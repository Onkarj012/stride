# Deep Dive — Logging UX, Number Correctness, and Release Readiness

Date: 2026-07-11
Method: three read-only exploration agents (chat/logging flow · numeric pipeline · mobile + docs audit). No code was changed in this run. All findings verified against source with file:line references.

---

## Executive summary

The three reported symptoms — **confirm card appears before the text**, **card doesn't disappear after confirming**, **numbers are wrong** — are all real, all have identified root causes, and none of them require a redesign to fix. They are concentrated in two places:

1. **The Home logging flow** (`AssistantConsole.tsx` + `ai.ts homepageInput`) has an architectural race plus a hidden two-step confirm that reads as broken.
2. **Three display surfaces** (`NutritionPage`, `InsightsPage`, weekly progress chart) show targets from hardcoded constants or stale sources instead of the user's actual plan — so the same day shows different numbers on different screens.

On the distribution question: **`apps/mobile` (Expo) is a design prototype, not an app** — 100% static data, no auth, no backend, scripted fake chat. Meanwhile the web app already has the hard mobile-web plumbing done (dvh, safe-area insets, visualViewport keyboard pinning) and is missing only a manifest + icons + service worker to be installable. **PWA-first is the cheap path to "on the phone, not in a browser tab."**

---

## Part 1 — Logging flow: root causes for the reported symptoms

### Symptom: "Confirm card appears before the assistant's text" — root cause found (high confidence)

The card and the text travel on **two independent channels that race**:

- The assistant text is written to `chat_messages` server-side (`packages/backend/convex/ai.ts:1805-1808`) and reaches the client via the reactive `useQuery(api.chat.getHomepageMessages)` subscription (`apps/web/src/components/home/AssistantConsole.tsx:205`).
- The confirm-card data is set **synchronously the instant the action promise resolves** (`AssistantConsole.tsx:450-453`), with no dependency on the message query having caught up.

Convex gives no guarantee the subscription has delivered the new message by the time the action returns, so the card frequently renders first. The client-side fake typewriter (`useTypewriter.ts`, ~18ms/char) makes it worse: even when both arrive together, the text visibly "types" for 1–4s while a fully interactive card already sits on screen.

### Symptom: "Card doesn't disappear after confirming" — root cause found (high confidence)

It's a **hidden two-tier confirm**. The first card (`AgentActionCard`, `AssistantConsole.tsx:593-618`) has a "Confirm" button that saves nothing — it promotes the draft into `pendingDrafts`, which immediately renders a **second, visually similar card** (`LogConfirmCard`, `AssistantConsole.tsx:740-756`). Only the second card's Confirm actually calls the mutation. To the user this reads exactly as "I confirmed and the card is still there."

**Worse — silent data loss:** `openDraft` replaces the whole `pendingDrafts` array with one item (`AssistantConsole.tsx:531-535`) and clears all `agentActions` (`:607`). If one message logs multiple items ("30 min run and a litre of water" — a scenario in the backend's own few-shot prompt, `ai.ts:1475-1476`), confirming the first draft **silently discards every other one**, with no toast and no recovery.

There is **no server-side draft record at all** — no drafts table, no status field (`schema.ts:136-150` has only chat_sessions/chat_messages). The whole draft lifecycle lives in ephemeral client state mirrored into a sessionStorage key that isn't date-scoped, so any client bug is unrecoverable without a reload, and a stale draft can leak across midnight into the next day's thread.

### Symptom: "The flow feels janky" — contributing causes

- `homepageInput` is one giant non-streaming action doing 3–6 **sequential LLM round-trips** (`ai.ts:1496-1802`) with only a static typing indicator; multi-item logs sit silent for seconds then dump everything at once.
- **Home and Coach are two different products:** Home requires two explicit confirms per item; Coach chat (`api.ai.chat`) auto-logs from `⟦LOG_MEAL⟧` markers with no confirmation, offering only an "Undo" chip (`CoachPage.tsx:307-320`). Users who touch both surfaces get inconsistent behavior.
- Dead code: `CoachPage.tsx` wires up a full `DraftMessage`/`LogConfirmCard` path (`:54, 234-271, 444-457`) that nothing ever constructs.
- Sending a new message wholesale-replaces `agentActions` (`AssistantConsole.tsx:453`), so an unhandled card vanishes without a trace.
- **Zero test coverage** on any of this: no tests for `AssistantConsole`, `LogConfirmCard`, `CoachPage`, `chat.ts`, or the `homepageInput`/`chat` actions.

---

## Part 2 — "The numbers are wrong": confirmed bugs

| # | Bug | Where | Severity |
|---|-----|-------|----------|
| N1 | Nutrition page carb target hardcoded to **200 g**; ignores `profile.carbTarget`; no fat row at all | `NutritionPage.tsx:98-100` | High |
| N2 | Nutrition page uses **static** `profile.calorieTarget` while Home uses the live training-day-**adjusted** target — same day, two different calorie goals on two screens | `NutritionPage.tsx:98` vs `HomePage.tsx:139` | High |
| N3 | Insights milestones use hardcoded `protein 150g / carbs 200g / fat 60g` instead of the user's plan | `InsightsPage.tsx:417-420` | High |
| N4 | Weekly chart goal line falls back to **hardcoded 2400 kcal** on any day without a `daily_goals` row — and `applyDayAdjustment` only runs from `addWorkout`, never from `relogWorkout`/`addWorkoutFromAI`/rest days, so most days have no row | `progress.ts:52-71`, `workouts.ts:112,187-359` | High |
| N5 | MET formula mismatch: planned training-day baseline uses **gross MET**, actual burn uses **net MET (MET−1)** — so doing exactly the planned workout produces a negative delta and *reduces* the day's target, partially reintroducing the bug commit 171a360 fixed | `tdee_engine.ts:167-174` vs `calorie_engine.ts:107-108` | High |
| N6 | UTC-vs-local "today": relog from History/Insights passes no date, falling back to server UTC — entries land on the **wrong calendar day** for most non-UTC users much of the day | `HistoryPage.tsx:254,267`, `InsightsPage.tsx:135`, `meals.ts:83`, `workouts.ts:78,198` | Medium |
| N7 | `getTodayBrief` called with no args on Insights → timezone-offset bootstrap race on new sessions/devices | `InsightsPage.tsx:218,293` | Medium |
| N8 | LLM-supplied `unit` string is never validated — unknown units (e.g. "katori", "glass") are silently treated as **grams**, understating weight 5–15× | `unit_converter.ts:280-288` | Medium |
| N9 | Editing workout kcal on the confirm card leaves stale `calorieRangeLow/High/Confidence` in the saved record | `LogConfirmCard.tsx:254`, `AssistantConsole.tsx:363-378` | Low |
| N10 | Recipe logging double-rounds (per-serving rounded, then multiplied by portions and rounded again) | `recipes.ts:80-84,207-210` | Low |
| N11 | Validation clamps implausible values silently — `validationFlags` (macro/calorie mismatch, clamping) are computed but **never shown to the user** | `validation.ts:110-147` | Low |

N1+N2 alone likely explain most "the numbers disagree" reports: they're visible on every visit to the Nutrition page.

---

## Part 3 — The distribution/mobile roadblock

### Honest state of `apps/mobile` (Expo)
- Polished-looking prototype, **0% functional**: every screen reads from hardcoded fixtures in `data/index.ts`; the "Ask Stry" chat is a scripted demo that discards what you type and plays canned replies after a 1400ms timer (`ChatPanel.tsx:32-78,204,229`).
- No Clerk installed, no ConvexProvider, no auth screen, zero `useQuery`/`useMutation` calls anywhere.
- Design tokens are hand-copied into its Tailwind config, not consumed from `packages/shared` — they will drift.
- Getting it to parity means rebuilding essentially the whole app: auth, all data wiring, the entire chat/logging pipeline, plus ongoing dual-platform maintenance. That is a multi-month track.

### Honest state of the web app's mobile story
The hard parts are **already done**: `h-dvh` layout, bottom tab bar with `safe-area-inset-bottom`, `visualViewport`-based keyboard pinning for the chat composer, sparing use of `position:fixed`. What's missing is purely the installability layer:
- No web manifest, no icons/apple-touch-icon/maskable icons, no service worker, no `vite-plugin-pwa` (`index.html`, `public/`, `vite.config.ts` all confirmed bare).

**Recommendation:** ship the first public release as an **installable PWA** (manifest + icon set + minimal service worker ≈ days of work), keep the Expo app parked as a design reference, and revisit native (Expo or Capacitor wrap — Capacitor is already noted in `plans/003` for camera access) only after the release proves demand. Do not block the release on native.

---

## Part 4 — UX debt ledger (from docs × code cross-check)

**Genuinely fixed** (verified in code): duplicate right-panels merge, composer multi-line clipping, dark-mode user bubbles, shared Home/Coach chat components, Nutrition/Workout edit-delete-deep-link, mobile Recipes sub-tab, friendly Clerk auth errors, mobile composer/keyboard fixes, Coach history rail + drawer, soft accent tokens (mostly — 12 raw `/15` tints remain vs. the "none remaining" acceptance bar).

**Open, previously documented:**
- Phase 2 AI error handling — **not started** (no error-code classification in `ai/llm.ts`, no friendly copy).
- Phase 3 coach memory / history search — **not started** (no search tool, no user_memory table).
- All four `plans/00x` — **none executed**, and all reference the pre-monorepo `frontend/`/`backend/` paths, so they're stale and need path/line re-verification before anyone runs them.

**Newly found in this audit:**
- `calibration.ts` backend (workout-calorie feedback → metabolic factor) is complete but has **zero UI callers** — a dead feature no user can ever trigger.
- `NudgeInbox` component is built and tested but **never rendered anywhere** in the app.
- No PWA manifest/SW (Part 3).
- Root `README.md`/`AI_CONFIG.md`/`AGENTS.md` still describe the old `frontend/`/`backend/` layout and old models — misleading for contributors and for agents executing the stale plans.

---

## What to do (prioritized)

### P0 — Release blockers: make logging feel correct (1 focused batch)
1. **Collapse the two-tier confirm into one card.** The `log_draft` action card should *be* the editable `LogConfirmCard` (or its Confirm should actually save, with Edit as a secondary action). Touch: `AssistantConsole.tsx:593-618, 531-535`.
2. **Fix multi-draft data loss.** Append to `pendingDrafts` instead of replacing; remove only the acted-on action from `agentActions`. Touch: `AssistantConsole.tsx:453, 531-535, 607`.
3. **Fix card-before-text ordering.** Cheapest credible fix: gate rendering of `agentActions` until the just-written assistant message is observed in the `messages` query. Right fix (P1): persist drafts server-side so card + text come from one reactive source.
4. **Fix the target-source bugs N1–N4** — single-screen changes, high user-visible payoff: NutritionPage reads real carb/fat/adjusted-calorie targets; InsightsPage uses plan targets; progress chart computes day goals live instead of `?? 2400`.
5. **Fix the MET mismatch (N5)** — pick net-MET or gross-MET once, apply in both engines.

### P1 — Reliability + consistency
6. **Server-side `log_drafts` table** with `status: pending|confirmed|cancelled`, written by `homepageInput` alongside the assistant message; UI subscribes reactively. Kills the whole class of stale-card/lost-draft bugs (including the sessionStorage-across-midnight leak).
7. **Unify Home vs Coach logging behavior** — pick one model (recommend: confirm-card everywhere, since silent auto-log + Undo is riskier for trust). Delete the dead draft wiring in `CoachPage.tsx` either way.
8. **Date correctness (N6, N7):** pass explicit `localDateStr()` from every relog call site and to `getTodayBrief`; longer-term, make client-supplied date mandatory on all logging mutations.
9. **Unit allow-list in `toGrams` (N8)** + add regional vessel units the prompt itself mentions; surface `validationFlags` (N11) as a visible "this looks off" hint on the card.
10. **Phase 2 AI error handling** (already spec'd in `prd/phase-2-ai-error-handling.md`) — generic "Something went wrong" on a multi-LLM pipeline is a top jank source.
11. **Tests for the logging flow:** component tests for card ordering, single-confirm, multi-item confirm/discard; backend tests for `homepageInput` draft building. This flow is the product — it's currently untested.

### P2 — Release packaging
12. **PWA:** manifest, full icon set, `vite-plugin-pwa` with a minimal precache SW, install prompt affordance. This is the answer to "browser is the roadblock" for v1.
13. **Perceived speed:** stage `homepageInput` (return drafts as soon as parsed; deliver tier-2 analysis separately) or add staged progress states; decouple the typewriter from the `freshTs` race.
14. **Cheap wins:** wire up the dead calibration feedback UI (backend is done), render or delete `NudgeInbox`, finish the 12 remaining `/15` tint migrations, update stale root docs and `plans/00x` paths.

### What NOT to do
- **Don't build out the Expo app before v1.** It's a from-zero rebuild wearing a finished app's clothes. PWA first; native when demand is proven.
- **Don't redesign the chat UI.** The visuals match the mockups and the revamp shipped; the problems are sequencing and state lifecycle, not looks.
- **Don't add more AI pipeline steps** (memory agent, search agent, richer analysis) before the confirm flow is single-step, race-free, and tested — every added step widens the silent-latency window users already feel.
- **Don't execute the `plans/00x` docs as written** — paths and insertion points are stale (e.g. plan 004 assumes `NudgeInbox` is rendered on Home; it isn't rendered anywhere). Re-verify before dispatching agents against them.
- **Don't keep drafts client-only.** Any further patching of `sessionStorage`/local-array state is effort spent on an architecture that can't be made reliable; move drafts server-side (P1.6) and let Convex reactivity do its job.
- **Don't ship silent clamping/auto-log behaviors into v1.** Anything that changes the user's data without a visible acknowledgment (Coach auto-log, validation clamps) erodes exactly the trust a tracking app lives on.

### Suggested sequencing
1. Batch 1 (Codex, spec'd): P0 items 1–5 — one PR for the flow fixes, one for the number fixes.
2. Batch 2: P1 items 6–8 (drafts table is the anchor; do 7 and 8 on top).
3. Batch 3: P2 item 12 (PWA) in parallel with P1 item 11 (tests) — independent tracks.
4. Release gate: manual QA pass of log-meal/log-workout/multi-item/edit/relog on a real phone (installed PWA), light + dark.

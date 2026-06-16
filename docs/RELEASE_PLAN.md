# Stride — Release Readiness Plan

**Created:** 2026-06-10
**Status:** Active. Track B done. Track A done.
**Source:** Full code audit (not docs) — findings verified against `backend/convex/` + `frontend/src/`.

---

## Audit findings (verified in code)

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| 1 | `openRouterKey` returned plaintext to client | `profile.ts:249` returns raw key + `hasOpenRouterKey` bool | 🔴 security blocker |
| 2 | `clearAllData` orphans 11+ tables | `users.ts:32` clears 10 of 25 tables. Misses `chat_sessions`, `user_behavior`, `nudges`, `recipes`, `food_memory`, `workout_memory`, `user_ingredients`, `user_profiles`, `user_settings`, `user_metabolic_profiles`, `calorie_feedback` | 🔴 privacy blocker |
| 3 | Gamification skipped on coach auto-logs | Home calls `recordActivity` (`AssistantConsole.tsx:297`); `ai.chat` builds `loggedItem` but never calls it (`ai.ts:1221`) | 🟠 UX bug |
| 4 | Mock demo data live in prod | `DRAFT_TRIGGERS` used at `CoachPage.tsx:244`; `dailyTargets` from `mock.ts` drives Today's Pulse | 🟠 UX leak |
| 5 | 4/5 Phase 5 agents are dead stubs | `agents.ts:144-192` return `handled:false`/`null`, wired nowhere | 🟡 debt |
| 6 | `ai.ts` = 2297-line monolith, zero tests | 1 file, ~30 actions, no `ai.test.ts` | 🟡 debt |
| 7 | Thin tests | 11 backend test files / 45 modules; 3 frontend tests total | 🟡 risk |
| 8 | Express + SQLite dead code | no callers, drifts docs (README says bcrypt/Express; actual = Clerk/Convex) | 🟡 debt |

---

## Track A — Harden for release ✅ DONE

1. ✅ **Fix key exposure** — `openRouterKey` removed from `getSettings` return; write-only. Only `hasOpenRouterKey` bool returned. (`profile.ts:249`)
2. ✅ **Complete `clearAllData`** — now covers all user tables: 8 by_user_date + 12 by_user + weekly_summaries + gamification. (`users.ts`)
3. ✅ **Real data export** — `exportAllData` query returns full JSON of all user tables; wired to ProfilePage Download button. (`users.ts`, `ProfilePage.tsx`)
4. ✅ **Delete `backend/src/`** — Express+SQLite dead code deleted. `tsconfig.json` updated to `include: ["convex"]`. README/AGENTS cleaned.
5. ✅ **Strip mock leaks** — `DRAFT_TRIGGERS` removed from `CoachPage.tsx`; `todaySuggestions`/`cannedFlows`/`dailyTargets`/`sampleFoodImages`/`user`/`profileStats`/etc. removed from `mock.ts` (384→112 lines). Static `COACH_SUGGESTIONS` inlined in CoachPage.

## Track B — AI + chat ⭐ (IN PROGRESS — all 4 approved)

1. ✅ **Delete Phase 5 stubs** — removed DietAgent/WorkoutAgent/SleepAgent/CoachAgent; kept MemoryAgent. Docs synced.
2. ✅ **Split `ai.ts`** (2297 → 1745 lines). Extracted `ai/llm.ts` (canonical callAI — killed duplicate in `ai_utils.ts`), `ai/intent.ts` (pure intent helpers), `ai/parse.ts` (meal/workout parse + nutrition engine). Added `ai/intent.test.ts` + `ai/llm.test.ts` (20 tests). 63/63 backend tests pass.
3. ✅ **Unify log paths** — fixed the real divergence: coach-path meal/workout logs now award gamification server-side (`ai.chat` → `recordActivity`, guarded to `targetDate === today`), matching the homepage confirm path. Verified both paths already learn food/workout memory consistently. The confirm-vs-immediate mechanism difference is intentional product design, not a bug.
4. ◑ **Model upgrade done; streaming deferred.**
   - ✅ **Split-model upgrade** (in `ai/llm.ts`): `DEFAULT_MODEL` `openai/gpt-4o-mini` stays for high-volume parsing/extraction/titles; new `CHAT_MODEL` `anthropic/claude-sonnet-4.6` powers coach + homepage chat replies; `FALLBACK_MODEL` upgraded `claude-3-haiku` → `claude-haiku-4.5`. OpenRouter slugs verified live. `ai.chat`/`homepageInput` split `parseModel` vs `replyModel`; user `openRouterModel` override still wins for everything. Docs (SYSTEM/README/AGENTS) updated.
   - ⏳ **Streaming deferred** (user decision): Convex DB-chunk streaming is a schema + frontend + `ai.chat` restructure that interacts with `⟦LOG_*⟧` stripping — tracked as its own task to keep this release tight.

## Track C — UI/UX + animations 🟡

Motion polish, calorie-feedback UI (backend exists, no frontend), per-ingredient breakdown, pattern surfacing, skeleton states, error states.

## Track D — Reliability / speed 🟡

Test coverage (esp. `ai.ts`), Convex performance audit (subscriptions, OCC), error boundaries, observability (no Sentry today).

## Track E — Mobile (Capacitor) 🟢

After A–C. Wrap React app → iOS + Android. Voxels (R3F) survive webview. Clerk + Convex both Capacitor-compatible. No deps present yet.

## Track F — Backend decision ✅ RESOLVED

Convex stays sole backend. No Node layer (would lose reactivity + types + free auth/scheduling). Track A #4 removes the dead Express stack.

---

## Sequencing

```
A (harden) ─┬─→ B (AI/chat) ──→ C (UX) ──→ D (reliability) ──→ E (mobile)
            └─ B started in parallel per user direction
```

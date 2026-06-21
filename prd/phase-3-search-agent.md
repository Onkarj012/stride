# Phase 3 — `feature/ai-search-agent`

Backend + AI capability. Biggest, riskiest. Ship last.
Parent PRD: `prd/coach-agent-and-ui-batch.md`

## Goal
Make the coach agentic: a native function-calling `search_history` tool over meals/workouts/recipes, a `user_memory` store of episodic prefs, and memory extraction from coach chat. Baseline static context stays; tool covers older/specific lookups.

## Tasks

### 1. Tool-aware LLM call + agent loop
- [ ] Add tool-aware call (`callAIWithTools`-style) alongside string-only `callAI` — passes OpenRouter `tools`, handles `tool_calls` response.
- [ ] In coach `chat` action: bounded agent loop, **max 3 tool rounds/turn**.
- [ ] Graceful degrade: tool/loop failure → answer from baseline context, no error to user.
- [ ] Both models (sonnet-4.6, haiku-4.5 fallback) support tools via OpenRouter.

### 2. `search_history` tool (`meals.ts` / `workouts.ts` / `recipes.ts`)
- [ ] One tool, structured args: `type` (`meals`|`workouts`|`recipes`), `dateFrom`, `dateTo`, `nameContains`, `limit`.
- [ ] Back with `by_user_date` indexes; reuse existing `getRecentWorkoutsDetailed` / `getRecentWorkoutNames` where useful.
- [ ] Results → compact strings (e.g. `"2026-05-28 lunch: chicken tikka 420cal P40"`). `limit` default ~20, hard cap ~50.
- [ ] `nameContains` substring match (powers "my chicken recipes").

### 3. `user_memory` table (`schema.ts` + new module)
- [ ] New table: `userId`, `kind` (`preference`|`constraint`|`pattern`), `text`, `source` (`chat`|`agent`), `createdAt`; `by_user` index. Additive — no migration.
- [ ] Dedup: skip insert if same `kind` + normalized `text` exists.
- [ ] Readable via `search_history` surface (or sibling read the loop calls).

### 4. Memory agent expansion (`agents.ts`)
- [ ] Broaden regex gate: add preference/constraint verbs (hate/love/avoid/prefer/always/never/can't eat/allergic). Keep gated — no per-message LLM call.
- [ ] Extract prefs/constraints → write to `user_memory`.
- [ ] Fire memory agent from coach `chat` too (currently homepage-only). Stays fire-and-forget on cheap model.

### 5. Context wiring (`ai.ts` chat handler ~417)
- [ ] Keep baseline static: profile, today's log, 7-day trend, allergies/diet, small top-recipe list (5–8). Do NOT expand static set.
- [ ] Add tool guidance to system prompt: when to call `search_history`, with examples. Tool internal only — no UI.

## Test
- [ ] `search_history` query: seed meals/workouts/recipes → assert filters (type, date range, `nameContains`, limit/cap) return expected compact rows.
- [ ] Memory dedup: insert same `kind`+text twice → one row.
- [ ] Agent loop: manual, ~5 dev prompts on real key — "3 weeks ago", "my chicken recipes", multi-hop compare, a "hi" that must NOT trigger lookup, a stated pref that must be captured. Log tool calls to Convex logs.

## Out of scope (this phase)
Wellness surfaces in tool, semantic/embedding memory, user-facing search UI, memory extraction on every message.

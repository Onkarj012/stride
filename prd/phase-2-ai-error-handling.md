# Phase 2 — `fix/ai-error-handling`

Backend + frontend. Small, independent, high user value. Ship after Phase 1.
Parent PRD: `prd/coach-agent-and-ui-batch.md`

## Goal
Turn raw OpenRouter failures into classified, actionable messages on both coach chat and homepage quick-chat. Users set their own key, so key errors must point to Settings.

## Tasks

### 1. Backend error classification (`ai/llm.ts` `callAI`)
- [ ] Classify failures → coded `Error` messages (propagated to client by Convex):
  - `AI_NO_KEY` — no key configured.
  - `AI_BAD_KEY` — 401.
  - `AI_NO_CREDITS` — 402.
  - `AI_RATE_LIMIT` — 429.
  - `AI_TIMEOUT` — abort/60s.
  - `AI_UPSTREAM` — network / 5xx / empty.
- [ ] Preserve existing retry/backoff/fallback; only the final thrown message changes to a code.

### 2. Shared frontend copy helper
- [ ] `aiErrorCopy(code)` → friendly string per bucket. 5 buckets:
  1. no/invalid key + no credits → "Check your OpenRouter key in Settings" (links `/settings`).
  2. rate limit → "Too many requests, wait a moment".
  3. timeout → "AI took too long, try again".
  4. network/upstream → "Couldn't reach the AI".
  5. unknown/empty → generic retry.
- [ ] (401/402/no-key collapse into bucket 1.)

### 3. Wire both surfaces
- [ ] Coach chat (`CoachPage.tsx`): replace blanket catch copy with `aiErrorCopy(code)`; key bucket bubble links to Settings. Keep inline-bubble + toast pattern.
- [ ] Homepage quick-chat (component outside `HomePage.tsx` — locate at impl): same helper.

## Test
- [ ] Unit: error classifier — given status/body/thrown error → correct code (no network).
- [ ] Unit: `aiErrorCopy` — each bucket incl. Settings-link case + unknown fallback.

## Verify
- Unset key → "fix key in Settings" + working link, on both surfaces.
- Force 429 / timeout / network → correct distinct copy each.

# PRD — Coach Agent, AI Error Handling & Mobile UI Polish

Status: ready-for-build
Date: 2026-06-16
Ship units: 3 branches (see phased plans in `prd/phase-*.md`)

---

## Problem Statement

Three distinct pain points, from the user's perspective:

1. **The coach forgets.** Stry only sees today's log plus a 7-day calorie total. Ask "what did I eat 3 weeks ago?" or "what chicken recipes do I have saved?" and it can't answer — it has no access to the user's real history. Stated preferences ("I hate cardio", "I fast on Sundays") are never captured from coach chat, so the coach keeps giving irrelevant advice.

2. **AI failures look like bugs.** When OpenRouter fails — missing/invalid key, out of credits, rate limit, timeout — the user sees a generic "couldn't reach the AI" or a raw error. Since users set their **own** OpenRouter key in Settings, a key problem is user-fixable, but nothing tells them that. Same failures surface on both the homepage quick-chat and the coach chat.

3. **Mobile chat composer feels broken.** The input capsule text is oversized versus the rest of the screen, the placeholder is too big and makes an empty capsule scroll (looks buggy), attachment controls eat horizontal space, and the input bar drifts down/hides when the user scrolls up to read earlier messages instead of staying pinned above the keyboard. Desktop is fine.

---

## Solution

1. **An agentic coach with history access.** Give the coach a native function-calling `search_history` tool to look up meals, workouts, and recipes on demand, plus a `user_memory` store of episodic preferences that the same tool can read. Memory extraction also runs from coach chat, not just the homepage. Baseline context (profile, today, 7-day trend, allergies/diet) stays statically injected; the tool covers older/specific lookups. A round-trip beats bloating every message — cheaper and smarter.

2. **Classified, actionable AI errors.** Backend classifies every OpenRouter failure into a small set of coded errors; both chat surfaces map those codes to friendly copy. Key/credit problems tell the user to fix their key in Settings and link there.

3. **A redesigned mobile composer.** Smaller input + placeholder text on mobile, attachment menu consolidated under a left `+` icon, mic hides while typing (`+` stays so users can attach while typing), the empty-capsule scroll bug squashed, and the composer pinned above the keyboard via the `visualViewport` API. Desktop untouched.

Bundled in the same UI unit: a Recipes sub-tab inside Nutrition (mobile has no Recipes tab), friendlier Clerk auth errors, and a bounded sizing pass on the touched pages.

---

## User Stories

### Coach agent / history
1. As a coach user, I want to ask "what did I eat three weeks ago?", so that I get an answer grounded in my actual logged meals.
2. As a coach user, I want to ask "what chicken recipes do I have saved?", so that the coach lists my real matching recipes instead of guessing.
3. As a coach user, I want the coach to compare two past periods (e.g. last two weeks), so that I can see trends.
4. As a coach user, I want to state a preference like "I hate cardio" in chat, so that future advice respects it without me repeating myself.
5. As a coach user, I want stated dietary constraints ("I fast on Sundays") remembered, so that meal suggestions account for them.
6. As a coach user, I want the coach to still know my profile, today's log, and recent trend instantly, so that common questions don't incur a lookup delay.
7. As a coach user, I want history lookups to be fast and not slow every message, so that casual chat stays snappy.
8. As a coach user, I want the coach to look things up only when relevant, so that it doesn't waste time on "hi".
9. As a coach user, I want multi-step lookups to resolve in one turn, so that I get a complete answer without re-prompting.
10. As a developer, I want the agent loop bounded, so that a misbehaving model can't run up cost or latency.

### AI error handling
11. As a chat user, I want a clear message when my OpenRouter key is missing or invalid, so that I know to fix it in Settings.
12. As a chat user, I want a clear message when I'm out of OpenRouter credits, so that I understand why and how to resolve it.
13. As a chat user, I want a "too many requests, wait a moment" message on rate limits, so that I don't think the app is broken.
14. As a chat user, I want a "took too long, try again" message on timeouts, so that I retry instead of giving up.
15. As a chat user, I want a "couldn't reach the AI" message on network/upstream failures, so that I know it's transient.
16. As a chat user, I want a direct link to Settings when the problem is my key, so that I can fix it in one tap.
17. As a chat user, I want the same clear errors on both homepage chat and coach chat, so that the experience is consistent.

### Mobile composer
18. As a mobile chat user, I want the input text sized to match the rest of the screen, so that the capsule looks balanced.
19. As a mobile chat user, I want a smaller placeholder, so that the empty capsule doesn't scroll or look buggy.
20. As a mobile chat user, I want attachments under a single left `+` menu, so that the input has more room.
21. As a mobile chat user, I want the mic to hide while I'm typing, so that the composer is uncluttered.
22. As a mobile chat user, I want the `+` to stay visible while typing, so that I can attach a file and type a message together.
23. As a mobile chat user, I want the composer pinned above the keyboard, so that it stays put when I scroll up to read earlier messages.
24. As a desktop chat user, I want the composer unchanged, so that the experience I like is preserved.

### Recipes sub-tab
25. As a mobile user, I want a Recipes tab inside Nutrition, so that I can reach recipes without a dedicated nav slot.
26. As a desktop user, I want the `/recipes` route to keep working, so that my bookmarks/deep-links don't break.

### Auth errors
27. As a signing-in user, I want a readable message on a wrong password, so that I know what went wrong.
28. As a signing-up user, I want a readable message when my email already exists, so that I switch to sign-in.
29. As a signing-in user, I want the offending field highlighted for password/email-not-found, so that I correct the right thing.

---

## Implementation Decisions

### Coach agent / history
- **Native OpenRouter function-calling**, not marker-based. Add a tool-aware LLM call (`callAIWithTools`-style) alongside the existing string-only `callAI`. The coach `chat` action runs a **bounded agent loop, max 3 tool rounds per turn**; on tool/loop failure it degrades gracefully and answers from baseline context.
- **One `search_history` tool** with structured args: `type` (`meals` | `workouts` | `recipes`), `dateFrom`, `dateTo`, `nameContains`, `limit`. Backed by existing `by_user_date` indexes. Results returned as **compact formatted strings** (e.g. `"2026-05-28 lunch: chicken tikka 420cal P40"`), `limit` default ~20, hard cap ~50.
- **Baseline static context stays**: profile, today's log, 7-day trend, allergies/diet, and a small top-recipe list (top 5–8) for ambient awareness. The tool is for older/specific lookups only. Do not expand the static recipe set.
- **`user_memory` new table**: fields `userId`, `kind` (`preference` | `constraint` | `pattern`), `text`, `source` (`chat` | `agent`), `createdAt`; `by_user` index. Dedup by skipping insert when same `kind` + normalized `text` already exists. Pure additive schema — no migration, no embeddings. Readable through the same `search_history` surface (or a sibling read used by the loop).
- **Memory agent expansion**: broaden the regex gate to catch preference/constraint verbs (hate/love/avoid/prefer/always/never/can't eat/allergic) in addition to the current food/macro phrases; keep it gated (no per-message LLM call). Fire the memory agent from the coach `chat` action too, not just `homepageInput`. Stays fire-and-forget on the cheap model.
- Tool is **AI-internal only** — no user-facing search UI this batch.
- Note: `getRecentWorkoutsDetailed` (7-day) and `getRecentWorkoutNames` (30-day names) already exist and can inform the tool-backed queries.

### AI error handling
- **Backend classifies** OpenRouter failures into coded `Error` messages, propagated to the client by Convex: `AI_NO_KEY`, `AI_BAD_KEY` (401), `AI_NO_CREDITS` (402), `AI_RATE_LIMIT` (429), `AI_TIMEOUT`, `AI_UPSTREAM`. No frontend string-matching of raw bodies.
- **Five user-facing buckets**: (1) no/invalid key + no credits → "fix your OpenRouter key in Settings" (actionable, links to `/settings`); (2) rate limit → "too many requests, wait a moment"; (3) timeout → "AI took too long, try again"; (4) network/upstream → "couldn't reach the AI"; (5) empty/unknown → generic retry. 401/402/no-key collapse into one bucket (same fix).
- **Shared frontend helper** `aiErrorCopy(code)` consumed by both coach chat and homepage quick-chat. Keep the existing inline-assistant-bubble + toast pattern; only the copy changes. Key bucket's bubble links to Settings.
- Users set their own `openRouterKey` (falls back to server env), so key errors are user-actionable.

### Mobile composer
- Move the attachment trigger to the **left** of the textarea, change icon to `+`; it opens the existing dropdown (Photo/camera, Scan barcode). **Reorg of existing actions only — no new PDF/document upload pipeline** (backend currently handles `image/*` only).
- **Empty state**: `+` left, mic right, send dimmed/hidden (current scale-down behavior). **Typing state**: hide **mic only**; `+` stays, send shows.
- Input + placeholder → smaller on mobile (~`text-[13px]`), keep `~0.95rem` on `lg:`. Empty-capsule scroll bug resolved via the smaller text plus `rows=1` min-height aligned to line-height.
- Pin the composer above the keyboard using a `visualViewport` listener on mobile (more reliable than `100dvh`-only layout); listener cleaned up on unmount. Desktop layout untouched.

### Recipes sub-tab
- Extract the `RecipesPage` body into a shared `RecipesContent` component; mount it inside Nutrition under `Log | Recipes` tabs **and** keep the standalone `/recipes` route. Single source, two mounts. `FloatingTabBar` stays at 5 tabs.

### Auth errors
- Map common Clerk codes (`form_password_incorrect`, `form_identifier_exists`, `form_identifier_not_found`, invalid email) → friendly strings with a generic fallback; highlight the offending field for password / email-not-found. Full per-field plumbing for every code is out of scope.

### Sizing pass
- Scoped to Auth, Coach, Nutrition pages + `MessageBubble` only. No repo-wide sweep.

---

## Testing Decisions

- **Test external behavior, not implementation.** Assert on inputs/outputs and user-visible results, not internal call shapes.
- **Error classifier** is the cleanest pure-function seam: given an OpenRouter response (status + body / thrown error), it returns the right code. Unit-test the mapping table directly — no network.
- **`aiErrorCopy(code)` helper**: pure code→copy map, unit-test each bucket including the Settings-link case and the unknown fallback.
- **`search_history` query**: seed a user's meals/workouts/recipes, assert the structured filters (`type`, date range, `nameContains`, `limit`/cap) return the expected compact rows. Highest practical seam is the Convex query level.
- **Memory dedup**: insert the same `kind`+normalized `text` twice, assert one row.
- **Agent loop** (coach `chat`): not auto-tested against live OpenRouter. Verify manually with ~5 scripted dev prompts on a real key ("what did I eat 3 weeks ago", "my chicken recipes", a multi-hop compare, a "hi" that must NOT trigger a lookup, a stated preference that must be captured). Log each tool call to Convex logs for inspection.
- **Mobile composer / UI**: verified manually in a mobile browser — typing hides mic but not `+`, empty capsule doesn't scroll, composer stays pinned above the keyboard on scroll, desktop unchanged.
- Prior art: follow whatever test setup already exists in `backend/`/`frontend/`; prefer existing seams over new ones.

---

## Out of Scope

- Real PDF / document upload + parsing pipeline (the `+` menu reorganizes existing image/barcode actions only).
- User-facing history search UI (the tool is AI-internal; the History page already handles manual browsing).
- Wellness surfaces (sleep/mood/water/steps/weight) in `search_history` — meals/workouts/recipes only this batch.
- Embedding/semantic memory — `user_memory` uses exact-ish dedup, no vectors.
- Memory extraction on every message — stays regex-gated.
- Full per-field Clerk error plumbing for every code.
- Repo-wide sizing sweep — only the touched pages.
- Desktop composer changes.

---

## Further Notes

- Ship order is deliberately low-risk first: **Phase 1 UI polish → Phase 2 AI error handling → Phase 3 search agent** (biggest, riskiest, last). See `prd/phase-1-ui-polish.md`, `prd/phase-2-ai-error-handling.md`, `prd/phase-3-search-agent.md`.
- Chat is non-streaming (single `callAI` then return), so the agent loop slots in before the final reply with no streaming reconciliation.
- The homepage quick-chat UI lives in a component outside `HomePage.tsx`; locate it at implementation time for the error-copy wiring.
- Both Anthropic models in use (sonnet-4.6 primary, haiku-4.5 fallback) support tool-calling via OpenRouter.

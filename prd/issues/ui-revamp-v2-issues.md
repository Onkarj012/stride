# UI Revamp v2 — Issues

Source: [prd/ui-revamp-mockup-v2.md](../ui-revamp-mockup-v2.md)
Critical path: `A,B → C,D,E → F,G,H → I,J`
Gate rule: each phase ships stable before the next consumes it.

| ID | Title | Phase | Depends on |
|----|-------|-------|-----------|
| A | Accent tokens (soft tier, light + dark) | 1 | — |
| B | Shared chat presentational layer | 1 | — |
| C | Today's Snapshot merge (single global panel) | 1 | A |
| D | Home chat wiring + deep-link queue | 1 | B |
| E | AI Coach chat + history rail | 1 | B |
| F | Nutrition page | 2 | A, C, D |
| G | Workout page | 2 | A, C, D |
| H | Recipes page | 2 | A, C |
| I | Component tests | 3 | E, F, G, H |
| J | Theme QA (light + dark, manual) | 3 | all |

---

## Phase 1 — foundation

### A · Accent tokens (soft tier, light + dark)
**Depends on:** none — start here.
**Why:** accents too faint (`/15` opacity) — app reads flat grey instead of warm pastel.

**Scope**
- Add `--color-{lavender,sky,peach,mint,bubblegum}-soft` for light + dark.
- Light hexes (from PRD): lavender `#EDE8FF`, sky `#E7F0FF`, peach `#FFEEDC`, mint `#E6F7EA`, bubblegum `#FCEAF3`.
- Dark values: derived equivalents, visible on dark surfaces, tuned vs existing dark semantic palette.
- Reroute faint `/15` tints (pills, chips, cards, icon backgrounds) → soft tokens, both themes.
- Brand accent hexes + existing semantic surface/text tokens stay authoritative — only add soft tier + reroute usage.

**Source of truth:** mockup `App Mockup v2.html` + `docs/design-tokens.md`.
**Out of scope:** changing brand hexes or semantic tokens.

**Acceptance**
- [ ] Pills/chips/cards/icon-bg read warm pastel, not grey — light + dark.
- [ ] No remaining `/15` accent tints on those elements.

---

### B · Shared chat presentational layer
**Depends on:** none — start here.
**Why:** Home chat and Coach chat look like two products; composer clips multi-line; user bubbles invisible in dark; scroll jank.

**Scope**
- Extract shared presentational components: message bubble (user + AI variants), composer, day divider, AI spark badge, macro pills, inline chat cards.
- Composer fix: replace fully-rounded capsule with rounded-rect (~18px radius per mockup) — multi-line text never clips; preserve auto-grow up to existing line cap.
- User bubble theming: keep dark "ink" in light mode; switch to lighter elevated surface in dark mode (legible).
- Layout fix: stabilize chat column height/scroll — review negative-margin breakout + `100dvh`.
- Backends stay separate and unchanged. Presentation only.

**Files:** `frontend/src/components/home/AssistantConsole.tsx` + new shared chat component dir.
**Out of scope:** unifying Home/Coach backends or data models.

**Acceptance**
- [ ] Bubbles, spark badge, macro pills, inline cards match mockup.
- [ ] Composer grows across lines, no clip on rounded corners.
- [ ] User bubble legible in both light and dark.
- [ ] Chat scrolls reliably, fills available height, no jank.
- [ ] Same components reusable by Home (D) and Coach (E).

---

### C · Today's Snapshot merge (single global panel)
**Depends on:** A.
**Why:** desktop Home shows two near-identical "today's progress" panels — info competes with itself.

**Scope**
- Collapse Home-only right `<aside>` + global right panel into one canonical Today's Snapshot. Render globally via app layout on all main pages.
- Expanded: focus card (dark ink), 2×2 stat tiles, weekly adherence mini-chart, macro progress bars, coach insight, optional weight-goal chip.
- Collapsed: slim vertical strip — consumed kcal (with arc), burned kcal, streak.
- Collapse/expand state in dedicated context backed by `localStorage` — persists across nav + reload.
- Content global/consistent across pages, NOT page-contextual.
- Remove Home's bespoke right `<aside>`; Home renders chat column only.
- Left page-nav sidebar explicitly NOT modified.

**Files:** `frontend/src/components/layout/RightPanel.tsx`, `frontend/src/components/layout/AppLayout.tsx`, new snapshot-state context (sibling to `frontend/src/context/NavSheetContext.tsx`).
**Note:** weekly-adherence may be placeholder until backing aggregate query exists — follow-up, not blocker.

**Acceptance**
- [ ] One snapshot panel on every main page; no duplicate.
- [ ] Expanded shows all six elements; collapsed strip shows consumed/burned/streak.
- [ ] Toggle persists across navigation and remount (localStorage).
- [ ] Renders on a non-Home route.
- [ ] Left nav sidebar unchanged.

---

### D · Home chat wiring + deep-link queue
**Depends on:** B.

**Scope**
- Render shared chat components (B) on Home. Today's conversation only — no history rail.
- Keep date-scoped homepage thread + log-parsing input action + confirm/draft cards unchanged.
- Deep-link queue: Home reads `?log=` query param → queues composer prompt via existing queued-prompt mechanism.

**Files:** Home page + `AssistantConsole.tsx`.
**Out of scope:** changing log-parse / confirm-card behavior.

**Acceptance**
- [ ] Home chat matches mockup, identical to Coach (E).
- [ ] Log-parse + confirm cards still work.
- [ ] `/?log=dinner` pre-starts composer (assert via visible composer value / queued state).

---

### E · AI Coach chat + history rail
**Depends on:** B.

**Scope**
- Render shared chat components (B) on AI Coach. Multi-session threads + conversational chat action unchanged.
- Add conversation-history rail: desktop = collapsible left rail; mobile = top button opening left history panel/drawer.

**Out of scope:** changing multi-session backend.

**Acceptance**
- [ ] Coach chat identical look to Home.
- [ ] Desktop history rail collapses/expands.
- [ ] Mobile top button opens left history drawer.
- [ ] Multi-session history still works.

---

## Phase 2 — pages (depend on Phase 1 stable)

### F · Nutrition page
**Depends on:** A, C, D.

**Scope**
- Widen/relax desktop layout — drop narrow mobile-width column.
- Macro summary (calories, protein, carbs, fat) vs targets.
- Meals grouped by section: breakfast, lunch, snack, dinner.
- Inline edit: reuse existing edit-log modal.
- Inline delete: existing delete mutation behind confirmation.
- Affordance: per-row controls — hover (desktop) + tap (mobile).
- "Log meal" → navigate Home `/?log=<section>` (uses D queue).

**Files:** `frontend/src/pages/NutritionPage.tsx`.
**Out of scope:** new backend mutations/queries.

**Acceptance**
- [ ] Comfortable desktop width.
- [ ] Meals grouped by section against targets.
- [ ] Edit opens modal pre-filled.
- [ ] Delete prompts confirm, then removes row.
- [ ] "Log meal" routes to Home with queued prompt.
- [ ] Controls usable on desktop hover + mobile tap.

---

### G · Workout page
**Depends on:** A, C, D.
**Why:** cramped on desktop; colors off; Log button does nothing.

**Scope**
- Widen/relax desktop layout.
- Correct accent colors → mockup.
- Stats: duration, calories burned, exercises, intensity + exercise breakdown.
- Inline edit (existing modal) + delete (existing mutation, confirm). Hover + tap.
- "Log workout" → navigate Home `/?log=workout`.

**Files:** `frontend/src/pages/WorkoutsPage.tsx`.

**Acceptance**
- [ ] Comfortable desktop width.
- [ ] Cards + accents match mockup colors.
- [ ] Stats + exercise breakdown render.
- [ ] Edit + delete behave like Nutrition.
- [ ] "Log workout" routes to Home with queued prompt.

---

### H · Recipes page
**Depends on:** A, C.

**Scope**
- "Suggested for tonight" 4-column card grid: thumb, name, macro pills.
- "Saved recipes" list with per-row Log action (one-tap).
- Preserve existing create-recipe + recipe-detail flows underneath.

**Files:** `frontend/src/pages/RecipesPage.tsx`.

**Acceptance**
- [ ] Suggestions grid renders (name + macro pills).
- [ ] Saved-recipes list renders; per-row Log triggers log path.
- [ ] Create + detail navigation still reachable.

---

## Phase 3 — verify

### I · Component tests
**Depends on:** E, F, G, H.

**Scope** — mirror `NudgeInbox.test.tsx` / `FoodSearch.test.tsx`. Co-located `*.test.tsx`. Assert observable behavior, not internals.
- Snapshot: full content expanded; consumed/burned/streak collapsed; toggle persists remount; renders non-Home route.
- Composer: multi-line grows + fully visible; Enter submits; Shift+Enter newline; empty disables send.
- Bubble: user vs AI role styling; spark badge + macro pills when provided.
- Nutrition: grouped vs targets; edit opens pre-filled modal; delete confirms then removes; "Log meal" routes Home queued.
- Workout: stats + breakdown render; edit/delete like Nutrition; "Log workout" routes Home queued.
- Recipes: grid + saved list render; per-row Log triggers log; create/detail reachable.
- Deep-link queue: `?log=` param pre-starts composer.

**Acceptance**
- [ ] All modules above covered and passing.

---

### J · Theme QA (light + dark, manual)
**Depends on:** all.
**Note:** token/visual changes verified manually, not unit tests.

**Acceptance**
- [ ] Accents visible + pleasant, light + dark.
- [ ] User bubble legible both modes.
- [ ] Composer no clip on multi-line.
- [ ] Scroll stable on Home + Coach.
- [ ] Workout colors match mockup.

---

## Scope guards (all issues)
- No left nav sidebar changes.
- No backend mutation/query changes — reuse existing meal/workout/chat/profile APIs.
- No Home/Coach backend or data-model unification (presentation shared only).
- Weekly-adherence aggregate = follow-up, not a blocker.
- Out: native app, onboarding, auth, settings/profile redesigns, new analytics.

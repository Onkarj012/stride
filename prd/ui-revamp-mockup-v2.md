# PRD — UI Revamp to Mockup v2 (Desktop + Mobile Web)

**Status:** Ready for implementation
**Source:** `Stride_Design_System/App Mockup v2.html` + `docs/design-tokens.md`
**Scope:** Web UI only (mobile-web + desktop). Native app deferred.
**Date:** 2026-06-15

---

## Problem Statement

The current Stride web UI has drifted from the agreed `App Mockup v2.html` design. As a user:

- **Desktop** feels redundant and cluttered — the Home page shows three sidebars (left page-nav plus *two* near-identical "today's progress" panels), so the same information competes with itself.
- The **chat** (the core surface) looks "broken": the composer capsule clips text when input wraps to multiple lines, user bubbles are nearly invisible in dark mode, and the chat area has height/scroll jank. Worse, the Home chat and the AI Coach chat look like two different products even though they should feel identical.
- **Accent colors** are so faint they blend into the background — the app reads as flat grey instead of the warm pastel wellness feel the design promises.
- **Nutrition and Workout** pages are cramped on desktop, give no way to edit or delete a logged item, and their "Log meal" / "Log workout" buttons do nothing.
- **Workout** page colors don't match the design.
- The **Recipes** page works but lacks the polished, goal-aware layout from the mockup.

## Solution

Bring the web UI to a faithful, polished match of Mockup v2 across mobile and desktop, while keeping the chat-first product model intact.

From the user's perspective:

- **One** "Today's Snapshot" panel on the right, present on every page, that I can collapse to a slim strip showing my consumed calories, burned calories, and streak — and expand back to the full snapshot. No more duplicate panels.
- A chat that looks and feels the same whether I'm on Home or AI Coach — clean bubbles, a composer that grows gracefully across lines, readable user messages in both light and dark mode, and reliable scrolling. On Home I see only today's conversation; on AI Coach I also get my conversation history.
- Warm, clearly visible pastel accents that match the design in both light and dark mode.
- Nutrition and Workout pages that breathe on desktop, let me edit or delete any logged item inline, and whose "Log" buttons take me straight into the chat with the entry pre-started.
- A Recipes page that surfaces goal-aware suggestions in a clean grid plus my saved recipes with one-tap logging.

---

## User Stories

### Layout — Today's Snapshot

1. As a desktop user, I want a single Today's Snapshot panel on the right of every page, so that my daily progress is always one glance away without redundancy.
2. As a desktop user, I want to collapse the Today's Snapshot panel with a button, so that I can give content more width when I want to focus.
3. As a desktop user, I want the collapsed snapshot to still show consumed calories, burned calories, and my streak, so that I keep the most important numbers visible even when collapsed.
4. As a desktop user, I want to expand the collapsed strip back to the full snapshot with one click, so that I can drill into details on demand.
5. As a desktop user, I want my collapse/expand choice to persist across pages and reloads, so that the app remembers how I like to work.
6. As a desktop user, I want the full snapshot to show my focus for the day, key stat tiles, weekly adherence, macro progress, and a coach insight, so that I get a meaningful summary in one place.
7. As a user on any page, I want the snapshot content to stay consistent (not change per page), so that it is predictable and not redundant with the page's own content.
8. As a desktop user, I want the left page-navigation sidebar to stay exactly as it is, so that navigation I already rely on is undisturbed.

### Chat — shared experience

9. As a user, I want the Home chat and the AI Coach chat to look identical, so that the product feels coherent.
10. As a user typing a long message, I want the composer to grow across multiple lines without clipping my text on rounded corners, so that I can always read what I'm writing.
11. As a dark-mode user, I want my own chat bubbles to be clearly visible against the dark background, so that I can read my side of the conversation.
12. As a light-mode user, I want my chat bubbles to keep the dark "ink" style from the mockup, so that the design matches the reference.
13. As a user, I want the chat area to scroll reliably and fill the available height without jank, so that reading and composing feels smooth.
14. As a user, I want chat bubbles, the AI "spark" badge, macro pills, and inline cards to match the mockup precisely, so that the chat looks intentional and finished.
15. As a Home user, I want to see only today's conversation, so that the home surface stays focused on the day.
16. As an AI Coach user, I want to see my past conversations, so that I can revisit prior threads.
17. As an AI Coach desktop user, I want the conversation-history rail on the left to be collapsible, so that I can reclaim space when I don't need it.
18. As an AI Coach mobile user, I want a button at the top that opens a history list panel from the left, so that I can switch conversations on a small screen.
19. As a user, I want the log-parsing behavior and confirm cards on Home to keep working unchanged, so that the revamp doesn't break logging.
20. As a user, I want multi-session conversations on AI Coach to keep working unchanged, so that the revamp doesn't break my history.

### Colors / theming

21. As a user, I want pastel accents (lavender, sky, peach, mint, bubblegum) to be clearly distinguishable from the background, so that the UI feels warm and legible rather than washed out.
22. As a light-mode user, I want soft accent tints that match the mockup, so that chips, pills, and cards read as intended.
23. As a dark-mode user, I want accent tints adapted for dark surfaces so they remain visible and pleasant, so that the experience is first-class in dark mode too.
24. As a user, I want accents applied consistently to pills, chips, cards, and icon backgrounds, so that the visual language is unified.

### Nutrition page

25. As a desktop user, I want the Nutrition page to use the available width comfortably, so that it doesn't feel cramped.
26. As a user, I want my macro summary (calories, protein, carbs, fat) shown against targets, so that I can see how my day is tracking.
27. As a user, I want meals grouped by section (breakfast, lunch, snack, dinner), so that my day reads naturally.
28. As a user, I want to edit any logged meal inline, so that I can fix mistakes without re-logging.
29. As a user, I want to delete any logged meal with a confirmation, so that I can remove erroneous entries safely.
30. As a user, I want the "Log meal" button to take me into the chat with the entry pre-started, so that logging stays fast and chat-first.
31. As a user, I want the edit/delete controls to be easy to use on both desktop (hover) and mobile (tap), so that the page works on every device.

### Workout page

32. As a desktop user, I want the Workout page to use the available width comfortably, so that it doesn't feel cramped.
33. As a user, I want workout cards and accents to match the mockup colors, so that the page looks correct.
34. As a user, I want to see workout stats (duration, calories burned, exercises, intensity) and the exercise breakdown, so that I understand each session.
35. As a user, I want to edit a logged workout inline, so that I can correct details.
36. As a user, I want to delete a logged workout with a confirmation, so that I can remove mistakes safely.
37. As a user, I want the "Log workout" button to take me into the chat with the entry pre-started, so that logging stays fast and chat-first.

### Recipes page

38. As a user, I want goal-aware recipe suggestions shown in a clean grid, so that I can quickly find something that fits today's targets.
39. As a user, I want each suggestion to show its name and macro pills, so that I can judge fit at a glance.
40. As a user, I want a list of my saved recipes with a one-tap Log action, so that I can log a favorite quickly.
41. As a user, I want to keep creating and viewing recipe details as before, so that existing recipe functionality is preserved.

### Cross-cutting

42. As a mobile user, I want every page to keep the grid-dots navigation trigger and bottom nav sheet, so that navigation is consistent with the mockup.
43. As a user, I want the revamp to land in dependency order (foundation first), so that each layer is stable before the next is built on it.

---

## Implementation Decisions

### Phasing
- **Phase 1 (foundation):** soft-accent color tokens → shared chat UI layer → Today's Snapshot panel merge. Build-verify before Phase 2.
- **Phase 2 (pages):** Nutrition, Workout, Recipes — built on the Phase 1 foundation.

### Today's Snapshot (merge two right panels into one)
- Collapse the existing Home-only right context panel and the newly added global right panel into **one** canonical Today's Snapshot component, rendered globally (via the app layout) on all main pages.
- **Expanded state:** focus card (dark ink), 2×2 stat tiles, weekly adherence mini-chart, macro progress bars, coach insight, optional weight-goal chip.
- **Collapsed state:** slim vertical strip showing consumed calories (with arc), burned calories, and streak.
- Content is **global / consistent** across pages (not page-contextual), since each page already shows its own detail.
- Collapse/expand state lives in a dedicated context backed by `localStorage`, so it persists across navigation and reload.
- The Home page's bespoke right `<aside>` is removed; Home renders only the chat column and relies on the shared snapshot panel.
- The **left** page-navigation sidebar is explicitly **not** modified.

### Chat (shared UI layer, separate backends)
- Extract shared **presentational** chat components matched to the mockup: message bubble (user + AI variants), composer, day divider, AI "spark" identity badge, macro pills, and inline chat cards.
- **Backends stay separate and unchanged:**
  - Home uses the date-scoped homepage thread + the log-parsing input action (with confirm/draft cards).
  - AI Coach uses multi-session threads + the conversational chat action.
- Both surfaces render the shared presentational components, guaranteeing identical look without unifying data models.
- **Composer fix:** replace the fully-rounded capsule with a rounded-rectangle capsule (≈18px radius per mockup) so multi-line text never clips; preserve auto-grow up to the existing line cap.
- **User bubble theming:** keep the dark "ink" bubble in light mode (mockup-accurate); in dark mode switch the user bubble to a lighter elevated surface so it is legible.
- **Layout fix:** stabilize the chat column height/scroll (review the negative-margin breakout + `100dvh` approach) so scrolling is reliable.
- **Home:** today's conversation only — no history rail.
- **AI Coach:** adds a conversation-history rail. Desktop = collapsible left rail. Mobile = top button opening a left history panel/drawer.

### Colors / theming
- Add `--color-*-soft` accent tokens for lavender, sky, peach, mint, bubblegum.
  - **Light** values from the mockup: lavender `#EDE8FF`, sky `#E7F0FF`, peach `#FFEEDC`, mint `#E6F7EA`, bubblegum `#FCEAF3`.
  - **Dark** values: derived equivalents that stay visible on dark surfaces (tuned against the existing dark semantic palette).
- Replace faint opacity tints (e.g. `/15`) used for pills, chips, cards, and icon backgrounds with the new soft tokens, in both themes.
- Brand accent hexes and the existing semantic surface/text tokens remain authoritative; this only adds the soft tier and reroutes tint usage. Sources of truth: the mockup + `docs/design-tokens.md`.

### Nutrition + Workout pages
- Widen/relax desktop layout so content is comfortable (not the narrow mobile-width column).
- **Edit:** reuse the existing edit-log modal for both meals and workouts.
- **Delete:** call the existing delete mutations behind a confirmation step.
- **Affordance:** inline edit/delete controls per row — discoverable on hover (desktop) and tappable (mobile).
- **"Log meal" / "Log workout" buttons:** deep-link into the Home chat with the composer pre-started. Implementation: navigate to Home with a query param (e.g. `/?log=dinner`); Home reads the param and queues the composer prompt using its existing queued-prompt mechanism.
- Correct Workout page accent colors to match the mockup.

### Recipes page
- Match the mockup layout: a "Suggested for tonight" 4-column card grid (thumb, name, macro pills) and a "Saved recipes" list with per-row Log actions.
- Preserve the existing create-recipe and recipe-detail flows underneath the new list view.

### Navigation (already aligned, keep)
- Mobile keeps the grid-dots nav trigger and bottom nav sheet (Today / Nutrition / Workouts / Insights / Coach + profile row), driven by shared nav-sheet state.
- Desktop left sidebar keeps the full nav set, recent list, and footer chips.

---

## Testing Decisions

**What makes a good test here:** assert externally observable behavior (what the user sees and can do), not implementation details. Prefer rendering a surface and asserting on visible text/roles/interactions over snapshotting internal structure. Use the existing component-test conventions already present in the repo (co-located `*.test.tsx`, e.g. the nudge-inbox and food-search tests).

**Modules to test:**

- **Today's Snapshot panel:** renders the full content when expanded; renders consumed/burned/streak in the collapsed strip; toggling persists across a remount (localStorage-backed); renders on a non-Home route.
- **Shared composer:** multi-line input grows and remains fully visible (no clipped overflow); Enter submits, Shift+Enter inserts a newline; empty input disables send.
- **Shared chat bubble:** user vs AI variants render the correct role styling; AI spark badge and macro pills render when provided.
- **Nutrition page:** meals render grouped by section against targets; edit opens the modal pre-filled; delete prompts for confirmation then removes the row; "Log meal" routes to Home with the queued prompt.
- **Workout page:** stats and exercise breakdown render; edit and delete behave like Nutrition; "Log workout" routes to Home with the queued prompt.
- **Recipes page:** suggestions grid and saved-recipes list render; the per-row Log action triggers the log path; create/detail navigation still reachable.
- **Deep-link queue:** loading Home with the `log` query param results in the composer being pre-started (assert via the visible composer value / queued state).

**Prior art:** mirror the existing `NudgeInbox.test.tsx` and `FoodSearch.test.tsx` patterns for rendering + interaction assertions.

Note: theme/token changes are visual and are verified manually in light and dark mode rather than via unit tests.

---

## Out of Scope

- Native mobile app (explicitly deferred).
- Changing the left page-navigation sidebar.
- Unifying the Home and AI Coach chat backends/data models (only the presentation layer is shared).
- New backend mutations/queries — the revamp uses existing meal/workout/chat/profile APIs.
- Onboarding, auth, and settings/profile redesigns.
- Adding new analytics/insights computations (the snapshot uses existing data; adherence figures may use placeholder values where no aggregate query exists yet — flagged as follow-up).

---

## Further Notes

- The mockup `App Mockup v2.html` is the visual source of truth for both surfaces; `docs/design-tokens.md` governs token semantics (spacing, radius, type scale, motion).
- Weekly-adherence values in the snapshot may be placeholder until a backing aggregate query exists; treat real adherence wiring as a follow-up rather than a blocker.
- Delivery order is a hard dependency chain: tokens and the shared chat layer and the snapshot merge must be stable before the Phase 2 pages consume them.

# PRD — Web app coherence via Stride UI Kit

**Status:** Approved (grilled 2026-06-30)
**Owner:** Onkar
**Scope target:** `apps/web` (Vite + React 19 + React Router + Tailwind v4 + Convex + Clerk)

---

## 1. Problem

`apps/web` looks incoherent. A polished design kit exists (`docs/ui-kit/`) but its
components sit **orphaned** in `apps/web/src/components/ui-kit/` — copied in, imported by
zero pages. Real pages still use ad-hoc presentation. Goal: drape the kit's visual layer
over the existing data/routing/auth layer so every surface looks like one product.

**Not Next.js.** `apps/web` is Vite + React Router. (The brief said "nextjs"; corrected.)

---

## 2. Source of truth

- **`docs/ui-kit/src`** is the visual truth — web Tailwind components (`className="bg-ink
  dark:bg-surface"`), framer/motion, mock-data driven. It contains:
  - `App.tsx` — component showcase gallery (reference only)
  - `app/Shell.tsx` — **desktop** layout (left sidebar)
  - `mobile/MobileApp.tsx` — **mobile** layout (bottom tabs, phone chrome)
  - `components/*` — 20 presentational components
- **Ignore** `docs/ui-kit/README.md`'s "AppText / theme.ts / RN points" description — it
  documents a different (mobile) layer, stale vs the actual `src`. Follow the `src`.
- **`Stride_Design_System/`** — token + brand reference. Tokens already mirrored in
  `apps/web/src/styles/global.css` (`@theme`). Treat `global.css` as token truth.

---

## 3. Decisions (locked)

| # | Decision |
|---|---|
| D1 | Canonical component set = `apps/web/src/components/ui-kit/`. Vendored **fork** — own it in `apps/web`, no live sync from `docs/ui-kit`. |
| D2 | Components stay **pure presentational** (prop-driven). No Convex queries inside ui-kit. |
| D3 | Page **containers** own data: keep existing `useQuery`/hooks/auth; map Convex → props with a small adapter fn when shapes differ. |
| D4 | Keep **everything** in real pages (routing, providers, data, logic). Change only UI/presentation. |
| D5 | Chrome: **restyle existing `layout/*`** (`AppLayout`, `DesktopSidebar`, `FloatingTabBar`, `ThemeToggle`, `RightPanel`) to mirror `Shell` + `MobileApp` visuals. Do **not** swap in `Shell.tsx`. Copy markup as-is, wire real data/auth hooks. |
| D6 | Responsive web: desktop sidebar (wide) → bottom-tab mobile (narrow). Replicate `MobileApp` mobile UI for phone-browser users. **Drop** the simulated iOS status bar / notch (real browser supplies its own). |
| D7 | Dark mode already wired (`ThemeContext` toggles `.dark`; ui-kit uses `dark:`). Reuse as-is. |
| D8 | Charts (`components/charts`) — **token-only** restyle (color/radius/font). No rewrite, no component swap. |
| D9 | "Coherent" = hard rule: **no inline hex, no raw `px` spacing**; every surface composed from ui-kit components + token classes. |
| D10 | Enforcement = **manual**, reviewed in each diff. No CI/lint infra now (can add `_adherence.oxlintrc.json` rule later). |
| D11 | Verification = **build only**. Do not run dev server; report at end of each phase, user runs it. |

---

## 4. Dedup (revised — primitives are load-bearing)

ui-kit and `primitives/` are **complementary**, not redundant:

- `primitives/` = atomic blocks: `Card` (8 importers), `Pill` (4), `Avatar` (2), `IconButton`,
  `ListRow`, `Markdown`, `PixelAgent`, `Clay3D`, `Skeleton`, `SuggestionChip`. **Keep all.**
- `ui-kit/` = composite domain cards + `StatChip` + `StrideMark`. ui-kit has **no** generic
  Card/Pill/Button/IconButton/Avatar.

Actions:
- **Delete `apps/web/src/components/landing/ui-kit/`** — orphaned (0 importers, confirmed).
- **Canonicalize the 2 overlaps:** pick one `StatChip` and one `StrideMark` (prefer ui-kit
  version), repoint primitive importers, remove the dupe.
- Unused primitives (`Skeleton`, `Clay3D`, `SuggestionChip` — 0 importers) left as-is (out of scope).

---

## 5. Page → component mapping

| Page (container) | Data source | ui-kit components |
|---|---|---|
| **Coach** `CoachPage` | existing chat/Convex | `ChatPanel`, `CoachBubble`, `AgentBadge`, `InputBar`, `NarrativeCard` |
| **Home** `HomePage` | `useQuery` brief/macros | `MacroCard`, `DailyGuidanceCard`, `StatChip`, `WaterTracker`, `StreakCard`, `NarrativeCard`, `InputBar` (via `AssistantConsole`) |
| **Nutrition** `NutritionPage` | meals/macros | `MealLogCard` + `MealLogCardEmpty`, `MacroCard`, `WaterTracker` |
| **Workouts** `WorkoutsPage` | workouts | `WorkoutCard` + `WorkoutCardEmpty`, `WorkoutSessionCard` |
| **Insights** `InsightsPage` | insights | `NarrativeCard`, `MilestoneCard`, `StatChip`, charts (token-only) |
| **History** `HistoryPage` | history days | DayRail pattern, `MealLogCard`/`WorkoutCard` summaries, charts (token-only) |
| **Recipes** `RecipesPage` | recipes | `RecipeCard`, `RecipeDetailModal`, `RecipeCreateModal` |
| **Profile/Settings** `ProfilePage` | profile | AccountPage pattern: `StatChip`, primitive `Card`, `ListRow` |
| Shared | — | `StrideMark`, `AnimatedNumber` |

---

## 6. Phases

- **Phase 0 — Foundation**
  - Token diff: `global.css` vs `Stride_Design_System/tokens/*` → fix drift, freeze `global.css`.
  - Dedup: delete `landing/ui-kit/`; canonicalize `StatChip` + `StrideMark`.
  - Chrome restyle: `DesktopSidebar`, `FloatingTabBar`, `AppLayout`, `ThemeToggle`, `RightPanel`
    → mirror `Shell` (desktop) + `MobileApp` (mobile, no fake status bar). Keep router/providers.
- **Phase 1 — Coach**
- **Phase 2 — Home**
- **Phase 3 — Nutrition**
- **Phase 4 — Workouts**
- **Phase 5 — Insights**
- **Phase 6 — History**
- **Phase 7 — Recipes**
- **Phase 8 — Profile/Settings**

Each phase: build presentation from ui-kit, keep hooks, no inline hex / no raw px, report at end (no dev server).

---

## 7. Out of scope

- **Landing** (`LandingPage`) — already done, do not touch.
- **Onboarding**, **Auth** (`OnboardingPage`, `AuthPages`) — no kit reference; revisit later.
- CI/lint automation.
- `apps/mobile` (real RN app — separate).

---

## 8. Success criteria

- Every in-scope page renders via ui-kit components + token classes.
- Zero inline hex, zero raw `px` spacing in touched files.
- Desktop sidebar + mobile bottom-tab chrome match `docs/ui-kit` look.
- Dark mode intact across all touched surfaces.
- `pnpm --filter @stride/web typecheck` + `build` pass.

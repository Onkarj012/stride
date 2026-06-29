# Design System Adoption Plan

Status: Planned · Owner: TBD · Source decisions: grilling session 2026-06-29

## Goal

Make the production app look like the Stride Design System on both phone and
desktop, from a **single source of truth** for tokens shared by web and mobile.

## Sources

- `Stride_Design_System/` — brand source of truth. Tokens (`tokens/colors.css`,
  `typography.css`, `spacing.css`, `fonts.css`), specimen cards in `guidelines/`,
  core + chat components, `SKILL.md`, App Mockup HTML.
- `docs/ui-kit/` — working React+Vite+Tailwind v4 recreation. 17 polished
  components + full `src/mobile/MobileApp.tsx` (683 lines). Best ready-to-port
  blueprint. Note: `ds-bundle/` and `.design-sync/` are build cache/preview
  artifacts, not the token truth — ignore for sourcing.

Brand non-negotiables (from DS readme/SKILL): conversation-first (lead with chat
+ log card, not forms/charts), sentence case everywhere, Manrope, weight not
italics for emphasis, lucide icons in pastel domain wells (peach=calories,
lavender=protein/AI, mint=workout, sky=hydration/sleep, bubblegum=mood), rounded
near-flat tactile, color as accent never wallpaper, first-class dark mode.

## Single source of truth — token pipeline

Problem: DS readme says its tokens were lifted FROM `frontend/src/styles/global.css`,
so today there are effectively two truths. Web wants CSS vars; React Native wants
a JS object. A raw `.css` can't serve both.

Decision: author tokens **once** in TypeScript, generate both targets.

```
packages/shared/
├── tokens.ts          # THE source: colors, type scale, spacing, radius,
│                      #   shadow, motion — light + dark
└── build-tokens.ts    # emits:
    ├── → apps/web/src/styles/tokens.generated.css   (CSS custom properties)
    └── → exported JS map for NativeWind config (apps/mobile)
```

- One edit to `tokens.ts` → run build → both apps update.
- Web's `global.css` keeps only base/helpers; variables come from the generated
  file. Diff against current `global.css` once to catch drift, then delete the
  duplicate values.
- Mobile reads the JS map (Tailwind 3.4 / NativeWind — see `MOBILE_APP_PLAN.md`).
  Token **values** identical across apps even though Tailwind majors differ.

Acceptance for the pipeline: regenerating produces today's web look with **no
visual change** (values match current `global.css`).

## Web adoption — surface by surface

Foundation first, then screens incrementally. Chat + Home first (chat is the
product), but plan covers all surfaces.

### Step W0 — foundation
- Token pipeline live (above), `apps/web` consuming generated CSS vars.
- Audit `apps/web/src/components/primitives/` against DS `components/core/`
  (Button, IconButton, Card, Pill, StatChip, Avatar, ProgressBar). Map gaps,
  align variants/props. No screen changes yet.

### Step W1 — Home + Chat (first shipped surface)
- Port DS/ui-kit cards into prod, wired to existing Convex data:
  CoachBubble, MealLogCard, MacroCard, StreakCard, NarrativeCard, MilestoneCard,
  InputBar/Composer, AgentBadge.
- Home: `components/home/*` reshaped to DS (AssistantConsole, QuickLogBar,
  NudgeInbox, SpecialistDock).
- Chat: `components/chat/MessageBubble` → DS ChatBubble + log cards.
- Floating ink nav bar (mobile) → side rail (desktop). Same system extended.

### Step W2 — Nutrition / Food
- `components/food/*`, `charts/MacroBars`, `MacroDonut` → DS macro language
  (peach calories, lavender protein, domain-keyed pastels).

### Step W3 — Workouts
- Port WorkoutCard / WorkoutSessionCard from ui-kit, wire to Convex.

### Step W4 — Insights
- `components/insights/*` (AgentBadge, MilestoneList, StreakCard, PeriodSwitcher)
  → DS. Prefer narrative + actionable copy over raw charts (brand rule).

### Step W5 — cross-cutting
- Verify dark mode first-class on every surface.
- Responsive breakpoints, desktop layout (side rail, wider grids).
- Copy pass: sentence case, encouraging-not-guilt, numbers human/compact.

## Responsive intent

Mobile-first; desktop = same token system + components, extended layout. Floating
ink bottom nav on phone, side rail on desktop. Cards reflow, no separate desktop
design language.

## Sequencing vs monorepo

- Token pipeline = Phase 2 of `MONOREPO_MIGRATION.md` (`packages/shared`).
- W0 primitives audit can start once Phase 2 merged.
- W1+ screen work runs in parallel with mobile build, both off the shared
  foundation.

## Branches

| Step | Branch |
|---|---|
| Token pipeline | `feat/shared-tokens-package` (= monorepo Phase 2) |
| W0 primitives | `feat/ds-primitives` |
| W1 home+chat | `feat/ds-home-chat` |
| W2–W4 | `feat/ds-<surface>` each |
| W5 polish | `feat/ds-responsive-darkmode` |

## Open items

- Confirm which current `primitives/*` already match DS vs need rewrite.
- Decide whether to keep three.js voxel surface or replace with DS illustration
  style (out of scope until W-screens reached).

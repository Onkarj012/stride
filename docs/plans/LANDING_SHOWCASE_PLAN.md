# Landing — App Showcase Section (plan)

Branch: `feat/landing-page-improvements`. Scope: **landing page only**. App-wide UI work = later, separate branch.

## Goal

Add one new section to the bottom of the landing page (just before the final CTA): a phone + desktop device showcase whose screens are composed from the **bespoke ui-kit** components. Nothing else on the landing page changes.

## Sources

- Bespoke components (source of truth): `/Users/onkarj012/Projects/VibeCoding/skill-testing/bespoke/stride/ui-kit/src/components/`
- Demo data to reuse: bespoke `src/App.tsx` (MACROS, MEALS, WORKOUTS, COACH_DATA, NARRATIVES, MILESTONES_SETS, STREAK_VALUES).
- Frame chrome to reuse: parked `frontend/src/components/landing/_backup/DeviceShowcase.tsx` (phone + browser frames, nav, auto-cycle, `useMediaQuery` phone-only-on-mobile).
- `docs/stride-ui-kit/` = generated preview artifacts. Ignore for code.

## Integration facts (verified)

- Frontend `src/styles/global.css` already defines every token bespoke needs: `ink, lavender, sky, surface/bg, peach, mint, bubblegum, sunshine, card, input, border, text-muted, text-subtle, --shadow-float` + dark `@custom-variant`. No token work needed.
- Deps present: `motion` v12 (`motion/react`), `gsap`, `lucide-react`. **`framer-motion` is NOT installed.**
- Every bespoke component imports `framer-motion`. Must rewrite import → `motion/react` on the copied files (mechanical, no new dep).
- Frontend has `@/hooks/useMediaQuery`, `@/lib/utils` (cn), `@/components/primitives/StrideMark` — DeviceShowcase frame deps resolve.

## Decisions (locked via grilling)

1. Keep parked **frame chrome**; rebuild the 4 **screen bodies** to compose real bespoke components.
2. Fix motion import by rewrite `framer-motion` → `motion/react` (no `framer-motion` install).
3. Copy only the needed component subset into `frontend/src/components/landing/ui-kit/`. Not all 17, not the whole bespoke project.
4. Presentation: phone+desktop side-by-side on wide viewports, phone-only on mobile; auto-cycle 4 screens (~4.2s) with pause-on-hover; **light mode only**.
5. Section wrapped in existing `sl-reveal` (GSAP fade-in); keep components' internal `motion/react` animation; respect `prefers-reduced-motion`. `sl-*` heading classes for consistency.
6. Screens cycle; data is one fixed snapshot per screen (no nested per-card rotation).
7. Verify in-browser (dev server), not just typecheck.

## Screen composition

- **Home** — DailyGuidanceCard + MacroCard + StreakCard.
- **Nutrition** — InputBar + 2× MealLogCard (confirmed + pending) + MacroCard.
- **Coach** — CoachBubble + AgentBadge row + NarrativeCard.
- **Insights** — MacroCard + MilestoneCard + NarrativeCard (weekly).
- Phone variant = tighter subset (1–2 cards); desktop variant = fuller stack.

## Components to copy → `frontend/src/components/landing/ui-kit/`

MacroCard, MealLogCard, WorkoutCard, CoachBubble, AgentBadge, StreakCard, DailyGuidanceCard, NarrativeCard, InputBar, StatChip, MilestoneCard, WaterTracker, AnimatedNumber (+ any transitive deps). Copy only those actually rendered by the 4 screens; drop the rest.

## Steps

1. **Copy components.** Pull the needed bespoke components into `frontend/src/components/landing/ui-kit/`. Rewrite `from 'framer-motion'` → `from 'motion/react'` in each. Resolve any transitive imports (e.g. AnimatedNumber).
2. **Demo data.** Add `showcaseData.ts` with the snapshot data lifted from bespoke `App.tsx` (only the screens' needs).
3. **Screen bodies.** New `landing/Showcase/screens.tsx` (or reuse mockScreens structure): `ScreenId = home|nutrition|coach|insights`, `Variant = phone|desktop`; each screen composes bespoke components per the composition above, phone vs desktop subset.
4. **Frame.** Adapt parked `DeviceShowcase.tsx` into `landing/Showcase/DeviceShowcase.tsx`: keep phone + desktop frames, nav, auto-cycle, pause-on-hover, `useMediaQuery`. Force light (no dark toggle). Point it at the new screens.
5. **Wire into LandingPage.** Import the showcase, drop a new `<section className="sl-section">` with `sl-reveal` wrapper + eyebrow + `sl-h2` (e.g. "See it running" / "The whole app, on every screen.") **immediately before** the `#start` CTA section. Touch nothing else.
6. **Verify.** Run frontend dev server, scroll to section: frames render, screens cycle, pause-on-hover works, light mode correct, layout responsive (phone-only on mobile), `prefers-reduced-motion` disables motion. Typecheck/lint clean.

## Out of scope

- No change to existing hero, 7 capability scroll-demos, nav, footer, CTA.
- No app-wide component adoption (later branch).
- No dark mode on landing.
- Leave `_backup/` parked files in place; new work lives under `landing/ui-kit/` + `landing/Showcase/`.

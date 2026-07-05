# Mobile UI Kit — Single Source of Truth (2-Phase Plan)

Status: proposed (awaiting approval). Owner: mobile. Date: 2026-06-30.

## Problem

Every button/row/toggle is an inline `Pressable` re-written per screen. No shared
component. Result:

1. **Black-on-black buttons** — buttons hardcode `backgroundColor: INK` (`#0d101b`).
   In dark mode that sits on `bg #0c0e16` → invisible. (`nutrition.tsx` New recipe
   L525, Save recipe L464.)
2. **Icon/label/control wrapping** — reported icon-line-1 / text-line-2 / control-line-3.
   NOTE: in current working-tree source the named rows are already correct horizontal
   layout (`settings.tsx` NavRow/ToggleRow, `ChatPanel.tsx` attach menu L279, `stry.tsx`
   New-chat L94, `history.tsx`). If the device still shows vertical stacking after a
   clean reload, the running JS bundle is stale — see "Bundle gate" below.
3. **Cramped controls** — chat composer / history items have no min tap size, ~6–10px
   gaps, inconsistent padding.
4. **No design concept** — colors picked per-call (raw `INK`/`LAVENDER`), not by
   theme-aware semantic role. Breaks in one of the two themes.

Root cause for all four: **no single source of truth, and color is not theme-aware.**

## Bundle gate (do FIRST, before judging any fix)

Dev build + `expo start -c` already done, still broken → suspect the dev client is
running an embedded/stale bundle instead of Metro's current JS.

30-second confirm:
1. `npx expo start -c`, open dev menu on device, ensure it shows **Connected** to this
   Metro (not "Using embedded bundle").
2. Temporary canary: bump a visible string (e.g. Settings title "Settings" → "Settings ✓").
   Reload. If the ✓ does NOT appear, the device is NOT running current code — the layout
   "bugs" are old JS, not the source. Fix the connection / rebuild dev client first.

This gate runs in parallel with Phase 1 — the refactor is correct regardless.

---

## PLAN 1 — Phase 1: Foundation + the 4 complaints

Goal: one source of truth for the primitives that cause complaints 1–4, theme-aware,
and refactor the four offending surfaces onto them. Nothing else changes.

### 1.1 Design tokens (`components/theme.ts`)

Add a `space` scale + semantic role colors to BOTH `LIGHT` and `DARK`. No screen ever
hardcodes a raw brand color for a surface again.

```ts
// spacing scale (4pt grid) — exported const, theme-independent
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const
export const RADIUS = { sm: 10, md: 14, lg: 18, pill: 999 } as const
export const TAP_MIN = 48  // min tap target (Apple 44 / Material 48)

// added to LIGHT and DARK theme objects — semantic roles:
//   buttonPrimaryBg / buttonPrimaryText
//   buttonSecondaryBg / buttonSecondaryText
//   buttonGhostText
//   fabBg / fabIcon
//   iconBadgeBg / iconBadgeIcon
//   accent (LAVENDER, used for active states)
```

Light `buttonPrimaryBg = INK`, text `#fff`. Dark `buttonPrimaryBg = LAVENDER` (or
`cardElev`), text = `INK`/`text` — chosen so contrast holds in dark. This is the actual
fix for complaint #1 (black-on-black).

### 1.2 Core primitives (`components/ui/`)

| File | API | Replaces |
|---|---|---|
| `Button.tsx` | `<Button variant="primary\|secondary\|ghost" size="md\|sm" icon? iconPosition? onPress>` | every inline action Pressable |
| `ListRow.tsx` | `<ListRow icon label subtitle? value? right? onPress?>` | settings NavRow/ToggleRow shell, chat attach items |
| `Toggle.tsx` | `<Toggle value onChange onColor?>` | settings switch |
| `SegToggle.tsx` | promote existing nutrition/insights seg toggle to shared | both seg toggles |
| `Card.tsx` | `<Card elevated? padded?>` | inline card Views |
| `IconBadge.tsx` | `<IconBadge icon size bg color>` | the 34/44 circular icon chips |
| `Fab.tsx` | `<Fab icon onPress>` | nutrition FAB (then deleted, see 1.4) |

Hard rules baked into `Button`/`ListRow`:
- `flexDirection: 'row'`, `alignItems: 'center'` — locked, can't drift.
- Label `<Text numberOfLines={1}>` + `flexShrink: 1` → text never wraps under icon.
- `minHeight: TAP_MIN`, `gap: SPACE.sm`, `paddingHorizontal: SPACE.lg`.
- Color comes ONLY from theme semantic tokens, never a raw constant.

### 1.3 Refactor the four surfaces onto primitives

- `app/settings.tsx` — NavRow/ToggleRow → `ListRow` + `Toggle`. Unit seg → `SegToggle`.
- `components/ChatPanel.tsx` — composer buttons → `Button`/`IconBadge`; attach menu
  items → `ListRow`; fix cramped gaps via `SPACE`.
- `app/stry.tsx` — New-chat → `Button variant="primary"`; drawer rows → `ListRow`.
- `app/(tabs)/nutrition.tsx` — New recipe / Save recipe → `Button` (fixes black-on-black).

### 1.4 Delete the floating FAB

Remove `nutrition.tsx` L542–563 (the `view === 'today'` FAB). Add is already covered by
`MealLogCardEmpty`. (Per your call #1.)

### 1.5 Acceptance criteria (Phase 1)

- [ ] Bundle gate passed (device runs current JS).
- [ ] No screen imports raw `INK`/`LAVENDER` for a button/surface bg — only theme tokens.
- [ ] Every primitive renders identical in light + dark, both legible (screenshots).
- [ ] All action rows render icon+label on ONE line at default + large OS font.
- [ ] Min tap target ≥ 48px on every button.
- [ ] Nutrition FAB gone.
- [ ] Screenshots of settings / stry / chat / nutrition in light AND dark, approved by you.
- [ ] No commit until you say so.

---

## PLAN 2 — Phase 2: Full system rollout

Goal: extend single-source-of-truth to EVERYTHING (cards, pills, chips, typography),
remove the last hardcoded colors, document the kit.

### 2.1 Typography primitive

`components/ui/AppText.tsx` — `<AppText variant="h1\|h2\|title\|body\|label\|caption">`.
Maps to the Manrope weight + size + color scale. Replaces ~all inline `fontFamily/fontSize`
triples across every screen. One place defines the type ramp.

### 2.2 Remaining primitives

| File | Replaces |
|---|---|
| `Pill.tsx` / `Chip.tsx` | `StatChip`, segmented labels, tags |
| extend `Card.tsx` | `MacroCard`, `StreakCard`, `MilestoneCard`, `NarrativeCard`, `WorkoutSessionCard`, `MealLogCard` shells |
| `ProgressBar.tsx` | history sleep/water bars, macro bars, water tracker |
| `IconButton.tsx` | header back/close/history circular buttons (settings/history/stry/account) |
| `Sheet.tsx` / `Modal` shell | AddSheet, recipe modal, drawers |

### 2.3 Screen sweep

Walk every screen (`index`, `nutrition`, `workouts`, `insights`, `account`, `stry`,
`history`, `settings`) + every component in `components/`. Replace inline styling with
primitives. Grep gate: **zero** raw `INK`/`LAVENDER`/hex for a surface/text color outside
`theme.ts` and `ui/`.

### 2.4 Documentation

`docs/ui-kit/README.md` — component table, props, do/don't, the token scale, screenshots
of each primitive in both themes. So future work uses the kit, never re-rolls inline.

### 2.5 Acceptance criteria (Phase 2)

- [ ] Grep finds no raw color literal for surfaces/text outside `theme.ts` + `components/ui/`.
- [ ] Every screen uses `AppText` for text and primitives for controls.
- [ ] Full light/dark screenshot set, approved.
- [ ] Kit documented.
- [ ] No commit until you say so.

---

## Sequencing

Phase 1 ships + you verify (kills all 4 complaints). Only then Phase 2. Each phase:
build → I screenshot light+dark → you review → you commit. I never commit.

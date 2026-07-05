# Stride UI Kit — conventions

Stride is an AI-first wellness app (diet, workouts, hydration, streaks, an AI coach). The kit is **React 19 + Tailwind CSS v4**, animated with **framer-motion**. Components are self-contained and importable directly — **no provider or context wrapper is required**; just render them. The look is soft and friendly: white cards on a light surface, rounded-full pastel chips, big bold numbers, Manrope throughout.

## Setup
- **No wrapper needed.** Every component works standalone (`<MacroCard kcal={1260} protein={88} carbs={132} fat={41} />`). They ship their own framer-motion entrance animations.
- **Font:** the design language is **Manrope** (`--font-sans`), already applied to `body` and loaded via a remote `@import` in `styles.css` — no `font-*` class needed.
- Read the real styles in `styles.css` and its import `_ds_bundle.css` before styling your own layout glue.

## Styling idiom — Tailwind v4 utility classes with the Stride token palette
Style with utility classes. The brand palette is exposed as Tailwind color tokens — use them as `bg-<token>` and `text-<token>`:

| Token | Hex | Typical use |
|---|---|---|
| `ink` | `#0D101B` | primary text, dark buttons/plates (`bg-ink text-white`) |
| `surface` | `#F8F8F8` | app background, inset rows |
| `card` / white | `#FFFFFF` | card backgrounds |
| `lavender` | `#B3A0FF` | brand accent, active states, AI/coach |
| `sky` | `#A0C6FF` | hydration, carbs, info |
| `mint` | `#B8E5C0` | protein, success, "do" |
| `peach` | `#FDB572` | calories, energy, diet |
| `bubblegum` | `#F4B5D6` | fat, mental, playful accent |
| `sunshine` | `#FFC93B` | streaks, highlights |

- Verified text colors: `text-ink`, `text-white`, `text-lavender`, `text-sky`. The accent colors (`peach`/`mint`/`sky`/`bubblegum`/`sunshine`) are used as **backgrounds** for pill chips with `text-ink` on top — that pastel-chip-on-white pattern is the kit's signature (see `StatChip`, `MacroCard`, `AgentBadge`).
- **Shape:** `rounded-full` for chips/pills/badges; cards use arbitrary radii (`rounded-[16px]`, `rounded-[20px]`). Soft elevation via arbitrary shadows (`shadow-[0_10px_30px_rgba(13,16,27,0.07)]`). The `@theme` also defines `--radius-card/pill/hero` if you prefer tokens.
- Type is bold and tabular for numbers: `font-extrabold`, `tabular-nums`, tight tracking on big figures.

## Composition example
```tsx
import { MacroCard, StatChip, CoachBubble } from 'stride-ui-kit'

<div className="bg-surface p-5 space-y-4">
  <div className="flex gap-3">
    <StatChip label="Weight" value="74 kg" color="mint" />
    <StatChip label="Goal" value="Fat loss" color="sky" />
  </div>
  <MacroCard kcal={1840} protein={130} carbs={150} fat={52} />
  <CoachBubble
    agentType="diet"
    messages={{
      gentle: "Halfway to your protein goal — a shake will carry you there.",
      motivating: "55g protein left. One solid meal and it's done. Go.",
      analytical: "Protein 55/110g. On pace to hit target by 7pm.",
    }}
  />
</div>
```
`StatChip`'s `color` is one of `mint | sky | peach | bubblegum`; `AgentBadge`/`CoachBubble` take an `agentType` (`diet | workout | sleep | hydration | habits | mental | overall`). Per-component APIs are in each `<Name>.d.ts`; usage in each `<Name>.prompt.md`.

# Stride (stride-ui-kit@0.0.1)

This design system is the published stride-ui-kit React library, bundled as a single
browser global. All 21 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.Stride`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.Stride.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AgentBadge } = window.Stride;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AgentBadge />);
```

## Tokens

91 CSS custom properties from stride-ui-kit. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (17): `--tw-border-style`, `--tw-shadow-color`, `--tw-inset-shadow-color`, …
- **spacing** (5): `--tw-space-y-reverse`, `--tw-inset-shadow`, `--tw-inset-shadow-alpha`, …
- **typography** (12): `--tw-font-weight`, `--tw-tracking`, `--font-sans`, …
- **shadow** (7): `--tw-shadow`, `--tw-shadow-alpha`, `--tw-ring-shadow`, …
- **other** (50): `--tw-translate-x`, `--tw-translate-y`, `--tw-translate-z`, …

## Components

### general
- `AgentBadge`
- `AnimatedNumber`
- `ChatPanel`
- `CoachBubble`
- `DailyGuidanceCard`
- `InputBar`
- `MacroCard`
- `MealLogCard`
- `MealLogCardEmpty`
- `MilestoneCard`
- `NarrativeCard`
- `RecipeCard`
- `RecipeCreateModal`
- `RecipeDetailModal`
- `StatChip`
- `StreakCard`
- `StrideMark`
- `WaterTracker`
- `WorkoutCard`
- `WorkoutCardEmpty`
- `WorkoutSessionCard`

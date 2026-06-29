# Design Tokens — Fitness App (Ronasit)

## Feel & Vibe

This is a **soft, playful, modern wellness app**. The design feels like a friendly personal trainer — warm, encouraging, never clinical. Key personality traits:

- **Approachable over intimidating** — pastel colors, rounded everything, no sharp edges
- **Confident but not loud** — bold typography does the heavy lifting; color is used sparingly as accent, not wallpaper
- **Tactile and physical** — 3D clay-style illustrations give the UI a sense of weight and touch; cards feel like physical objects you can pick up
- **Organized but alive** — clean grid layout with deliberate asymmetry (the 2-col plan grid with unequal card heights) keeps it from feeling rigid
- **Premium casual** — the floating dark nav bar and large rounded cards signal quality without feeling corporate

The overall mood: **a Sunday morning yoga class in a bright studio** — calm, energizing, and a little fun.

---

## Colors

### Core Palette

| Token | Hex | Usage |
|---|---|---|
| `color-ink` | `#0D101B` | Primary text, active nav bar, active date chip |
| `color-lavender` | `#B3A0FF` | Hero card background, brand accent |
| `color-sky` | `#A0C6FF` | Secondary accent, "Light" difficulty tag, "Goal" stat chip |
| `color-surface` | `#F8F8F8` | App background, card base |
| `color-white` | `#FFFFFF` | Card fills, icon button backgrounds, text on dark |

### Semantic / Content Accents
Used only inside content cards and tags — never as backgrounds for full screens.

| Token | Approx Hex | Usage |
|---|---|---|
| `color-peach` | `#FDB572` | "Medium" difficulty tag, "Daily calories" stat chip, kcal pill |
| `color-mint` | `#B8E5C0` | "Start weight" stat chip |
| `color-bubblegum` | `#F4B5D6` | Social links card |
| `color-sunshine` | `#FFC93B` | 3D illustration accent only |

### Text Colors

| Token | Value | Usage |
|---|---|---|
| `color-text-primary` | `#0D101B` | Headings, body |
| `color-text-secondary` | `#8A8A8A` | Captions, meta, subtitles |
| `color-text-on-dark` | `#FFFFFF` | Text on `color-ink` surfaces |
| `color-text-on-accent` | `#0D101B` | Text on pastel chips (always dark for contrast) |

---

## Typography

**Font family**: `Rany` (geometric sans-serif)
**Fallback stack**: `Manrope, "Plus Jakarta Sans", Inter, sans-serif`

### Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `text-display` | 36px | 800 ExtraBold | 1.1 | Hero card headline ("Daily challenge") |
| `text-h1` | 28px | 700 Bold | 1.2 | Screen titles, large card titles |
| `text-h2` | 22px | 700 Bold | 1.3 | Section headers ("Your plan") |
| `text-h3` | 18px | 700 Bold | 1.3 | Card titles, exercise names |
| `text-body` | 16px | 400 Regular | 1.5 | Body copy, list row primary text |
| `text-caption` | 14px | 400 Regular | 1.4 | Meta info, dates, room names |
| `text-micro` | 12px | 400 Regular | 1.3 | Tag labels, difficulty pills |
| `text-stat-value` | 22px | 700 Bold | 1.0 | Stat chip numbers (53.3 kg) |
| `text-stat-label` | 12px | 400 Regular | 1.2 | Stat chip labels ("Start weight") |

### Rules
- **Sentence case** everywhere in the app UI
- **Letter spacing**: `-0.5px` on display and h1; `0` on body and below
- **No italic** — weight contrast handles emphasis

---

## Spacing

Base unit: `4px`

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Icon internal padding |
| `space-2` | 8px | Chip internal padding, tight gaps |
| `space-3` | 12px | Card internal gap, grid gutter |
| `space-4` | 16px | Standard gap, section padding |
| `space-5` | 20px | Page horizontal padding |
| `space-6` | 24px | Card padding, section gap |
| `space-8` | 32px | Large section separation |
| `space-10` | 40px | Hero card vertical padding |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 10px | Small chips, tags, micro pills |
| `radius-md` | 16px | Stat chips, list row icons |
| `radius-lg` | 20px | Standard cards (plan cards) |
| `radius-xl` | 24px | Hero card, image header sheet |
| `radius-full` | 9999px | Fully rounded pills, avatar circles, nav bar |

---

## Shadows / Elevation

The design is nearly flat. Shadows are used only for floating elements.

| Token | Value | Usage |
|---|---|---|
| `shadow-none` | none | All cards on surface background |
| `shadow-float` | `0 8px 24px rgba(13,16,27,0.12)` | Floating nav bar |
| `shadow-card-hover` | `0 4px 16px rgba(13,16,27,0.08)` | Card press/hover state |

---

## Iconography

- **Style**: Stroke-based, 1.5px stroke width, rounded line caps and joins
- **Size**: 24px standard, 20px in list rows, 28px in nav bar
- **Recommended set**: Lucide Icons, Iconoir, or Phosphor (Regular weight)
- **Color**: `color-ink` on light surfaces; `color-white` on dark surfaces

---

## Component Patterns

### Floating Tab Bar
- Background: `color-ink` (`#0D101B`), `radius-full`
- Width: screen width minus `space-5` on each side
- Height: 64px
- Active indicator: white circle (52px), absolutely positioned, **protrudes above the bar's top edge by ~8px** — this is the signature visual
- Inactive icons: `color-white` at 50% opacity
- Active icon: `color-ink` inside the white circle
- Animation: spring-based horizontal slide (`stiffness: 200, damping: 20`)

### Cards
- Background: `color-white`
- Radius: `radius-lg` (20px)
- Padding: `space-6` (24px)
- No border, no shadow on default state
- Difficulty tag: small pill top-left, `radius-sm`, peach for Medium / sky for Light

### Hero Card
- Background: `color-lavender`
- Radius: `radius-xl` (24px)
- 3D illustration: positioned top-right, overflows card bounds by ~20px (z-index above card)
- Avatar stack: overlapping circles, -8px margin between each, +N overflow chip in `color-ink`

### Stat Chips (Profile)
- Three chips in a horizontal row, equal width, `radius-md`
- Colors: mint / sky / peach (left to right)
- Layout: label on top (micro), value below (stat-value bold)

### Date Strip
- Horizontal scroll, no scrollbar
- Each chip: 44×56px, `radius-full`, border `1px solid #E0E0E0` inactive
- Active: `color-ink` fill, `color-white` text
- Event dot: 4px circle in `color-ink` above the chip

### Image Header Screen
- Photo: full-bleed, ~58% of screen height
- White sheet: slides up over photo, `radius-xl` top corners only
- Overlap: title text sits at the photo/sheet seam, creating a layered depth effect
- Back/share buttons: white circle, `radius-full`, `shadow-card-hover`

---

## Motion

| Interaction | Duration | Easing |
|---|---|---|
| Tab switch (nav indicator) | — | Spring: stiffness 200, damping 20 |
| Screen transition | 250ms | ease-in-out |
| Card press scale | 150ms | ease-out → 0.97 scale |
| Date chip fill | 200ms | ease-in-out |
| Sheet slide-up | 350ms | Spring: stiffness 180, damping 22 |

---

## Imagery Guidelines

- **Photography**: bright, soft natural light; neutral warm backgrounds (white/beige walls, wood floors); real people, inclusive body types
- **3D illustrations**: matte clay render style; use palette colors (lavender, peach, mint, sunshine); no reflections or hard shadows; Spline or Blender clay shader
- **Aspect ratios**: hero card illustration is freeform/overflow; workout detail photo is 4:3 portrait crop

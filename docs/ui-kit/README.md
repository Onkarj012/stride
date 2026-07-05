# Stride Mobile UI Kit

Single source of truth for all mobile primitives. Every screen and component uses these — never roll inline styles.

---

## Design Tokens (`components/theme.ts`)

### Spacing (4pt grid)
```ts
SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 }
RADIUS = { sm: 10, md: 14, lg: 18, pill: 999 }
TAP_MIN = 48   // minimum tap target (Apple 44 / Material 48 → rounded up)
```

### Brand colors (theme-independent — never flip)
| Token | Value | Use |
|---|---|---|
| `INK` | `#0d101b` | Text on light pastels, inside `ui/` only |
| `LAVENDER` | `#b3a0ff` | Primary accent — inside `ui/` only |
| `PEACH` | `#fdb572` | Calories / energy pill |
| `MINT` | `#b8e5c0` | Protein pill |
| `SKY` | `#a0c6ff` | Carbs / sleep bar |
| `BUBBLEGUM` | `#f4b5d6` | Fat / water bar |
| `SUNSHINE` | `#ffc93b` | Streak bar |

### Semantic tokens (access via `useTheme()`)
| Token | Light | Dark | Purpose |
|---|---|---|---|
| `buttonPrimaryBg` | INK | LAVENDER | Primary action surface |
| `buttonPrimaryText` | `#fff` | INK | Text on primary surface |
| `buttonSecondaryBg` | `rgba(ink,0.06)` | `rgba(white,0.09)` | Secondary action |
| `buttonGhostText` | textMuted | textMuted | Ghost/text-only actions |
| `fabBg` | LAVENDER | LAVENDER | FAB/Stry launcher bg |
| `fabIcon` | INK | INK | Icon inside FAB |
| `accent` | LAVENDER | LAVENDER | Accent dots, active states |
| `chatUserBg` | INK | `#2a2d3e` | User message bubble bg |
| `chatUserText` | `#fff` | `#eceaf5` | User message bubble text |
| `tabIconActive` | INK | LAVENDER | Active tab icon/label |
| `tabIconInactive` | `rgba(ink,0.4)` | `rgba(white,0.4)` | Inactive tab icon/label |
| `iconBadgeBg` | `rgba(ink,0.08)` | `rgba(white,0.09)` | Icon badge background |

---

## Components

### `AppText`
Typography primitive. Replaces all inline `fontFamily/fontSize/color` triples.

```tsx
import { AppText } from '../components/ui'

<AppText variant="h1">Good evening</AppText>
<AppText variant="overline">Today's macros</AppText>
<AppText variant="body" color={t.textMuted}>Rest day</AppText>
```

| Variant | Font | Size | Default color |
|---|---|---|---|
| `hero` | ExtraBold | 58 | `t.text` |
| `h1` | ExtraBold | 26, LS -1 | `t.text` |
| `h2` | ExtraBold | 22, LS -0.5 | `t.text` |
| `title` | ExtraBold | 18, LS -0.5 | `t.text` |
| `label` | Bold | 14 | `t.text` |
| `body` | Medium | 14, LH 21 | `t.text` |
| `small` | Medium | 13 | `t.textMuted` |
| `caption` | Medium | 12 | `t.textSubtle` |
| `overline` | ExtraBold | 11, LS 2, UPPERCASE | `t.textSubtle` |

**Props:** `variant`, `color` (override), `style` (merge), `numberOfLines`

**Do:** Use `color` prop to override default. Use `style` for one-off size/weight overrides within the same weight family.

**Don't:** Hardcode `fontFamily`, `color`, or `fontSize` outside a `ui/` file.

---

### `Button`
Primary action button — theme-aware, enforces `TAP_MIN`.

```tsx
<Button label="New recipe" variant="primary" icon="plus" onPress={fn} />
<Button label="Cancel"     variant="ghost"   onPress={fn} />
<Button label="Save"       variant="secondary" size="sm" onPress={fn} />
```

| Prop | Type | Default |
|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'primary'` |
| `size` | `'md' \| 'sm'` | `'md'` |
| `icon` | `IconName` | — |
| `iconPosition` | `'left' \| 'right'` | `'left'` |
| `disabled` | `boolean` | `false` |

**Do:** Primary for the one main action per view. Ghost for inline text-links.

**Don't:** Use `backgroundColor: INK` or `backgroundColor: LAVENDER` inline — `primary` variant handles dark mode automatically.

---

### `Pill`
Brand-colored label chip for macro values, tags, summary stats.

```tsx
<Pill label="410 kcal"     color="peach" />
<Pill label="Breakfast"    color="lavender" size="sm" />
<Pill label="3 exercises"  color="primary" />
```

| `color` | Background | Text |
|---|---|---|
| `primary` | `t.buttonPrimaryBg` | `t.buttonPrimaryText` |
| `peach` | PEACH | INK |
| `mint` | MINT | INK |
| `sky` | SKY | INK |
| `bubblegum` | BUBBLEGUM | INK |
| `lavender` | LAVENDER | INK |
| `sunshine` | SUNSHINE | INK |

**Do:** Use `primary` when the pill needs to respect the current theme.

**Don't:** Render inline `<View style={{ backgroundColor: PEACH }}>` — all pill rendering goes through this component.

---

### `ListRow`
Settings-style row: icon badge + label + optional subtitle + value/right slot.

```tsx
<ListRow icon="flame" label="Daily calories" value="1800 kcal" />
<ListRow icon="bell"  label="Reminders" right={<Toggle value={on} onChange={setOn} />} showChevron={false} />
```

| Prop | Type | Notes |
|---|---|---|
| `icon` | `IconName` | Required |
| `label` | `string` | Required; `numberOfLines={1}` enforced |
| `subtitle` | `string` | Secondary line |
| `value` | `string` | Right-side label |
| `right` | `ReactNode` | Custom right slot (Toggle, etc.) |
| `onPress` | `fn` | Adds chevron by default when provided |
| `showChevron` | `boolean` | Override chevron visibility |
| `noBorder` | `boolean` | Remove bottom border (last row) |
| `iconBg` / `iconColor` | `string` | Override badge colors |

**Hard rules:** `flexDirection: 'row'`, `alignItems: 'center'`, `minHeight: TAP_MIN`. Label never wraps under icon.

---

### `Toggle`
Animated switch.

```tsx
<Toggle value={on} onChange={setOn} onColor={MINT} />
```

**Always pair with `ListRow` via the `right` prop.** Don't position standalone.

---

### `SegToggle`
Segmented control. Uses `buttonPrimaryBg/Text` for active state — theme-aware.

```tsx
<SegToggle value={view} options={[{id:'today',label:"Today"},{id:'week',label:"Week"}]} onChange={setView} />
```

---

### `IconButton`
Circular pressable icon target — header back/close/history buttons.

```tsx
<IconButton icon="back"    onPress={router.back} size={40} variant="ghost" iconSize={24} marginLeft={-8} />
<IconButton icon="history" onPress={openDrawer}  size={36} />
```

| `variant` | Background |
|---|---|
| `card` (default) | `t.card` + `cardShadow` |
| `ghost` | transparent |

**Do:** Use for all circular icon buttons in headers. `hitSlop` auto-extends to `TAP_MIN`.

---

### `IconBadge`
Non-interactive icon chip. Used inside `ListRow` and `ChatPanel` attach menu.

```tsx
<IconBadge icon="flame" size={16} bg={t.dimBgMid} color={t.textMuted} badgeSize={34} />
```

---

### `ProgressBar`
Animated fill bar used in `MacroSummary`, `WaterTracker`, history sleep/water.

```tsx
<ProgressBar value={0.72} color={SKY} height={8} />
<ProgressBar value={pct}  color={PEACH} animated={false} />
```

| Prop | Type | Default |
|---|---|---|
| `value` | `number` (0–1) | required |
| `color` | `string` | required |
| `height` | `number` | `6` |
| `animated` | `boolean` | `true` |

---

### `Card`
Elevated card shell.

```tsx
<Card elevated padded>{children}</Card>
```

---

### `Fab`
Floating action button (unused on nutrition after Phase 1 cleanup; available for future screens).

```tsx
<Fab icon="plus" onPress={fn} bottom={32} right={20} />
```

Uses `t.fabBg` / `t.fabIcon` — always theme-aware.

---

## Rules

| Do | Don't |
|---|---|
| Use `t.buttonPrimaryBg/Text` for action surfaces | `backgroundColor: INK` / `backgroundColor: LAVENDER` outside `ui/` |
| Use `AppText` for all text in screens | Inline `fontFamily/fontSize/color` triples |
| Use `Pill` for all branded chips | Inline `<View style={{ backgroundColor: PEACH }}>` |
| Use `ProgressBar` for all fill bars | Inline `scaleX` animated views |
| Use `IconButton` for header icon buttons | Repeated `width:36,height:36,borderRadius:18,backgroundColor:t.card` patterns |
| Use `t.accent` for decorative dots/accents | `color: LAVENDER` outside `ui/` |

## Grep gate

Zero violations allowed outside `theme.ts` and `components/ui/`:

```bash
grep -rn "backgroundColor: INK\|backgroundColor: LAVENDER\|color: INK\|color: '#0d101b'" \
  apps/mobile/app apps/mobile/components \
  --include="*.tsx" \
  | grep -v "components/ui/" | grep -v "components/theme"
```

Expected: empty output.

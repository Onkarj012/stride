# Stride UI Kit — Changelog

---

## [Unreleased] — Component Revisions

### CoachBubble
- **Reduced size ~25%**: container padding `p-5 → p-4`, rounded corners `rounded-[16px] → rounded-[14px]`, message bubble padding `p-4 → p-3`, min-height `72px → 54px`
- **Single-row buttons**: removed `flex-wrap` from style selector row; tightened gap `gap-2 → gap-1.5`, margin `mt-4 → mt-3`
- **Smaller button text**: `text-[13px] px-4 py-2 → text-[11px] px-3 py-1.5`, added `capitalize` so labels render correctly at smaller size

### DailyGuidanceCard
- **Reduced size ~25%**: container padding `p-5 → p-4`, rounded `rounded-[16px] → rounded-[14px]`, header margin `mb-4 → mb-3`, row gap `space-y-2.5 → space-y-2`
- **Badge at top corner**: restructured each row from horizontal flex (badge left + text right) to vertical card (badge pinned at top-left as a small pill, text content below). Row shape changed from `rounded-[14px] px-4 py-3.5` to `rounded-[12px] px-3 pt-2.5 pb-3`
- **Badge shrunk**: `text-[10px] px-2.5 py-1 → text-[9px] px-2 py-0.5`
- **Row text**: `text-[15px] → text-[12px]`

### InputBar
- **Redesigned to match ChatPanel style**: replaced old tab-based mode picker with a compact floating pill bar — mode icon button (cycles on click) · placeholder text · cursor blink · voice button · send button
- Old layout (large input area + 5 icon tabs below) removed entirely
- New container: `rounded-[18px] p-1.5 shadow-[0_10px_34px_...]` matching ChatPanel's input bar

### MacroCard
- **Equal-width pills**: changed chip container from `flex flex-wrap gap-2` to `flex gap-2`; each chip now uses `flex-1 min-w-0` so all four chips are always the same width
- **Pill shape**: `rounded-full → rounded-[14px]` (rect pill looks correct with two-line content); padding `px-3 py-2 → px-3 py-2.5`

### MilestoneCard
- **Center-aligned pills**: added `justify-center` to the milestone flex wrapper so pills sit centred rather than left-aligned

### RecipeCreateModal
- **Manual / Use AI toggle**: added a segmented toggle at the top of the form
  - **Manual mode** (default): existing full form — description, tag, prep time, macros, ingredient list, step list
  - **AI mode**: simplified to two large textareas — one for ingredients (one per line) and one for steps (one per line); AI hint text shown below
  - **Shared fields** (both modes): Recipe name, Servings
  - Submit button label changes: "Save recipe" (manual) / "Generate recipe" (AI)

### StatChip
- **Consistent shape**: `rounded-full → rounded-[14px]`; removed `min-w-[100px]` that caused uneven widths; padding `px-5 py-3 → px-4 py-2.5`; alignment `items-start → items-center`

### WorkoutCard
- **Tighter, consistent pills**: sets/reps/weight pills changed from `rounded-full px-4 py-2 text-[15px]` to `rounded-[10px] px-3 py-1.5 text-[13px] min-w-[56px] text-center`; row margin `mt-4 → mt-3`

### WorkoutSessionCard
- **Grid layout for sets**: changed per-exercise sets display from `flex flex-wrap gap-1.5` to `grid grid-cols-3 gap-1.5` — always 3 columns, giving a clean 2×3 (or N×3) grid
- Set chips: `inline-flex items-center gap-1 → flex items-center justify-between` so weight and reps sit at opposite ends of each grid cell

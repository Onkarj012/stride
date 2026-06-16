# Plan 001: Show per-ingredient macro breakdown in meal detail

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0cdf2da..HEAD -- frontend/src/pages/HistoryPage.tsx backend/convex/history.ts`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0cdf2da`, 2026-06-13

## Why this matters

Every meal that Stride logs stores a per-ingredient macro breakdown (`ingredientBreakdown` JSON column on `meals`). Right now that data is never shown to the user. The History page shows only totals (`m.calories`, `m.protein`, etc.). Surfacing the breakdown in an expandable row — matching the existing workout exercise-detail pattern — makes the system feel smarter and helps users verify AI-estimated macros at the ingredient level. This is a pure-frontend change; the data is already in the DB and already returned by `getDayHistory`.

## Current state

### Backend — `ingredientBreakdown` is stored and returned

`backend/convex/schema.ts:27`
```ts
ingredientBreakdown: v.optional(v.string()),  // JSON-encoded NutritionResult
```

`backend/convex/history.ts:80`
```ts
ingredientBreakdown: m.ingredientBreakdown ?? null,
```

`getDayHistory` returns each meal with `ingredientBreakdown` already included.

### `ItemBreakdown` shape (from `backend/convex/nutrition_engine.ts:34–44`)

```ts
export interface ItemBreakdown {
  food_text: string;       // user-facing name, e.g. "paneer"
  matched_food_name: string;
  grams: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;          // "usda" | "openfoodfacts" | "user_ingredient" | "ai"
  confidence: number;      // 0–1
}
```

The top-level `ingredientBreakdown` string decodes to `{ calories_kcal, protein_g, carbs_g, fat_g, confidence, items: ItemBreakdown[], unresolved: string[] }`.

### Frontend — meal row in `DayDetail` (no expand yet)

`frontend/src/pages/HistoryPage.tsx:300–344` — the meal `<li>` renders totals + an optional AI suggestion, no expand:

```tsx
<li key={m._id} className="flex items-start gap-3 px-4 py-3">
  <div className="flex-1 min-w-0 space-y-1">
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[14px] font-semibold text-text">{m.name}</span>
      <span className="text-[11px] text-text-muted">{m.time}</span>
    </div>
    <div className="flex flex-wrap gap-x-3 text-[12px] text-text-muted">
      <span>{m.calories} kcal</span><span>{m.protein}g protein</span>
      <span>{m.carbs}g carbs</span><span>{m.fat}g fat</span>
    </div>
    {m.aiSuggestion && <p className="text-[12px] italic text-text-subtle line-clamp-2">Stry: {m.aiSuggestion}</p>}
  </div>
  {/* action buttons */}
</li>
```

### Existing expand pattern to match — `WorkoutRow` (same file, lines 110–227)

`WorkoutRow` wraps its `<li>` in `className="divide-y divide-border/50"` and renders:
- A `hasDetail` boolean gating the expand toggle
- An expand button showing `{exercises.length} exercise{s}` with `ChevronDown/Up` inline
- Expanded section: `className="px-4 py-3 bg-bg/50 space-y-3"` with detail content

Match this visual pattern exactly.

### Repo conventions

- Tailwind CSS v4. Color tokens: `text-peach` (calories), `text-lavender` (protein), `text-sky` (carbs), `text-mint` (fat), `text-text-muted` (secondary), `bg-bg/50` (expanded bg), `bg-lavender/12` (badge bg), `border-border/40` (subtle divider).
- `useState` for local expand state. No new context, no new hook, no new file.
- `cn()` utility from `@/lib/utils`.
- All imports at file top; no inline requires.

## Commands you will need

| Purpose   | Command                              | Expected on success          |
|-----------|--------------------------------------|------------------------------|
| Typecheck | `cd frontend && bun run lint`        | exit 0, no type errors       |
| Dev       | `cd frontend && bun run dev`         | server starts on :5173       |

## Scope

**In scope** (the only file you should modify):
- `frontend/src/pages/HistoryPage.tsx`

**Out of scope** (do NOT touch):
- `backend/convex/history.ts` — data is already returned; no backend change needed.
- `frontend/src/components/coach/LogConfirmCard.tsx` — that component handles `draft.items` (text strings), not `ItemBreakdown` objects; separate concern.
- Any other file.

## Git workflow

- Branch: `advisor/001-ingredient-breakdown`
- Commit message style matches repo: `feat: per-ingredient breakdown in meal history detail`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add local expand state to the meal `<li>`

In `frontend/src/pages/HistoryPage.tsx`, the meal list is inside `DayDetail` at lines 294–348. The meal `<li>` is currently a flat row (no expand state).

Extract it into a small inline component `MealRow` (co-located in the same file, above `DayDetail`) that owns its own `open` state, mirroring the existing `WorkoutRow` pattern.

Target shape:

```tsx
function MealRow({ m, onEdit, onRelog, onDelete, relogging }: {
  m: any; onEdit: () => void; onRelog: () => void;
  onDelete: () => void; relogging: boolean;
}) {
  const [open, setOpen] = useState(false);

  const breakdown: { items: Array<{ food_text: string; grams: number; calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number; source: string }>; unresolved: string[] } | null = (() => {
    try { return m.ingredientBreakdown ? JSON.parse(m.ingredientBreakdown) : null; }
    catch { return null; }
  })();

  const hasDetail = breakdown != null && breakdown.items.length > 0;

  return (
    <li className="divide-y divide-border/50">
      {/* Collapsed summary — same content as current flat row but with expand toggle */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-text">{m.name}</span>
            <span className="text-[11px] text-text-muted">{m.time}</span>
            {hasDetail && (
              <button type="button" onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-0.5 rounded-full bg-peach/12 hover:bg-peach/20 px-2 py-0.5 text-[11px] font-semibold text-peach transition-colors">
                {breakdown!.items.length} ingredient{breakdown!.items.length !== 1 ? "s" : ""}
                {open ? <ChevronUp className="h-3 w-3" strokeWidth={2.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={2.5} />}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[12px] text-text-muted">
            <span>{m.calories} kcal</span><span>{m.protein}g protein</span>
            <span>{m.carbs}g carbs</span><span>{m.fat}g fat</span>
          </div>
          {m.aiSuggestion && <p className="text-[12px] italic text-text-subtle line-clamp-2">Stry: {m.aiSuggestion}</p>}
        </div>
        {/* action buttons — same as current */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={onEdit} aria-label="Edit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-card-elev transition-colors">
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button type="button" onClick={onRelog} disabled={relogging} aria-label="Log again"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-lavender hover:bg-lavender/10 transition-colors disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum hover:bg-bubblegum/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Expanded ingredient breakdown */}
      {open && hasDetail && (
        <div className="px-4 py-3 bg-bg/50 space-y-2">
          {breakdown!.items.map((item, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-semibold text-text capitalize">{item.food_text}</span>
              <div className="flex gap-3 text-text-muted shrink-0">
                <span className="text-peach">{item.calories_kcal} kcal</span>
                <span className="text-lavender">{item.protein_g}g P</span>
                <span className="text-sky">{item.carbs_g}g C</span>
                <span className="text-mint">{item.fat_g}g F</span>
                <span className="text-text-subtle">{item.grams}g</span>
              </div>
            </div>
          ))}
          {breakdown!.unresolved.length > 0 && (
            <p className="text-[11px] text-text-subtle pt-1 border-t border-border/40">
              Estimated: {breakdown!.unresolved.join(", ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
```

Make sure `ChevronUp` and `ChevronDown` are imported from `lucide-react` at the top of the file (they're already imported for the calendar navigation — confirm before adding a duplicate import).

**Verify**: `cd frontend && bun run lint` → exit 0.

### Step 2: Use `MealRow` inside `DayDetail`

Replace the current flat meal `<li>` (lines ~300–344) with `<MealRow>`. The `DayDetail` function already has `setEditMeal`, `handleRelogMeal`, and delete handlers — wire them to `MealRow` props.

Current flat list:
```tsx
{meals.map((m) => (
  <li key={m._id} className="flex items-start gap-3 px-4 py-3">
    ...flat content...
  </li>
))}
```

Replace with:
```tsx
{meals.map((m) => (
  <MealRow
    key={m._id}
    m={m}
    onEdit={() => setEditMeal(m as EditableMeal)}
    onRelog={() => handleRelogMeal(m._id as Id<"meals">, m.name)}
    onDelete={() => onDeleteMeal(m._id as Id<"meals">)}
    relogging={relogging === m._id}
  />
))}
```

**Verify**: `cd frontend && bun run lint` → exit 0.

## Test plan

This project has no frontend unit tests for page components (only `FoodSearch.test.tsx`, `NudgeInbox.test.tsx`, `usePrefs.test.ts`). No test to write for this change. Instead, manually verify in the browser:

1. Log a meal via the coach or home page.
2. Navigate to History (`/history`), select today.
3. Tap the meal tab — confirm the meal row shows an "N ingredients" badge if breakdown data exists.
4. Tap the badge — confirm the breakdown expands showing per-ingredient calories/protein/carbs/fat.
5. Tap again — confirm it collapses.
6. If a meal was logged without structured breakdown (old data or AI-only estimate), confirm no expand toggle appears and the row degrades gracefully.

## Done criteria

- [ ] `cd frontend && bun run lint` exits 0
- [ ] `MealRow` component exists in `frontend/src/pages/HistoryPage.tsx` above `DayDetail`
- [ ] The flat meal `<li>` inside `DayDetail` is replaced with `<MealRow>`
- [ ] No files outside `frontend/src/pages/HistoryPage.tsx` are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back if:
- The code at lines 300–344 of `HistoryPage.tsx` doesn't match the `<li>` excerpt above (codebase drifted).
- `getDayHistory` doesn't include `ingredientBreakdown` in its return type (check `backend/convex/history.ts:80`).
- A step's typecheck fails after a reasonable fix attempt.
- The fix requires touching any file outside the in-scope list.

## Maintenance notes

- If the `meals` schema ever stores `ingredientBreakdown` in a different column name, update the `JSON.parse` call in `MealRow`.
- The `ItemBreakdown` interface lives in `backend/convex/nutrition_engine.ts` — if fields are renamed there, the frontend breakdown render needs to match.
- `unresolved` items are ingredients the engine couldn't match to the food DB; showing them in the "Estimated:" footer is intentional to signal lower confidence.

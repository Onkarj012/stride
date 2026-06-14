# Plan 004: Surface behavioral patterns on the Home page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0cdf2da..HEAD -- frontend/src/pages/HomePage.tsx frontend/src/pages/InsightsPage.tsx`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0cdf2da`, 2026-06-13

## Why this matters

The pattern detection engine (`backend/convex/patterns.ts`) produces strings like "You tend to skip protein on Sundays" or "Consistent workout streak on weekdays". These show up only on `/insights` — a page users visit occasionally. The Vision doc's Principle 4 is "Daily Guidance Over Raw Analytics": the system should proactively answer "What matters most today?". Patterns are exactly that kind of insight. Surfacing 1–2 patterns on the Home page, below the daily guidance card, makes the system feel like it notices and learns — a key retention and "perceived intelligence" signal. This is a small, pure-frontend change that reuses the existing query.

## Current state

### Backend — `getPatterns` query returns `string[]`

`backend/convex/patterns.ts:116–147` — public query. Returns an array of human-readable pattern strings (e.g., `["You tend to miss protein on Sundays", "Your workouts are most consistent on weekdays"]`). Returns `[]` when there's insufficient data (needs ≥7 days of meals to compute protein-by-day patterns).

### Frontend — patterns only in InsightsPage

`frontend/src/pages/InsightsPage.tsx:342–360`

```tsx
function PatternsCard() {
  const patterns = useQuery(api.patterns.getPatterns, {}) as string[] | undefined;
  if (!patterns || patterns.length === 0) return null;
  return (
    <Card tone="card" radius="lg" padding="lg" className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-lavender" strokeWidth={2} />
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Patterns we noticed</h3>
      </div>
      <ul className="space-y-2">
        {patterns.map((p, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-text">
            <Lightbulb className="h-4 w-4 text-peach shrink-0 mt-0.5" strokeWidth={2} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

`InsightsPage` renders `<PatternsCard />` at line 426.

### Home page layout — where patterns slot in

`frontend/src/pages/HomePage.tsx` — the right column (or main scroll column on mobile) renders in order:
- `<AssistantConsole>` (primary chat)
- `<NudgeInbox>` (coaching nudges)
- `<StreakCard>` (streak)

The vision says patterns come after daily nudges and before or alongside streak. Insert between `<NudgeInbox>` and `<StreakCard>`.

The Home page already queries `api.insights.getTodayBrief` and `api.food_memory.getTopMemoriesPublic`. A second `useQuery` for patterns follows the same pattern — just add it.

Existing similar component on Home page for reference: `MemoryContextHint` (lines 229–290) — collapsible card using `motion/react`, `Brain` icon, `ChevronDown/Up` toggle. Match this visual weight — compact, dismissible if data exists.

### Repo conventions

- Tailwind tokens: `rounded-2xl`, `border border-border`, `bg-card`, `text-text`, `text-text-muted`, `text-lavender`, `text-peach`.
- Components in `frontend/src/pages/HomePage.tsx` are defined as local functions in the same file. Do NOT create a new file — add `PatternsNudge` as a local function in `HomePage.tsx`.
- Query import: `import { api } from "@convex/_generated/api"` — already present.
- `useQuery` from `convex/react` — already imported.
- `motion/react` — already imported.

## Commands you will need

| Purpose   | Command                       | Expected on success        |
|-----------|-------------------------------|----------------------------|
| Typecheck | `cd frontend && bun run lint` | exit 0, no type errors     |
| Dev       | `cd frontend && bun run dev`  | server starts on :5173     |

## Scope

**In scope** (only these files):
- `frontend/src/pages/HomePage.tsx`

**Out of scope** (do NOT touch):
- `backend/convex/patterns.ts` — query is complete; no backend change needed.
- `frontend/src/pages/InsightsPage.tsx` — keep the full `PatternsCard` there; this plan adds a compact version to Home, it does NOT remove from Insights.
- Any other file.

## Git workflow

- Branch: `advisor/004-patterns-homepage`
- Commit: `feat: surface behavioral patterns on home page`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `PatternsNudge` component to `HomePage.tsx`

Add this function in `frontend/src/pages/HomePage.tsx`, co-located with the other local components (e.g., after `MemoryContextHint` around line 290):

```tsx
function PatternsNudge() {
  const patterns = useQuery(api.patterns.getPatterns, {}) as string[] | undefined;
  if (!patterns || patterns.length === 0) return null;

  // Show at most 2 patterns on Home — full list is on /insights
  const shown = patterns.slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="w-full rounded-2xl border border-border bg-card px-4 py-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-lavender shrink-0" strokeWidth={2} />
          <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Pattern noticed</span>
        </div>
        {patterns.length > 2 && (
          <Link to="/insights" className="text-[11px] text-lavender hover:underline">
            See all
          </Link>
        )}
      </div>
      {shown.map((p, i) => (
        <div key={i} className="flex gap-2 text-[13px] leading-relaxed text-text">
          <Lightbulb className="h-3.5 w-3.5 text-peach shrink-0 mt-0.5" strokeWidth={2} />
          <span>{p}</span>
        </div>
      ))}
    </motion.div>
  );
}
```

You will need `TrendingUp` and `Lightbulb` from `lucide-react` (check if already imported — add only what's missing).

`Link` from `react-router-dom` — already imported (check top of file; it's used by `SpecialistDock`).

**Verify**: `cd frontend && bun run lint` → exit 0.

### Step 2: Render `<PatternsNudge>` in the Home page layout

Find where `<NudgeInbox>` and `<StreakCard>` are rendered in the page JSX (search for `NudgeInbox` in the file — it should be in the right column or main content area). Insert `<PatternsNudge />` between them:

```tsx
<NudgeInbox />
<PatternsNudge />
<StreakCard />
```

**Verify**: `cd frontend && bun run lint` → exit 0.

## Test plan

No automated tests for page layout in this repo. Manual verification:

1. Ensure you have ≥7 days of meal data logged (patterns engine requires this minimum). If testing on a fresh account, the component simply renders nothing — test with an account that has history.
2. Navigate to `/` (Home page) — confirm `PatternsNudge` appears below the nudge inbox and above the streak card.
3. Confirm it shows at most 2 patterns with "See all" link when more exist.
4. Click "See all" — confirm it navigates to `/insights`.
5. On an account with less than 7 days of data, confirm the component is invisible (returns null).

## Done criteria

- [ ] `cd frontend && bun run lint` exits 0
- [ ] `PatternsNudge` function exists in `frontend/src/pages/HomePage.tsx`
- [ ] `<PatternsNudge />` is rendered between `<NudgeInbox />` and `<StreakCard />` in the page JSX
- [ ] Shows at most 2 patterns; "See all" link appears when `patterns.length > 2`
- [ ] Returns null when patterns array is empty (no layout shift for new users)
- [ ] No files outside `frontend/src/pages/HomePage.tsx` are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report if:
- `api.patterns.getPatterns` is not present in `backend/convex/_generated/api.d.ts`.
- The layout structure of `HomePage.tsx` has changed significantly and the `NudgeInbox` + `StreakCard` placement cannot be identified without understanding the full layout — report the actual current structure.
- TypeScript errors that can't be resolved within 2 attempts.

## Maintenance notes

- `getPatterns` is a live Convex subscription — the component auto-updates when new pattern data is written. No polling needed.
- The 2-item cap is intentional: Home page is for daily clarity, not exhaustive analysis. If the product direction shifts toward more data-dense home views, revisit this cap.
- When AI-generated insights (`api.insights.getTodayBrief`) are extended to include pattern-aware suggestions, this component may become redundant — evaluate at that time.

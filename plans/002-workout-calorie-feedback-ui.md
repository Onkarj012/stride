# Plan 002: Calorie feedback UI on logged workouts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0cdf2da..HEAD -- frontend/src/pages/HistoryPage.tsx backend/convex/calibration.ts`
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

Stride has a full metabolic calibration engine (`backend/convex/calibration.ts`): users submit "too_high / accurate / too_low" feedback per workout, and after 5+ feedbacks the system adjusts the `metabolicFactor` (0.70–1.40) that scales all future calorie burn estimates. The backend is complete. But there is zero frontend to submit feedback — the mutation `api.calibration.submitCalorieFeedback` is never called from the UI. Without this, the calibration engine never activates for any user. This plan wires 3 feedback buttons into the expanded workout row in HistoryPage.

## Current state

### Backend — `submitCalorieFeedback` mutation signature

`backend/convex/calibration.ts:57–61`
```ts
export const submitCalorieFeedback = mutation({
  args: {
    workoutId: v.id("workouts"),
    feedback: v.union(v.literal("too_high"), v.literal("accurate"), v.literal("too_low")),
  },
```

After 5+ feedbacks, the handler adjusts `user_metabolic_profiles.metabolicFactor` by ±0.02. "accurate" reinforces without changing. Range capped 0.70–1.40.

### Frontend — `WorkoutRow` expanded section (no feedback buttons today)

`frontend/src/pages/HistoryPage.tsx:110–227` — `WorkoutRow` has an expand state and renders exercise detail in `className="px-4 py-3 bg-bg/50 space-y-3"`. At the end of that section there is a `{w.rationale}` paragraph (line 219). There are no feedback buttons.

The collapsed summary row at line 150 shows:
```tsx
{(w.caloriesBurned ?? 0) > 0 && <span>{w.caloriesBurned} kcal</span>}
```

### Repo conventions

- Tailwind tokens: `text-peach` (calories), `text-lavender` (protein), `bg-card-elev`, `border-border`, `text-text-muted`.
- `useMutation` from `convex/react` is already imported in this file (line 4).
- `useToast` from `@/context/ToastContext` is already used in `DayDetail`.
- Feedback state: track per workout ID so multiple workouts can be independently submitted.
- Do not add a new file — extend `WorkoutRow` in place.

### API path

`api.calibration.submitCalorieFeedback` — available from `@convex/_generated/api`. Confirm `calibration` is exported in the generated API before proceeding.

## Commands you will need

| Purpose   | Command                       | Expected on success        |
|-----------|-------------------------------|----------------------------|
| Typecheck | `cd frontend && bun run lint` | exit 0, no type errors     |
| Dev       | `cd frontend && bun run dev`  | server starts on :5173     |

## Scope

**In scope** (only these files):
- `frontend/src/pages/HistoryPage.tsx`

**Out of scope** (do NOT touch):
- `backend/convex/calibration.ts` — mutation is complete; no backend change needed.
- `frontend/src/components/coach/LogConfirmCard.tsx` — confirm-card feedback is a separate concern; this plan targets post-log history only.
- Any other file.

## Git workflow

- Branch: `advisor/002-workout-calorie-feedback`
- Commit: `feat: calorie feedback buttons on workout history rows`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add feedback mutation + state to `WorkoutRow`

`WorkoutRow` currently receives no mutation. Add `useMutation(api.calibration.submitCalorieFeedback)` inside the component, plus local state to track submission:

```tsx
function WorkoutRow({ w, onEdit, onRelog, onDelete, relogging }: { ... }) {
  const [open, setOpen] = useState(false);
  const submitFeedback = useMutation(api.calibration.submitCalorieFeedback);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null); // "too_high" | "accurate" | "too_low"
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  // ... rest of component
```

Add a handler:
```tsx
async function handleFeedback(rating: "too_high" | "accurate" | "too_low") {
  if (feedbackSent || feedbackLoading) return;
  setFeedbackLoading(true);
  try {
    await submitFeedback({ workoutId: w._id, feedback: rating });
    setFeedbackSent(rating);
  } catch {
    // silently fail — calibration is a nice-to-have, not critical
  } finally {
    setFeedbackLoading(false);
  }
}
```

**Verify**: `cd frontend && bun run lint` → exit 0.

### Step 2: Render feedback buttons in expanded section

Inside the expanded section (after the existing `{w.rationale}` paragraph, around line 219), add the feedback row. Only show if the workout has `caloriesBurned > 0`:

```tsx
{(w.caloriesBurned ?? 0) > 0 && (
  <div className="pt-2 border-t border-border/40">
    {feedbackSent ? (
      <p className="text-[11.5px] text-text-subtle">
        Thanks — calorie estimates will improve
        {feedbackSent === "too_high" ? " (adjusting down)" : feedbackSent === "too_low" ? " (adjusting up)" : ""}.
      </p>
    ) : (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-muted shrink-0">Was {w.caloriesBurned} kcal accurate?</span>
        {(["too_high", "accurate", "too_low"] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={feedbackLoading}
            onClick={() => handleFeedback(r)}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:text-text hover:border-lavender transition-colors disabled:opacity-50"
          >
            {r === "too_high" ? "Too high" : r === "accurate" ? "About right" : "Too low"}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

**Verify**: `cd frontend && bun run lint` → exit 0.

### Step 3: Confirm the `api.calibration` namespace is accessible

Run:
```bash
grep -r "calibration" backend/convex/_generated/api.d.ts | head -5
```
Expected: at least one match (e.g. `submitCalorieFeedback`). If no match, the Convex generated types may need regeneration — check `backend/convex/calibration.ts` exports `submitCalorieFeedback` as a named export with `export const`.

**Verify**: grep returns at least one match.

## Test plan

No automated frontend tests for page components in this repo. Manual verification:

1. Log a workout via coach or home.
2. Navigate to `/history`, select the day, open the workouts tab.
3. Expand a workout row — confirm the "Was X kcal accurate?" row appears if `caloriesBurned > 0`.
4. Click "Too high" — confirm buttons disappear and the "Thanks — calorie estimates will improve (adjusting down)" message appears.
5. Reload the page — confirm the feedback state is gone (local state, not persisted in UI; the DB record was written).
6. For a workout without `caloriesBurned`, confirm the feedback row is not shown.

## Done criteria

- [ ] `cd frontend && bun run lint` exits 0
- [ ] `WorkoutRow` in `HistoryPage.tsx` calls `useMutation(api.calibration.submitCalorieFeedback)`
- [ ] Feedback buttons are rendered inside the expanded section, gated on `caloriesBurned > 0`
- [ ] After submission, buttons are replaced by a confirmation message
- [ ] No files outside `frontend/src/pages/HistoryPage.tsx` are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report if:
- `api.calibration` is not present in `backend/convex/_generated/api.d.ts` — the namespace may not be exported.
- `w._id` is not typed as `Id<"workouts">` — check the `getDayHistory` return type in `backend/convex/history.ts` and cast if needed.
- The code at `WorkoutRow` lines 110–227 doesn't match the excerpts above (codebase drifted).
- Any step's typecheck fails after a fix attempt.

## Maintenance notes

- The calibration engine needs 5+ feedbacks before it starts adjusting `metabolicFactor`. New users get generic estimates until then; this is intentional (documented in `backend/convex/calibration.ts:55`).
- If `WorkoutRow` is ever extracted to its own component file, bring the mutation and feedback state with it.
- A future improvement: show current `metabolicFactor` in Profile/Settings to make calibration progress visible. That's a separate task.

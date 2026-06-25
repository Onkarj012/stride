# Phase 1 — `fix/ui-polish`

Frontend only. Lowest risk. Ship first. Independent of Phase 2 & 3.
Parent PRD: `prd/coach-agent-and-ui-batch.md`

## Goal
Fix mobile chat composer, add Recipes sub-tab to Nutrition, friendlier auth errors, bounded sizing pass. Desktop untouched.

## Tasks

### 1. Mobile chat composer redo (`CoachPage.tsx`)
- [ ] Move attachment trigger to **left** of textarea; swap `ImagePlus` → `+` icon. Opens existing dropdown (Photo/camera, Scan barcode). Reorg only — no new file types.
- [ ] Typing state (input non-empty): hide **mic only**. `+` stays. Send shows.
- [ ] Empty state: `+` left, mic right, send dimmed/hidden (existing scale behavior).
- [ ] Input + placeholder → `~text-[13px]` on mobile, keep `~0.95rem` on `lg:`.
- [ ] Squash empty-capsule scroll: smaller text + `rows=1` min-height aligned to line-height; `overflow-hidden` until content exceeds.
- [ ] Pin composer above keyboard via `visualViewport` listener (mobile only); cleanup on unmount.
- [ ] Desktop composer unchanged — verify.

### 2. Recipes sub-tab
- [ ] Extract `RecipesPage` body → shared `RecipesContent` component.
- [ ] Mount in `NutritionPage` under `Log | Recipes` tabs.
- [ ] Keep `/recipes` route mounting same component. `FloatingTabBar` stays 5 tabs.

### 3. Auth errors (`AuthPages.tsx`)
- [ ] Map common Clerk codes (`form_password_incorrect`, `form_identifier_exists`, `form_identifier_not_found`, invalid email) → friendly strings + generic fallback.
- [ ] Highlight offending field for password / email-not-found.

### 4. Sizing pass
- [ ] Tighten oversized text/padding on Auth, Coach, Nutrition + `MessageBubble` only. No repo-wide sweep.

## Verify (manual, mobile browser)
- Typing hides mic, `+` stays, can attach + type together.
- Empty capsule doesn't scroll; placeholder sized right.
- Composer stays pinned above keyboard when scrolling up through history.
- Nutrition → Recipes tab works on mobile; `/recipes` still loads on desktop.
- Wrong password / existing email → readable inline error, right field highlighted.
- Desktop chat visually unchanged.

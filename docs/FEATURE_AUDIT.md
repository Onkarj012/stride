# Stride Feature Audit

Last updated: 2026-06-10

## Legend

- ✅ Wired and working
- ⚠️ Partial / has known caveat (called out below)
- ❌ Not yet wired

---

## HomePage (`/`)

| Feature | Status | Notes |
|---|---|---|
| Window-aware greeting (morning / day / evening / night) | ✅ | `getTodayBrief` window logic drives copy in `AssistantConsole` |
| Hero voxel agent with idle / thinking / listening states | ✅ | `state` prop set from `thinking` / `voice.recording` |
| Voxel overflow on small screens | ✅ | Wrapped in `overflow-hidden rounded-full` container |
| **Text input → real AI** | ✅ | `useAction(api.ai.homepageInput)`, replaces canned flows |
| **Voice input → Groq Whisper** | ✅ | `useAudioRecorder` records webm, sends base64 to `api.ai.transcribe` |
| **Camera button → image input** | ✅ | Hidden `<input type="file" capture="environment">`, reads as data URL |
| **Cmd+V image paste** | ✅ | Page-wide `paste` listener captures `image/*` clipboard items |
| **Barcode scanner** | ✅ | "Scan barcode" item in camera menu opens `BarcodeModal` |
| Image preview with remove button | ✅ | Thumbnail above input, `X` to clear |
| Window-aware tap chips (suggestions) | ✅ | `WINDOW_TAPS` map per window — "Energy is low/okay/great" in morning, "Today was 1/3/5" in evening, etc. |
| Auto-log via AI (`⟦LOG_MEAL⟧` markers) | ✅ | Backend detects log markers; frontend toasts when `loggedItem` returned |
| Specialist coach badges on AI replies | ✅ | `coachType` from backend mapped to `Agent` via `coachToAgent` |
| Acknowledgment toasts after every log | ✅ | `useToast` shows macros / kcal / duration |
| Today's pulse stats | ✅ | Reads today's meals + workouts from `useLogs` + `getTodayBrief.stats` |
| Recent strip | ✅ | Reads from `useLogs` |
| Specialist dock (links to /coach) | ✅ | |
| Daily guidance card | ✅ | `getTodayBrief` returns `command` (doToday, recoverFrom, ignoreToday, tone) |
| Check-in questions | ✅ | `getTodayBrief` returns `checkIn` with window-aware quick questions; deduplicated via `user_behavior` |
| Coaching nudge card | ✅ | `getTodayBrief` nudge section |
| Water `+` / `−` quick add | ✅ | `wellness.addWater` persists to `water_logs` table |
| Streak card | ✅ | Uses `api.gamification.getState` and `api.history.getStreak` |
| Per-day homepage sessions | ✅ | `__HOMEPAGE_${today}__` — fresh session each calendar day |
| Deterministic confirm cards | ✅ | Every log produces a visible `ConfirmModal` card; no silent auto-apply |
| Food memory context | ✅ | `food_memory` entries injected into AI context; auto-learned from logs |
| Personal ingredient memory | ✅ | `user_ingredients` extracted by MemoryAgent from user messages; used in nutrition engine |

---

## CoachPage (`/coach`)

| Feature | Status | Notes |
|---|---|---|
| Convex chat sessions (sidebar list) | ✅ | `api.chat.getSessions`, `createSession`, `deleteSession`, `updateSessionTitle` |
| Real AI replies via `api.ai.chat` | ✅ | Auto-routing + log markers preserved |
| **Image attachment + paste** | ✅ | Same flow as HomePage |
| **Voice via Whisper** | ✅ | Same `useAudioRecorder` hook |
| **Barcode scanner** | ✅ | Camera menu → `BarcodeModal` |
| Specialist coach badges on replies | ✅ | `AgentBadge` shown when coach is non-overall |
| Coaching style picker (gentle/motivating/analytical) | ✅ | Stored in `user_settings.coachingStyle`; backend `coachType` arg is set to `"auto"` so backend keyword router handles routing |
| Per-message edit (user bubble) | ✅ | UI-only edit |
| Copy message | ✅ | |
| Draft confirm cards (LogConfirmCard) | ✅ | Triggered by `DRAFT_TRIGGERS` for demo phrases |
| Session title auto-generation on first message | ✅ | Backend uses LLM to generate title |
| Toast on logged item | ✅ | |
| Coach page layout (fixed inset, scroll lock) | ✅ | Fixed `inset-0` layout; locks main scroll on mount, restores on unmount |
| New chat button | ✅ | Visible in collapsed sidebar strip |
| Chat history toggle | ✅ | Always in same spot; sidebar strip never disappears |
| Markdown rendering | ✅ | `Markdown` component in coach bubbles |

---

## InsightsPage (`/insights`)

| Feature | Status | Notes |
|---|---|---|
| Period switcher (today / week / month) | ✅ | |
| Macro donut + bars | ✅ | Reads from `useLogs` for "today", `api.progress.getProgress` for week/month |
| Daily AI insights card | ✅ | `api.insights.getDailyInsights` query reads from `insights` table. Table is populated by `api.ai.generateDailyInsights` action triggered by cron (06:00 UTC) |
| Weekly AI summary | ✅ | `api.ai.generateWeeklySummary` action populates `weekly_summaries` table via cron (Mon 07:00 UTC) |
| Daily calorie bar chart | ✅ | `api.progress.getProgress` |
| Stats: workouts / avg calories / calorie goal | ✅ | |
| Milestones list | ✅ | Pure local function over `useLogs` |
| Food memory count | ✅ | `api.food_memory.getKnownCount` shows number of learned meals |
| Top memories | ✅ | `api.food_memory.getTopMemoriesPublic` shows top 6 learned meals |

---

## HistoryPage (`/history`)

| Feature | Status | Notes |
|---|---|---|
| 2-col layout: stat grid + calendar (left), tab nav + detail (right) | ✅ | Per latest UX request |
| 2×2 stat grid (calories / workout / sleep / water) | ✅ | Sleep + water now read from `wellness` tables |
| Calendar with meal/workout dots per day | ✅ | `api.history.getCalendar` |
| Day detail (meals / workouts tabs) | ✅ | `api.history.getDayHistory` |
| Delete meal / workout | ✅ | `api.meals.deleteMeal` / `api.workouts.deleteWorkout` |

---

## ProfilePage (`/profile`)

| Feature | Status | Notes |
|---|---|---|
| Real Clerk identity (name / email) | ✅ | `useUser()` |
| Profile stats from Convex | ✅ | `api.profile.getProfile` (weight / calorie / protein targets) |
| Activity tab (last 7 days breakdown) | ✅ | From `useLogs` |
| Goals tab | ✅ | Shows targets from profile |
| Milestones | ✅ | |
| Food memory count | ✅ | Shows learned meals count |

---

## SettingsPage (`/settings`)

| Feature | Status | Notes |
|---|---|---|
| Coaching style picker | ✅ | Stored in `user_settings.coachingStyle` via Convex (synced across devices) |
| Theme toggle (light/dark) | ✅ | `ThemeContext` + localStorage |
| Units toggle | ✅ | `user_settings.units` via Convex |
| Notifications toggle | ✅ | `user_settings.notifications` via Convex |
| Timezone offset | ✅ | `user_settings.timezoneOffsetMinutes` auto-set from browser |
| Export data (JSON) | ⚠️ | Stub — exports an empty payload. Could iterate on Convex queries to dump everything. |
| Clear all entries | ⚠️ | Currently calls `upsertSettings({})` — needs proper delete-all mutations |
| Sign out | ✅ | `useClerk().signOut()` |

---

## Sidebar / Layout

| Feature | Status | Notes |
|---|---|---|
| Real Clerk identity in user chip | ✅ | |
| Sign out from sidebar | ✅ | |
| Floating tab bar (mobile) | ✅ | |
| Voxel/SpecialistDock overflow on small screens | ✅ | Fixed with overflow-hidden + reduced sizes |
| Mobile horizontal overflow on `<main>` | ✅ | `overflow-x-hidden` added |
| Desktop sidebar | ✅ | Collapsible with toggle button |
| Brand header | ✅ | `Brand` component |

---

## Backend (Convex) — Working actions/queries used by frontend

| Module | Used | Notes |
|---|---|---|
| `api.users.ensureUser` | ✅ | Called on first sign-in |
| `api.profile.getProfile` / `upsertProfile` | ✅ | |
| `api.profile.getSettings` / `upsertSettings` | ✅ | |
| `api.profile.calculateTDEE` | ❌ | Not yet called from UI — could be wired into Profile/Onboarding |
| `api.meals.getMeals` / `addMeal` / `deleteMeal` | ✅ | Via `useLogs` |
| `api.workouts.getWorkouts` / `addWorkout` / `deleteWorkout` | ✅ | Via `useLogs` |
| `api.history.getCalendar` / `getDayHistory` | ✅ | |
| `api.history.getStreak` | ✅ | Used by StreakCard |
| `api.history.getHistoryInsights` | ❌ | Not yet used |
| `api.progress.getProgress` | ✅ | InsightsPage |
| `api.insights.getDailyInsights` / `getWeeklySummary` | ✅ | UI reads them; crons auto-populate daily/weekly |
| `api.insights.getTodayBrief` | ✅ | HomePage daily guidance |
| `api.chat.getSessions` / `getMessages` / `createSession` etc. | ✅ | CoachPage |
| `api.ai.chat` | ✅ | **Extended** with image arg |
| `api.ai.homepageInput` | ✅ | HomePage primary input |
| `api.ai.transcribe` | ✅ | **Wired** via `useAudioRecorder` |
| `api.ai.parseNutritionImage` | ⚠️ | Backend exists; chat action with vision covers most use cases |
| `api.ai.parseMeal` / `logMeal` | ❌ | Not directly used — chat action's `⟦LOG_MEAL⟧` markers do this internally |
| `api.ai.parseWorkout` / `logWorkout` | ❌ | Same — chat's auto-log handles it |
| `api.ai.suggestWorkout` | ❌ | Could be wired to a "suggest workout" UI |
| `api.ai.regenerateSuggestion` | ❌ | Per-meal suggestion regeneration — unused |
| `api.foods.searchFoods` | ✅ | Wired via `FoodSearch` |
| `api.foods.lookupBarcode` | ✅ | **Wired** via `BarcodeModal` |
| `api.foods.getRecentFoods` | ❌ | No "recent foods" UI |
| `api.gamification.getState` / `recordActivity` | ✅ | Used by StreakCard and log flows |
| `api.calibration.*` | ⚠️ | Backend uses internally for workout calorie estimation; no direct UI |
| `api.goals.*` | ⚠️ | `syncDayAdjustment` exists; not universally wired on all workout paths |
| `api.nudges.getActiveNudges` / `dismissNudge` | ✅ | NudgeInbox |
| `api.behavior.getBehaviorProfile` / `recordBehavior` | ✅ | Used by check-in questions and engagement tracking |
| `api.food_memory.getKnownCount` / `getTopMemoriesPublic` | ✅ | ProfilePage / InsightsPage |
| `api.recipes.getRecipes` / `createRecipe` / `logRecipe` | ✅ | RecipesPage |
| `api.wellness.*` | ✅ | Water, sleep, mood, steps all wired |

---

## Specialist coach routing — verified working

The backend's `chat` action runs `classifyCoachType(message)` against keyword sets and routes to one of:

| Coach (backend `coachType`) | Frontend `Agent` mapping | When |
|---|---|---|
| `overall` (StryCoach) | `main` | Default / mixed topics |
| `workout` (IronCoach) | `workout` | Lifting, running, sets, exercise terms |
| `diet` (MacroCoach) | `diet` | Meals, macros, food, calorie talk |
| `recovery` (RestCoach) | `sleep` | Sleep, soreness, rest, injury |
| `mindset` (MindCoach) | `wellness` | Habits, motivation, consistency |
| `water` (Axolotl) | `water` | Hydration |
| `habit` (Mouse) | `habit` | Consistency, habits |

The frontend now displays the coach badge after every reply (when not "main") via `AgentBadge`.

---

## Adaptive memory layers — verified working

| Layer | Table | How it works | Frontend exposure |
|---|---|---|---|
| **Food memory** | `food_memory` | Auto-learns from every meal log; Jaccard matching for auto-apply | `getKnownCount`, `getTopMemoriesPublic` queries |
| **Workout memory** | `workout_memory` | Auto-learns from every workout log; smoothed averages | Backend context injection only |
| **Personal ingredients** | `user_ingredients` | Extracted by MemoryAgent from user messages; per-100g nutrition | Backend context injection only |
| **Behavioral memory** | `user_behavior` | Engagement, nudge dismissals, suggestions, check-in answers | Drives `applyBehaviorBias` in coach routing |

---

## Known gaps to address next

1. **Domain-agent orchestration** — `agents.ts` has only MemoryAgent (implemented). Phase 5 stubs (DietAgent/WorkoutAgent/SleepAgent/CoachAgent) removed 2026-06-10; build real orchestration when needed.
3. **JS-based barcode camera scanner** — current `BarcodeModal` requires manual entry. Add `@zxing/browser` for live camera scanning.
4. **Per-ingredient breakdown in meal detail view** — `ingredientBreakdown` is stored on meal rows but not displayed in UI.
5. **Calorie feedback UI** — backend calibration exists (`calibration.submitCalorieFeedback`), no frontend to submit feedback.
6. **Cross-day pattern detection** — `patterns.getPatterns` exists but could be more prominently surfaced in UI.
7. **Export data** — still a stub; needs to iterate all Convex tables and dump to JSON.
8. **Clear all entries** — needs proper `clearAllData` mutation that covers all tables (currently incomplete).
9. **Web push for nudges** — schema `delivery` field exists but no push sender.

---

## Recently completed (since 2026-05-27)

1. ✅ **Personal ingredient memory** — homemade items remembered across sessions via `user_ingredients` + MemoryAgent
2. ✅ **Deterministic confirm cards** — every log produces a visible confirm card; no more silent auto-apply
3. ✅ **Homepage chat per-day** — new session each calendar day (`__HOMEPAGE_${today}__`)
4. ✅ **Check-in questions** — window-aware quick questions in `getTodayBrief` with deduplication
5. ✅ **Dynamic per-day targets** — `adjustCaloriesForDay` from `planBreakdown` + today's burn
6. ✅ **Coach page layout fixes** — fixed inset-0, scroll lock, sidebar toggle, markdown rendering
7. ✅ **Water / sleep / mood / steps tables** — schema and mutations all wired
8. ✅ **Settings synced to Convex** — `coachingStyle`, `units`, `notifications`, `timezoneOffsetMinutes` all persist
9. ✅ **Gamification wired** — `recordActivity` called on homepage confirm, quick log, recipes
10. ✅ **Food memory public queries** — `getKnownCount`, `getTopMemoriesPublic` exposed to frontend

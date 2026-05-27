# Stride Feature Audit

Last updated: 2026-05-27

## Legend

- ✅ Wired and working
- ⚠️ Partial / has known caveat (called out below)
- ❌ Not yet wired

---

## HomePage (`/`)

| Feature | Status | Notes |
|---|---|---|
| Window-aware greeting (morning / day / evening / night) | ✅ | `useDailyWindow` hook drives copy in `AssistantConsole` |
| Hero voxel agent with idle / thinking / listening states | ✅ | `state` prop set from `thinking` / `voice.recording` |
| Voxel overflow on small screens | ✅ | Wrapped in `overflow-hidden rounded-full` container |
| **Text input → real AI** | ✅ | `useAction(api.ai.chat)`, replaces canned flows |
| **Voice input → Groq Whisper** | ✅ | `useAudioRecorder` records webm, sends base64 to `api.ai.transcribe` |
| **Camera button → image input** | ✅ | Hidden `<input type="file" capture="environment">`, reads as data URL |
| **Cmd+V image paste** | ✅ | Page-wide `paste` listener captures `image/*` clipboard items |
| **Barcode scanner** | ✅ | "Scan barcode" item in camera menu opens `BarcodeModal` |
| Image preview with remove button | ✅ | Thumbnail above input, `X` to clear |
| Window-aware tap chips (suggestions) | ✅ | `WINDOW_TAPS` map per window — "Energy is low/okay/great" in morning, "Today was 1/3/5" in evening, etc. |
| Auto-log via AI (`⟦LOG_MEAL⟧` markers) | ✅ | Backend already detects log markers; frontend toasts when `loggedItem` returned |
| Specialist coach badges on AI replies | ✅ | `coachType` from backend mapped to `Agent` via `coachToAgent` |
| Acknowledgment toasts after every log | ✅ | `useToast` shows macros / kcal / duration |
| Today's pulse stats | ✅ | Reads today's meals + workouts from `useLogs` |
| Recent strip | ✅ | Reads from `useLogs` |
| Specialist dock (links to /coach) | ✅ | |
| Daily guidance card | ⚠️ | Currently uses static copy from `mock.dailyGuidance`. **TODO**: replace with backend-derived `getTodayBrief` query when ready |
| Coaching nudge card | ⚠️ | Same as above — uses static `coachingNudge` |
| Water `+` / `−` quick add | ⚠️ | Frontend `add("water", ...)` is a no-op because Convex schema has no water table. Logs locally only via the existing `useLogs` flow, but rows are dropped (silently). Schema needs a `water` table to persist |
| Streak card | ⚠️ | Uses local `lib/streaks.ts` over `useLogs`. Backend has `api.history.getStreak` and `api.gamification.getState` — could swap |

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
| Coaching style picker (gentle/motivating/analytical) | ✅ | Currently affects local UI greeting only; backend `coachType` arg is set to `"auto"` so backend keyword router handles routing |
| Per-message edit (user bubble) | ✅ | UI-only edit |
| Copy message | ✅ | |
| Draft confirm cards (LogConfirmCard) | ✅ | Triggered by `DRAFT_TRIGGERS` for demo phrases |
| Session title auto-generation on first message | ✅ | Backend uses LLM to generate title |
| Toast on logged item | ✅ | |

---

## InsightsPage (`/insights`)

| Feature | Status | Notes |
|---|---|---|
| Period switcher (today / week / month) | ✅ | |
| Macro donut + bars | ✅ | Reads from `useLogs` for "today", `api.progress.getProgress` for week/month |
| Daily AI insights card | ⚠️ | `api.insights.getDailyInsights` query reads from the `insights` table. Table is populated by `api.ai.generateDailyInsights` action — **must be triggered** (cron or user action). No automatic trigger yet. |
| Weekly AI summary | ⚠️ | Same caveat — `api.ai.generateWeeklySummary` action populates `weekly_summaries` table |
| Daily calorie bar chart | ✅ | `api.progress.getProgress` |
| Stats: workouts / avg calories / calorie goal | ✅ | |
| Milestones list | ✅ | Pure local function over `useLogs` |

---

## HistoryPage (`/history`)

| Feature | Status | Notes |
|---|---|---|
| 2-col layout: stat grid + calendar (left), tab nav + detail (right) | ✅ | Per latest UX request |
| 2×2 stat grid (calories / workout / sleep / water) | ✅ | Sleep + water show "—" because no schema for them yet |
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

---

## SettingsPage (`/settings`)

| Feature | Status | Notes |
|---|---|---|
| Coaching style picker | ✅ | Stored in localStorage via `usePrefs` (Convex schema doesn't have this field) |
| Theme toggle (light/dark) | ✅ | `ThemeContext` |
| Units toggle | ✅ | localStorage |
| Notifications toggle | ✅ | localStorage |
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
| `api.history.getStreak` | ⚠️ | Available; UI still uses local `lib/streaks.ts` |
| `api.history.getHistoryInsights` | ❌ | Not yet used |
| `api.progress.getProgress` | ✅ | InsightsPage |
| `api.insights.getDailyInsights` / `getWeeklySummary` | ✅ | UI reads them but they require `generateDailyInsights` / `generateWeeklySummary` actions to be triggered first |
| `api.chat.getSessions` / `getMessages` / `createSession` etc. | ✅ | CoachPage |
| `api.ai.chat` | ✅ | **Extended this round** with image arg |
| `api.ai.transcribe` | ✅ | **Wired this round** via `useAudioRecorder` |
| `api.ai.parseNutritionImage` | ❌ | Backend exists, not yet wired. The chat action with vision now covers most of this use case. |
| `api.ai.parseMeal` / `logMeal` | ❌ | Not directly used — chat action's `⟦LOG_MEAL⟧` markers do this internally |
| `api.ai.parseWorkout` / `logWorkout` | ❌ | Same — chat's auto-log handles it |
| `api.ai.suggestWorkout` | ❌ | Could be wired to a "suggest workout" UI |
| `api.ai.regenerateSuggestion` | ❌ | Per-meal suggestion regeneration — unused |
| `api.foods.searchFoods` | ❌ | No search UI yet |
| `api.foods.lookupBarcode` | ✅ | **Wired this round** via `BarcodeModal` |
| `api.foods.getRecentFoods` | ❌ | No "recent foods" UI |
| `api.gamification.getState` / `recordActivity` | ❌ | Not used by frontend |
| `api.calibration.*` | ❌ | Backend uses internally for workout calorie estimation; no direct UI |
| `api.goals.*` | ❌ | Not used yet |

---

## Specialist coach routing — verified working

The backend's `chat` action runs `classifyCoachType(message)` against keyword sets and routes to one of:

| Coach (backend `coachType`) | Frontend `Agent` mapping | When |
|---|---|---|
| `overall` (StrideCoach) | `main` | Default / mixed topics |
| `workout` (IronCoach) | `workout` | Lifting, running, sets, exercise terms |
| `diet` (MacroCoach) | `diet` | Meals, macros, food, calorie talk |
| `recovery` (RestCoach) | `sleep` | Sleep, soreness, rest, injury |
| `mindset` (MindCoach) | `habit` | Habits, motivation, consistency |

The frontend now displays the coach badge after every reply (when not "main") via `AgentBadge`.

---

## Known gaps to address next

1. **Water / sleep / mood / steps tables** — schema currently only has `meals` and `workouts`. The UI's `useLogs.add("water"...)` etc. silently no-ops. Should add tables and mutations.
2. **`getTodayBrief` query** — replace static `dailyGuidance` and `coachingNudge` mock with a real Convex query that reads yesterday + today + targets and returns the day's priority.
3. **Daily/weekly insights auto-generation** — currently the queries return empty unless someone calls `api.ai.generateDailyInsights`. Add a Convex cron or trigger from app load.
4. **JS-based barcode camera scanner** — current `BarcodeModal` requires manual entry. Add `@zxing/browser` for live camera scanning.
5. **`parseNutritionImage` for nutrition labels** — currently the chat action's vision handles most cases. For pure nutrition-label parsing with structured output, wire `parseNutritionImage` directly with a "Scan nutrition label" UI option.
6. **Streaks** — swap `lib/streaks.ts` for `api.history.getStreak` to keep streaks consistent with backend.
7. **`api.gamification.recordActivity`** — should be called on every meal/workout log to keep XP/streak state up to date.
8. **Settings** — add Convex `user_settings` schema fields for `units`, `notifications`, `coachingStyle`, `reduceMotion` so prefs sync across devices.

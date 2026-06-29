# Stride UI — Backend Integration Handoff

## What This Is

This project (`/kiro`) is a **UI mockup** for the Stride wellness platform. It is a standalone Vite + React app with no real backend — all data is mocked via `localStorage` and `src/data/mock.ts`.

The task is to **replace the mock data layer with real Convex + Clerk calls** from the existing Stride backend, making this the production frontend.

---

## Source of Truth for the Backend

The existing working project has:
- **Convex** as the primary database and server function layer
- **Clerk** for authentication
- **OpenRouter / Groq** for AI (via Convex actions)

All backend logic lives in `backend/convex/`. The frontend should only call Convex hooks — never Express/SQLite (that is legacy).

---

## This UI's Current Mock Layer

Everything to replace lives in:

| File | What it mocks |
|------|--------------|
| `src/lib/storage.ts` | `LogEntry` type, `localStorage` read/write, `addLog`, `deleteLog`, `clearLogs` |
| `src/hooks/useLogs.ts` | `useLogs()` — returns `{ logs, add, remove, clear }` from localStorage |
| `src/hooks/usePrefs.ts` | `usePrefs()` — user preferences (units, notifications, coachingStyle) from localStorage |
| `src/data/mock.ts` | Static user info, agent metadata, canned coach flows, suggestion chips |
| `src/lib/streaks.ts` | Streak calculation (pure function, can stay or use Convex gamification) |
| `src/lib/milestones.ts` | Milestone detection (pure function) |
| `src/lib/behavior.ts` | Suggestion ordering (pure function, can stay) |
| `src/lib/greeting.ts` | Time-based greeting (pure function, keep as-is) |
| `src/pages/CoachPage.tsx` | Chat stored in `sessionStorage` + `localStorage` — replace with Convex `chat_sessions` / `chat_messages` |

---

## Key UI Hooks to Replace

### `useLogs()` → Convex queries/mutations

Current signature:
```ts
const { logs, add, remove, clear } = useLogs();

// add(category, text, extras?)
// remove(id)
// clear()
```

Map to Convex:
- `logs` → `useQuery(api.meals.getMeals, { date })` + `useQuery(api.workouts.getWorkouts, { date })` + water/sleep/mood equivalents
- `add("meal", text, { meal: {...} })` → `useMutation(api.meals.addMeal)`
- `add("workout", ...)` → `useMutation(api.workouts.addWorkout)`
- `remove(id)` → `useMutation(api.meals.deleteMeal)` / workout equivalent
- `clear()` → bulk delete mutations

The `LogEntry` type in `src/lib/storage.ts` is a unified type covering all categories. You'll need to normalize between Convex's per-table structure and this UI's flat `LogEntry[]` shape — or refactor the UI to use per-category data directly.

### `usePrefs()` → Convex user_settings

Current signature:
```ts
const { prefs, update } = usePrefs();
// prefs: { units, notifications, coachingStyle, ... }
```

Map to:
- `useQuery(api.profile.getUserSettings)` 
- `useMutation(api.profile.updateUserSettings)`

### Coach chat → Convex chat_sessions / chat_messages

`CoachPage.tsx` currently stores messages in `sessionStorage` (current session) and `localStorage` (history). Replace with:
- `useQuery(api.chat.getSessions)` for history sidebar
- `useMutation(api.chat.createSession)` for new chat
- `useMutation(api.chat.addMessage)` for each message
- `useAction(api.ai.chat)` for AI responses (replaces the canned `cannedFlows` / `DRAFT_TRIGGERS`)

---

## Authentication

Add Clerk to this project:

```bash
bun add @clerk/react convex convex/react-clerk
```

Wrap the app in `main.tsx`:
```tsx
<BrowserRouter>
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <ThemeProvider>
        <SidebarProvider>
          <App />
        </SidebarProvider>
      </ThemeProvider>
    </ConvexProviderWithClerk>
  </ClerkProvider>
</BrowserRouter>
```

Add a `/sign-in` and `/sign-up` route using Clerk's hosted components or `<SignIn />` / `<SignUp />`.

Protect all existing routes with a `<ProtectedRoute>` wrapper that checks `useAuth().isSignedIn`.

On first load after sign-in, call `useMutation(api.users.ensureUser)` to create/link the Convex user row.

---

## Environment Variables to Add

Create `frontend/.env.local` (or `.env.local` at root of this project):

```
VITE_CONVEX_URL=<your convex deployment url>
VITE_CLERK_PUBLISHABLE_KEY=<your clerk publishable key>
```

---

## UI Pages → Backend Mapping

| UI Page | Current mock | Real backend |
|---------|-------------|--------------|
| `HomePage` | `useLogs()` localStorage | Convex meals/workouts/water queries for today |
| `HistoryPage` | `useLogs()` all entries | `api.history.getCalendarData`, per-day queries |
| `InsightsPage` | Static mock data in `src/data/mock.ts` | `api.insights.getInsights`, `api.progress.*` |
| `CoachPage` | `sessionStorage` + canned flows | `api.chat.*` + `api.ai.chat` action |
| `ProfilePage` | Static `user` object from mock.ts | `api.profile.getUserProfile`, `api.users.*` |
| `SettingsPage` | `usePrefs()` localStorage | `api.profile.getUserSettings`, `api.profile.updateUserSettings` |

---

## What to Keep As-Is

These are pure UI / pure logic — no backend needed:

- All component files under `src/components/`
- `src/lib/greeting.ts` — time-based greeting
- `src/lib/behavior.ts` — suggestion ordering
- `src/lib/milestones.ts` — milestone detection (or replace with Convex gamification)
- `src/lib/streaks.ts` — streak calc (or replace with `api.gamification.*`)
- `src/data/mock.ts` — keep `AGENT_META`, `categoryById`, `coachingPersonalities` (UI metadata only); remove `cannedFlows`, `DRAFT_TRIGGERS`, static `user` object
- All Tailwind / design token config
- Framer Motion animations
- Three.js voxel agents (`src/components/voxel/`)
- `src/context/`, `src/hooks/useTheme`, `src/hooks/useSidebar`

---

## Suggested Migration Order

1. **Install deps + add auth** — Clerk + Convex providers, sign-in/sign-up routes, `ensureUser` on load
2. **Replace `useLogs()`** — wire today's meals/workouts to real Convex queries; `add` / `remove` to mutations
3. **Replace `usePrefs()`** — wire to `api.profile.getUserSettings`
4. **Wire CoachPage** — replace `sessionStorage` chat with Convex sessions; replace canned flows with `api.ai.chat` action
5. **Wire HistoryPage** — replace localStorage log scan with Convex history queries
6. **Wire InsightsPage** — replace static mock charts with real `api.insights` / `api.progress` data
7. **Wire ProfilePage** — replace static `user` object with real profile query
8. **Remove mock layer** — delete `src/lib/storage.ts`, `src/hooks/useLogs.ts` localStorage impl, `src/hooks/useHistorySeed.ts`

---

## Notes on Type Compatibility

The UI uses a unified `LogEntry` type:
```ts
type LogEntry = {
  id: string;
  category: LogCategory;
  text: string;
  createdAt: number;
  meal?: { kcal, protein, carbs, fat, items? }
  workout?: { type, duration, distance, kcal, intensity }
  sleep?: { hours, quality }
  water?: { ml }
  mood?: { rating, note? }
  steps?: { count }
  agent?: Agent;
  aiInsight?: string;
}
```

Convex stores these in separate tables (`meals`, `workouts`, etc.). You'll need a normalizer function that maps Convex table rows → `LogEntry` shape, or refactor the UI components to accept per-category props directly. The normalizer approach is less invasive.

---

## Convex Import Path

The existing backend generates types at `backend/convex/_generated/api.d.ts`. In this project, set up the path alias so:

```ts
import { api } from "@convex/_generated/api";
```

resolves to the backend's generated types. Configure in `vite.config.ts`:

```ts
resolve: {
  alias: {
    "@convex": path.resolve(__dirname, "../backend/convex"),
  }
}
```

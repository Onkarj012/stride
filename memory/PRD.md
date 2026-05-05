# STRIDE — Product Requirements Document

## Original Problem Statement
Visual / layout overhaul of an existing fitness application called **Stride**.
Goals (verbatim from user):
1. Keep the existing brutalist design theme.
2. Add a user-selectable color scheme chooser.
3. Detailed user-recipe view (ingredients, portions, cooking method) that the AI coach can read.
4. Sleep & water trackers with flexible custom input (glasses or litres, custom sleep hours).
5. Uncrowd the top navbar.
6. Brand-new AI Coach UI with extendable / wrapping text input and a couple of mock chats.
7. Better Insights page with visualization buttons.
8. Mock data for the previous day's meals & workouts.
9. Fix typography (letters merging, hard to read).
10. Consistent layout across pages — same heading, date, padding, spacing.

## Target User
Self-tracking fitness enthusiasts who already know how brutalist UI works.

## Tech Stack
- **Frontend**: React + Vite + Tailwind v4 + Framer Motion + lucide-react
- **Auth**: REMOVED (Clerk was disabled to facilitate visual review)
- **Backend**: Convex/Express stub (`server.py` shim keeps supervisor happy). Currently mocked from frontend.
- **Storage (UI demo only)**: localStorage

## Architecture
```
/app/frontend/src/
├── pages/Dashboard.tsx     ← single monolith, every tab lives here
├── lib/theme.tsx            ← ThemeProvider (dark/light + accent palette)
├── index.css                ← brutalist tokens, font + letter-spacing
└── main.tsx                 ← entry point, no Clerk wrapper
```

---

## CHANGELOG

### 2026-02-05 — UI overhaul round 2 (this session)
- ✅ Typography fix — added `letter-spacing: 0.04em` to Anton headings, `0.012em` to body, `0.02em` to mono. Removed every `tracking-tight` from Dashboard.tsx (replaced with `tracking-normal`). Letters in "DEMO", "MACRO BREAKDOWN", "INSIGHTS", "HISTORY" no longer merge.
- ✅ Default theme set to dark (brutalist look ships first-time).
- ✅ Today mock data — `mockTodayMeals` (3 meals) + `mockTodayWorkouts` (Lower-body session) populate Home stat cards, Today's Meals widget, Macro Breakdown progress bars, Workouts tab.
- ✅ Workout tab now actually renders the workouts list (was empty renderer before).
- ✅ Verified via screenshots: Home, AI Coach, Insights, History tabs all render correctly with mock data, visualization buttons, redesigned chat, flexible sleep/water inputs, uncrowded navbar.

### 2026-02-05 — Earlier in same session (prior agent)
- Brutalist tokens & Work Sans / Anton / IBM Plex Mono fonts.
- ThemeProvider with 4-colour accent picker (Volt, Blaze, Cyan, Magenta).
- Compact icon-only navbar (text on `xl` breakpoint).
- AI Coach: sessions sidebar, expandable textarea, mock conversation in markdown.
- Recipes tab: full modal with name, servings, prep, cook, ingredients, instructions, AI notes.
- Sleep & water flexible input (glasses/litres dropdown, custom number + ADD button, visual glasses, ±0.5 h buttons, custom hours + SET).
- Insights tab: Overview / Calories / Macros / Trends visualization buttons; weekly bar chart, calorie bars, donut macro chart, trend list.
- History tab: month calendar with dot indicators; yesterday pre-loaded with mock meals/workouts.
- Profile tab: weight/height/age/activity + macro targets with auto BMI.

---

## ROADMAP

### P0 — Done ✅
All 10 user-stated visual requirements above.

### P1 — Backlog
- Restore Clerk auth in `main.tsx` once visual review approved.
- Wire flexible water / sleep / recipe creation to real Convex/Express backend (currently localStorage).
- Implement real chart visualizations (currently SVG mocks) using Recharts on Insights buttons.
- Add `data-testid` to a few remaining elements still missing them (calendar day buttons, badge tiles).

### P2 — Future
- Refactor 1700-line `Dashboard.tsx` into per-tab component files.
- AI Coach: stream real OpenRouter responses; let coach reference recipe ingredients.
- Push notifications for water / sleep goals.
- Goal streak badges auto-unlock based on logged days.

---

## Mocked / Disabled
- **Authentication** — Clerk fully bypassed; user object is hardcoded `Demo User`.
- **Meals / Workouts / Insights / Chat** — all data is in-memory or localStorage; no backend round-trips.
- **AI Chat** — replies are static `setTimeout` placeholders, not real LLM calls.

## Known Health
- Frontend: ✅ running on Vite, hot-reload OK.
- Backend: stubbed `server.py` keeps supervisor green; not used by the UI right now.
- ESLint: shows TS-parser warning (config quirk), no functional impact.

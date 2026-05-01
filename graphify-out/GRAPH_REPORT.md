# Graph Report - .  (2026-05-01)

## Corpus Check
- Corpus is ~13,783 words - fits in a single context window. You may not need a graph.

## Summary
- 129 nodes · 186 edges · 28 communities detected
- Extraction: 68% EXTRACTED · 31% INFERRED · 1% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.83)
- Token cost: 18,000 input · 4,500 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI Nutrition & Fitness|AI Nutrition & Fitness]]
- [[_COMMUNITY_Backend Core & Auth|Backend Core & Auth]]
- [[_COMMUNITY_Backend Source Files|Backend Source Files]]
- [[_COMMUNITY_Dashboard Operations|Dashboard Operations]]
- [[_COMMUNITY_Frontend Shell|Frontend Shell]]
- [[_COMMUNITY_Dashboard AI Features|Dashboard AI Features]]
- [[_COMMUNITY_Social Media Icons|Social Media Icons]]
- [[_COMMUNITY_Backend Infrastructure Docs|Backend Infrastructure Docs]]
- [[_COMMUNITY_Brand Identity|Brand Identity]]
- [[_COMMUNITY_Theme System|Theme System]]
- [[_COMMUNITY_Doc Icons|Doc Icons]]
- [[_COMMUNITY_App Root|App Root]]
- [[_COMMUNITY_App Entry|App Entry]]
- [[_COMMUNITY_Utilities|Utilities]]
- [[_COMMUNITY_Project Config|Project Config]]
- [[_COMMUNITY_Build Config|Build Config]]
- [[_COMMUNITY_Generated DataModel|Generated DataModel]]
- [[_COMMUNITY_Generated API Types|Generated API Types]]
- [[_COMMUNITY_Generated Server Types|Generated Server Types]]
- [[_COMMUNITY_Generated Server JS|Generated Server JS]]
- [[_COMMUNITY_Generated API JS|Generated API JS]]
- [[_COMMUNITY_Express Types|Express Types]]
- [[_COMMUNITY_Project Overview|Project Overview]]
- [[_COMMUNITY_NutriBot Coach|NutriBot Coach]]
- [[_COMMUNITY_Convex Server|Convex Server]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_App Render|App Render]]
- [[_COMMUNITY_Icons Container|Icons Container]]

## God Nodes (most connected - your core abstractions)
1. `requireAuth()` - 17 edges
2. `Express Application Setup` - 12 edges
3. `apiFetch()` - 11 edges
4. `users Table Schema` - 9 edges
5. `callAI Helper` - 9 edges
6. `AI Chat Coach Endpoint` - 9 edges
7. `meals Table Schema` - 8 edges
8. `workouts Table Schema` - 8 edges
9. `AI Daily Insights Endpoint` - 8 edges
10. `Progress Router` - 7 edges

## Surprising Connections (you probably didn't know these)
- `OpenRouter AI Integration` --conceptually_related_to--> `callAI Helper`  [INFERRED]
  README.md → backend/src/routes/ai.ts
- `Express + SQLite Backend` --conceptually_related_to--> `Express Application Setup`  [INFERRED]
  AGENTS.md → backend/src/index.ts
- `Project Structure` --conceptually_related_to--> `Express Application Setup`  [INFERRED]
  AGENTS.md → backend/src/index.ts
- `Convex Backend (README)` --conceptually_related_to--> `Convex Generated DataModel`  [INFERRED]
  README.md → backend/convex/_generated/dataModel.d.ts
- `Express + SQLite Backend` --conceptually_related_to--> `better-sqlite3 Database Instance`  [INFERRED]
  AGENTS.md → backend/src/db.ts

## Hyperedges (group relationships)
- **Express CRUD Route Pattern** — meals_crud_router, workouts_crud_router, chat_messages_router, profile_router [INFERRED 0.85]
- **AI OpenRouter Feature Suite** — ai_router, ai_callai_helper, ai_meal_estimate_endpoint, ai_chat_coach_endpoint, ai_daily_insights_endpoint, ai_workout_suggestion_endpoint, ai_weekly_summary_endpoint, ai_log_meal_endpoint, ai_log_workout_endpoint, ai_profile_macros_endpoint [INFERRED 0.90]
- **SQLite User-Centric Schema** — db_schema_users, db_schema_meals, db_schema_workouts, db_schema_daily_goals, db_schema_insights, db_schema_weekly_summaries, db_schema_user_profiles, db_schema_chat_messages [INFERRED 0.85]
- **Authentication Flow** — main_protected_route, main_clerk_provider, dashboard_page [INFERRED 0.85]
- **Dark Mode System** — theme_provider, theme_use_theme, dashboard_page [INFERRED 0.80]
- **AI-Powered Features** — dashboard_meal_ops, dashboard_workout_ops, dashboard_profile_ops, dashboard_chat, dashboard_ai_insights [INFERRED 0.85]
- **Icons SVG Sprite** — icons_bluesky_icon, icons_discord_icon, icons_documentation_icon, icons_github_icon, icons_social_icon, icons_x_icon [INFERRED 0.90]
- **Stride Brand Visual Elements** — favicon_favicon_svg, favicon_lightning_bolt, favicon_purple_palette [INFERRED 0.80]

## Communities

### Community 0 - "AI Nutrition & Fitness"
Cohesion: 0.17
Nodes (24): callAI Helper, AI Chat Coach Endpoint, AI Daily Insights Endpoint, AI Log Meal Endpoint, AI Log Workout Endpoint, AI Meal Estimate Endpoint, AI Profile Macros Endpoint, StrideCoach AI Persona (+16 more)

### Community 1 - "Backend Core & Auth"
Cohesion: 0.11
Nodes (22): Project Structure, AI Router, ensureUser(), Auth Me Router, Chat Messages Router, Convex Generated API, chat_messages Table Schema, daily_goals Table Schema (+14 more)

### Community 2 - "Backend Source Files"
Cohesion: 0.38
Nodes (0): 

### Community 3 - "Dashboard Operations"
Cohesion: 0.32
Nodes (11): apiFetch(), handleAIFillProfile(), handleDeleteMeal(), handleDeleteWorkout(), handleGenerateInsights(), handleGenerateWeeklySummary(), handleGenerateWorkoutSuggestion(), handleLogMeal() (+3 more)

### Community 4 - "Frontend Shell"
Cohesion: 0.22
Nodes (9): Convex Generated API Utility, App Component, apiFetch Backend Client, Dashboard Page, ClerkProviderWithRoutes, ProtectedRoute, ThemeContext, ThemeProvider (+1 more)

### Community 5 - "Dashboard AI Features"
Cohesion: 0.43
Nodes (7): AI Insights & Suggestions, AI Coach Chat, Data Fetchers, Effective Goals Derivation, Meal Operations, Profile Operations, Workout Operations

### Community 6 - "Social Media Icons"
Cohesion: 0.33
Nodes (6): Bluesky Clip Path, Bluesky Icon, Dark Fill Style #08060d, Discord Icon, GitHub Icon, X Icon

### Community 7 - "Backend Infrastructure Docs"
Cohesion: 0.67
Nodes (4): Express + SQLite Backend, Convex Generated DataModel, better-sqlite3 Database Instance, Convex Backend (README)

### Community 8 - "Brand Identity"
Cohesion: 0.83
Nodes (4): Stride Brand Identity, Stride Favicon SVG, Lightning Bolt Icon Shape, Purple Color Palette

### Community 9 - "Theme System"
Cohesion: 0.67
Nodes (0): 

### Community 10 - "Doc Icons"
Cohesion: 0.67
Nodes (3): Documentation Icon, Purple Stroke Style #aa3bff, Social Icon

### Community 11 - "App Root"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "App Entry"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Utilities"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Project Config"
Cohesion: 1.0
Nodes (2): Stride Project (AGENTS), Claude Configuration

### Community 15 - "Build Config"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Generated DataModel"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Generated API Types"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Generated Server Types"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Generated Server JS"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Generated API JS"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Express Types"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Project Overview"
Cohesion: 1.0
Nodes (1): Stride Project Overview

### Community 23 - "NutriBot Coach"
Cohesion: 1.0
Nodes (1): NutriBot 9000 AI Coach

### Community 24 - "Convex Server"
Cohesion: 1.0
Nodes (1): Convex Generated Server

### Community 25 - "Vite Config"
Cohesion: 1.0
Nodes (1): Vite Configuration

### Community 26 - "App Render"
Cohesion: 1.0
Nodes (1): Application Root Render

### Community 27 - "Icons Container"
Cohesion: 1.0
Nodes (1): Icons SVG Sprite

## Ambiguous Edges - Review These
- `better-sqlite3 Database Instance` → `Convex Generated DataModel`  [AMBIGUOUS]
  backend/convex/_generated/dataModel.d.ts · relation: conceptually_related_to
- `AI Router` → `Convex Generated API`  [AMBIGUOUS]
  backend/convex/_generated/api.d.ts · relation: conceptually_related_to

## Knowledge Gaps
- **36 isolated node(s):** `Stride Project Overview`, `OpenRouter AI Integration`, `NutriBot 9000 AI Coach`, `Stride Project (AGENTS)`, `Project Structure` (+31 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `App Root`** (2 nodes): `App()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Entry`** (2 nodes): `main.tsx`, `ProtectedRoute()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utilities`** (2 nodes): `utils.ts`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project Config`** (2 nodes): `Stride Project (AGENTS)`, `Claude Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Build Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generated DataModel`** (1 nodes): `dataModel.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generated API Types`** (1 nodes): `api.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generated Server Types`** (1 nodes): `server.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generated Server JS`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generated API JS`** (1 nodes): `api.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Express Types`** (1 nodes): `express.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project Overview`** (1 nodes): `Stride Project Overview`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `NutriBot Coach`** (1 nodes): `NutriBot 9000 AI Coach`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Convex Server`** (1 nodes): `Convex Generated Server`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `Vite Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Render`** (1 nodes): `Application Root Render`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Icons Container`** (1 nodes): `Icons SVG Sprite`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `better-sqlite3 Database Instance` and `Convex Generated DataModel`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `AI Router` and `Convex Generated API`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `requireAuth()` connect `AI Nutrition & Fitness` to `Backend Core & Auth`, `Backend Source Files`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `Express Application Setup` connect `Backend Core & Auth` to `AI Nutrition & Fitness`, `Backend Infrastructure Docs`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `ensureUser()` connect `Backend Core & Auth` to `Backend Source Files`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Express Application Setup` (e.g. with `Express + SQLite Backend` and `Project Structure`) actually correct?**
  _`Express Application Setup` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `users Table Schema` (e.g. with `UserRow Interface` and `meals Table Schema`) actually correct?**
  _`users Table Schema` has 8 INFERRED edges - model-reasoned connections that need verification._
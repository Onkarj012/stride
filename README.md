# AI Fitness Tracker

Track daily nutrition, workouts, and fitness progress with AI-powered insights.

## Features

- **Meal Tracking** — Log meals with macros. AI estimates nutrition from meal names.
- **Workout Tracking** — Log sets, reps, weight, and intensity. AI suggests workouts.
- **Dashboard** — Calories, macros, workout stats, 7-day history with charts.
- **AI Coach (NutriBot 9000)** — Context-aware chat with real-time meal & workout data.
- **Daily Insights & Weekly Summaries** — AI-generated reports and trends.
- **Light/Dark Theme** — Toggle with system preference detection.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS v4, Framer Motion |
| Charts | Recharts |
| Backend | [Convex](https://convex.dev) (real-time DB + serverless functions) |
| AI | OpenRouter (GPT-4o-mini) |
| Auth | Token-based with bcrypt |

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenRouter](https://openrouter.ai/keys) API key (for AI features)

### Setup

```bash
# Install dependencies
cd backend && npm install && cd ../frontend && npm install

# Configure environment
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env.local` and add your OpenRouter API key:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### Development

Run each service in its own terminal:

```bash
# Terminal 1 — Convex backend
cd backend && npm run dev

# Terminal 2 — Vite frontend
cd frontend && npm run dev
```

This starts:
- `backend/` — Convex dev server at `http://127.0.0.1:3210`
- `frontend/` — Vite dev server at `http://localhost:5173`

### Other Commands

```bash
cd frontend && npm run build   # Build frontend for production
cd backend && npm run deploy   # Deploy Convex functions
```

## Project Structure

```
├── backend/          # Convex backend
│   └── convex/       # Schema, mutations, queries, AI actions
├── frontend/         # React + Vite + Tailwind
│   └── src/          # Pages, components, lib
└── README.md
```

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `CONVEX_DEPLOYMENT` | `backend/.env.local` | Convex deployment identifier |
| `OPENROUTER_API_KEY` | `backend/.env.local` | OpenRouter API key for AI features |
| `VITE_CONVEX_URL` | `frontend/.env.local` | Convex backend URL |

# Stride

Track daily nutrition, workouts, and fitness progress with AI-powered insights.

## Features

- **Meal Tracking** — Log meals with macros. AI estimates nutrition from meal names, images, and voice.
- **Workout Tracking** — Log sets, reps, weight, and intensity. AI suggests workouts and calculates calorie burn.
- **Dashboard** — Calories, macros, workout stats, 7-day history with charts.
- **AI Coach (Stry)** — Context-aware chat with real-time meal & workout data, 7 specialist coaches.
- **Daily Insights & Weekly Summaries** — AI-generated reports and trends, delivered via cron.
- **Adaptive Memory** — Auto-learns your foods, workouts, and custom ingredients for better accuracy over time.
- **Light/Dark Theme** — Toggle with system preference detection.
- **Voice, Image, Barcode** — Multi-modal input for effortless logging.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Framer Motion |
| Charts | Recharts |
| Backend | [Convex](https://convex.dev) (real-time DB + serverless functions) |
| Auth | Clerk (`@clerk/react`) |
| AI | OpenRouter — GPT-4o-mini (parsing) + Claude Sonnet 4.6 (chat) + Groq Whisper (voice) |

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenRouter](https://openrouter.ai/keys) API key (for AI features)
- A [Clerk](https://clerk.dev) account (for auth)
- A [Convex](https://convex.dev) account (for backend)

### Setup

```bash
# Install dependencies
# (Note: project uses bun, but npm works too)
cd backend && bun install && cd ../frontend && bun install

# Configure environment
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env.local` and add your API keys:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
GROQ_API_KEY=gsk-your-key-here
```

Edit `frontend/.env.local` and add your Convex URL and Clerk key:

```
VITE_CONVEX_URL=https://your-convex-deployment.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Configure Clerk JWT issuer in the Convex dashboard for `auth.config.ts`.

### Development

Run each service in its own terminal:

```bash
# Terminal 1 — Convex backend
cd backend && npx convex dev

# Terminal 2 — Vite frontend
cd frontend && bun run dev
```

This starts:
- `backend/` — Convex dev server (typically at `http://127.0.0.1:3210`)
- `frontend/` — Vite dev server at `http://localhost:5173`

### Other Commands

```bash
cd frontend && bun run build   # Build frontend for production
cd backend && npx convex deploy   # Deploy Convex functions
cd backend && bun run typecheck   # TypeScript check
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
| `VITE_CONVEX_URL` | `frontend/.env.local` | Convex backend URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | `frontend/.env.local` | Clerk frontend key |
| `OPENROUTER_API_KEY` | `backend/.env.local` + Convex dashboard | OpenRouter API key for AI |
| `GROQ_API_KEY` | `backend/.env.local` + Convex dashboard | Groq API key for voice transcription |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex dashboard | JWT issuer for auth |
| `CONVEX_DEPLOYMENT` | `backend/.env.local` | Convex deployment identifier |

## Documentation

- `docs/SYSTEM.md` — Comprehensive system reference (as implemented)
- `docs/TECH_STACK.md` — Architecture and tech stack details
- `docs/FEATURE_AUDIT.md` — Feature-by-feature audit of what's working
- `docs/ASSESSMENT.md` — System assessment and strategic direction
- `docs/VISION.md` — Long-term product vision
- `docs/UX-DAILY-EXPERIENCE.md` — Daily user experience design


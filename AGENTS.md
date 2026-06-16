# Stride

Track daily nutrition, workouts, and fitness progress with AI-powered insights.

## Project Structure

```
├── backend/          # Convex backend
│   └── convex/       # Schema, queries, mutations, actions, crons
├── frontend/         # React 19 + Vite + Tailwind CSS v4
│   └── src/          # Pages, components, lib
└── README.md
```

## Commands

Use **bun** for installing dependencies.

```bash
# Install deps for both
cd backend && bun install && cd ../frontend && bun install

# Backend (Convex dev server)
cd backend && npx convex dev

# Frontend (Vite dev server at http://localhost:5173)
cd frontend && bun run dev

# TypeScript check
cd backend && bun run typecheck
cd frontend && bun run typecheck

# Build frontend
cd frontend && bun run build
```

## Tech Stack

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Runtime   | Node.js (via tsx)                                       |
| Frontend  | React 19, TypeScript, Vite 8, Tailwind CSS v4           |
| Styling   | Tailwind CSS v4, Framer Motion, class-variance-authority |
| Charts    | Recharts                                                |
| Backend   | Convex (real-time DB + serverless functions)            |
| AI        | OpenRouter (GPT-4o-mini parse · Claude Sonnet 4.6 chat), Groq Whisper (voice) |
| Auth      | Clerk (`@clerk/react` + `ConvexProviderWithClerk`)     |

## Environment Variables

| Variable              | Location               | Description                    |
| --------------------- | ---------------------- | ------------------------------ |
| `VITE_CONVEX_URL`     | `frontend/.env.local`  | Convex client URL                |
| `VITE_CLERK_PUBLISHABLE_KEY` | `frontend/.env.local` | Clerk frontend key      |
| `OPENROUTER_API_KEY`  | `backend/.env.local` + Convex dashboard | OpenRouter API key for AI |
| `GROQ_API_KEY`        | `backend/.env.local` + Convex dashboard | Groq API key for transcription |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex dashboard   | JWT issuer for auth            |
| `CONVEX_DEPLOYMENT`   | `backend/.env.local`   | Convex deployment id             |


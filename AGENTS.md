# AI Fitness Tracker

Track daily nutrition, workouts, and fitness progress with AI-powered insights.

## Project Structure

```
├── backend/          # Convex backend (schema, queries, mutations, AI actions)
│   └── convex/       # All backend logic lives here
├── frontend/         # React 19 + Vite + Tailwind CSS v4
│   └── src/          # Pages, components, lib
├── .agents/          # Agent skills (Convex helpers)
├── .claude/          # Claude skills (Convex helpers)
└── README.md
```

## Commands

Use **bun** for everything — never use npm.

```bash
# Install deps for both
cd backend && bun install && cd ../frontend && bun install

# Backend (Convex dev server at http://127.0.0.1:3210)
cd backend && bun run dev
cd backend && bun run deploy
cd backend && bun run dashboard

# Frontend (Vite dev server at http://localhost:5173)
cd frontend && bun run dev
cd frontend && bun run build
cd frontend && bun run lint
```

## Tech Stack

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Runtime   | [Bun](https://bun.sh)                                   |
| Frontend  | React 19, TypeScript, Vite 8, Tailwind CSS v4           |
| Styling   | Tailwind CSS v4, Framer Motion, class-variance-authority |
| Charts    | Recharts                                                |
| Backend   | [Convex](https://convex.dev) (real-time DB + functions) |
| AI        | OpenRouter (GPT-4o-mini)                                |
| Auth      | Token-based with bcryptjs                               |

## Environment Variables

| Variable              | Location               | Description                    |
| --------------------- | ---------------------- | ------------------------------ |
| `CONVEX_DEPLOYMENT`   | `backend/.env.local`   | Convex deployment identifier   |
| `OPENROUTER_API_KEY`  | `backend/.env.local`   | OpenRouter API key for AI      |
| `VITE_CONVEX_URL`     | `frontend/.env.local`  | Convex backend URL             |

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `bunx convex ai-files install`.
<!-- convex-ai-end -->

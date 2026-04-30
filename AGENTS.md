# Stride

Track daily nutrition, workouts, and fitness progress with AI-powered insights.

## Project Structure

```
├── backend/          # Express + TypeScript + SQLite
│   └── src/          # Routes, middleware, database
├── frontend/         # React 19 + Vite + Tailwind CSS v4
│   └── src/          # Pages, components, lib
└── README.md
```

## Commands

Use **bun** for installing dependencies, and **tsx** for running the backend.

```bash
# Install deps for both
cd backend && bun install && cd ../frontend && bun install

# Backend (Express dev server at http://localhost:3210)
cd backend && bun run dev
cd backend && bun run typecheck

# Frontend (Vite dev server at http://localhost:5173)
cd frontend && bun run dev
cd frontend && bun run build
cd frontend && bun run lint
```

## Tech Stack

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Runtime   | Node.js (via tsx)                                       |
| Frontend  | React 19, TypeScript, Vite 8, Tailwind CSS v4           |
| Styling   | Tailwind CSS v4, Framer Motion, class-variance-authority |
| Charts    | Recharts                                                |
| Backend   | Express 5, TypeScript, better-sqlite3, tsx              |
| AI        | OpenRouter (GPT-4o-mini)                                |
| Auth      | Token-based with bcryptjs                               |

## Environment Variables

| Variable              | Location               | Description                    |
| --------------------- | ---------------------- | ------------------------------ |
| `OPENROUTER_API_KEY`  | `backend/.env.local`   | OpenRouter API key for AI      |
| `PORT`                | `backend/.env.local`   | Backend port (default: 3210)   |

# Stride

Android-first AI nutrition and strength tracker. A restart is in progress. The approved plan is `plans/007-restart.md`. Read it before any non-trivial change. The "Amendments to plan 007" section below overrides it where they differ. Product scope for v1 is in `PRODUCT.md`.

## Agent working agreement

- The main session orchestrates. It reads code, runs read-only commands, dispatches and reviews agents, and edits docs and config. All app code goes to delegated agents. The one exception is when the owner says "execute directly" for that task.
- Never use Fable models, for any task.
- Use Opus for taste-sensitive UI work and for UI reviews.
- Open PRs freely. Merge only when the owner says so for that specific PR.
- Stage by path, only the files your work changed. Never `git add -A` or `git add .`. Leave changes you did not make alone.
- The owner checks UI himself. Run computer-use verification only when he asks.

## Where things stand

- Slice 1 (this PR): commit the chat-logging branch, archive old docs, delete kill-list code (D18), add CI, rewrite these docs.
- Next: slices 2-4 (`packages/core`, new Convex schema, extraction pipeline) in order, with slice 5 (mobile foundation) running in parallel.
- The current calorie engine, chat-transcript ledger, and web app are slated for rewrite or freeze. Do not polish them. Fix only what blocks a slice.
- Old plans, PRDs, and `AI_CONFIG.md` live on branch `archive/pre-restart`. Treat them as history, not instructions.

## Repo layout

pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

| Path | Package | What it is today |
|---|---|---|
| `apps/mobile` | `@stride/mobile` | Expo app (expo-router, NativeWind, Clerk). Will be rebuilt in slices 5-9. |
| `apps/web` | `@stride/web` | React 19 + Vite + Tailwind v4 web app. Frozen until slice 10. |
| `packages/backend` | `stride-backend` | Convex functions, schema, and tests in `convex/`. |
| `packages/shared` | `@stride/shared` | Design tokens (`tokens.ts`) and chat-turn contracts. Folds into `core` (D19). |
| `plans/` | | `007-restart.md` plus its codebase report and stack research. |

Target layout per D19: `apps/mobile`, `apps/web`, `packages/backend`, `packages/core` (pure TS math, zero runtime deps, property-tested), `packages/ui-tokens` (single `tokens.ts` for web and native).

Local-only and gitignored: `.scratch/` and `reports/` (agent scratch), `temp/` (design mocks), `docs/`, `Stride_Design_System/`.

Convex rules: read `packages/backend/convex/_generated/ai/guidelines.md` before writing Convex code. It overrides training-data habits.

## Commands

Run from the repo root. Node 20+, pnpm 10.

| Command | Does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm dev:convex` | `npx convex dev` in `packages/backend` (watches and pushes functions) |
| `pnpm dev` | Web dev server (Vite). Builds tokens first. |
| `pnpm dev:mobile` | `expo start` in `apps/mobile` |
| `pnpm --filter @stride/mobile android` | Build and install the Android dev client on a USB device or emulator |
| `pnpm typecheck` | `tsc` in every workspace |
| `pnpm test` | Vitest in every workspace that has tests (backend, web) |
| `pnpm --filter stride-backend test` | Backend tests only |
| `pnpm build` | Production web build. Fails if web env vars are missing. |
| `pnpm build:tokens` | Regenerate `apps/web/src/styles/tokens.generated.css` from `packages/shared` |

## Environment variables

Names only. Never print, log, or commit values. Never open `.env*` files unless the owner asks.

| Name | Where | Used by |
|---|---|---|
| `OPENROUTER_API_KEY` | Convex dashboard env | All LLM calls |
| `GROQ_API_KEY` | Convex dashboard env | Voice transcription |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex dashboard env | `convex/auth.config.ts` |
| `USDA_API_KEY` | Convex dashboard env | FoodData Central lookups in `convex/foods.ts` |
| `CONVEX_DEPLOYMENT`, `CONVEX_URL` | `packages/backend/.env.local` | Written by `convex dev`. Template: `packages/backend/.env.example`. |
| `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY` | `apps/web/.env.local` | Web client. Required for `pnpm build`. |
| `VITE_SENTRY_DSN`, `VITE_APP_VERSION`, `VITE_COMMIT_SHA` | `apps/web/.env.local` | Optional Sentry setup |
| `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `apps/mobile/.env.local` | Mobile client |

## Conventions

- TypeScript everywhere. No `any`, no casts around a type you should define.
- AI parses, never estimates. The model outputs `{food, quantity, unit}`. Grams come from portion tables and nutrients from the `foods` table. No AI-produced macro number is ever persisted (D3, D10).
- Nutrition, energy, strength, and date math lives in `packages/core` once it exists. One implementation of each formula. Round once, at the total.
- The ledger (`entries` with revision rows) is the truth. Chat is a view of it. Every mutation writes a new revision. Undo reverts a revision (D5, D8).
- All local dates go through one IANA time-zone resolver (D15).
- No unbounded Convex queries.
- Styling comes from one `tokens.ts`. Web uses Tailwind v4 `@theme`. Native uses StyleSheet from the same object (D20).
- Validation and error handling go where data enters or leaves: Convex actions, API calls, user input.
- Give each function a one-line comment saying what it is for. No commented-out code.

## Testing and CI

- `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm test` on every PR and on pushes to `main`. Keep it green.
- `packages/core`: property tests and golden values from FDC rows, including IST midnight and DST cases (D22).
- `packages/backend`: pipeline tests with `convex-test` and Vitest. Slice 4's named test cases are in the local handoff `.scratch/v5-build/HANDOFF.md`.
- UI: manual check by the owner. E2E tests are deferred.
- Run the smallest check that could prove a change wrong. Run the full suite when you touch shared code.

## Amendments to plan 007

Decisions from the 2026-10-06 session. They override plan 007 where they differ.

| # | Amendment |
|---|---|
| V1 | v5 is the locked design for slices 5, 6 and 9 (tokens, Bricolage Grotesque + Geist, dock, cards, motion). Slice 5 skips its design-directions run. Mock: `temp/mocks/stride-mocks-v5.html` (local only). |
| V2 | Do not patch the current calorie engine. Slices 2-4 rewrite it. Each known engine bug becomes a slice 4 test case. |
| V3 | Slice 1 first. Then slice 5 runs in parallel with slices 2-4. |
| V4 | Kill list stays for v1. Retention features go to v1.5. The morning weigh-in stays because adaptive TDEE needs it. |
| V5 | Mascot temp name "Macro Polo", shown as "Polo". The chat is titled "Coach". Mocks say "Chana"; the app uses Polo. Name not final. |
| V6 | Done in slice 1: commit scope, `.scratch/` and `reports/` gitignored, `scripts/` and `t3.json` left untracked. |
| V7 | Slice 5 scope: v5 tokens into `packages/ui-tokens`, fonts via expo-font, dock tab shell, Today screen on fixture data. Slice 6 swaps in real data. |
| V8 | "Burn estimate ready" milestone ships in v1 with slice 7. "What fits what's left" moves to v1.5. |
| V9 | Light and dark both ship in v1, following the system setting. |
| V10 | Done in slice 1: these amendments are folded into this file instead of editing plan 007. |

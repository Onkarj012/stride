# Stride

Stride is an AI nutrition and strength tracker for Android, being rebuilt for v1. You type, say, photograph, or scan what you ate. The AI turns that into food names and portions. Calories and macros come from verified food databases (USDA FoodData Central, IFCT 2017, Open Food Facts), never from the model's guess. It also logs workouts, tracks a weight trend, and estimates your real energy expenditure from your own data.

## Status

Restart in progress. v1 is being rebuilt in slices per [`plans/007-restart.md`](plans/007-restart.md).

- Slice 1 (current) cleans up the repo: old features removed, old docs archived, CI added.
- The Android app is the main target. The current mobile app will be replaced.
- The web app is frozen. It comes back later as a desktop view for logs and progress.
- Expect breaking changes and data resets until v1 ships. It is built for the author first, then a few family members.

## Stack

| Layer | Tech |
|---|---|
| Mobile | Expo, React Native, expo-router |
| Web | React 19, Vite, Tailwind CSS v4 |
| Backend | [Convex](https://convex.dev) |
| Auth | [Clerk](https://clerk.com) |
| AI | OpenRouter for parsing and chat, Groq Whisper for voice |

## Quick start

Needs Node 20+, pnpm 10, a Convex account, and a Clerk app. The mobile app also needs the Android SDK and either a USB device or an emulator.

```bash
pnpm install

# Terminal 1: Convex backend (first run links or creates a deployment)
pnpm dev:convex

# Terminal 2: web app
pnpm dev

# Mobile: build the dev client once, then start Metro
pnpm --filter @stride/mobile android
pnpm dev:mobile
```

Checks:

```bash
pnpm typecheck
pnpm test
```

## Environment variables

Set backend variables in the Convex dashboard. Set client variables in each app's `.env.local`.

| Name | Where |
|---|---|
| `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `USDA_API_KEY` | Convex dashboard |
| `CONVEX_DEPLOYMENT`, `CONVEX_URL` | `packages/backend/.env.local` (written by `convex dev`, see `.env.example`) |
| `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY` | `apps/web/.env.local` |
| `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `apps/mobile/.env.local` |

## Repo layout

```
apps/mobile        Expo app (Android first)
apps/web           Web app (frozen)
packages/backend   Convex schema, functions, tests
packages/shared    Design tokens and shared types
plans/             The restart plan and its research
```

## Contributing

Read [`AGENTS.md`](AGENTS.md) for commands, conventions, and how work is split into slices. CI runs typecheck and tests on every pull request.

## Data note

The IFCT 2017 food table is licensed for personal use only. Do not commit or redistribute the dataset.

## License

[MIT](LICENSE)

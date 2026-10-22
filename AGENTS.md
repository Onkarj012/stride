# Stride

Stride is an Android-first app for logging food, workouts, and weight, built around Indian meals. You type, say, or photograph what you ate, and Stride turns it into entries backed by real food data. A small friends-and-family alpha runs on the production backend. All development happens against the dev deployment.

Product scope lives in `PRODUCT.md`. Past choices and their reasons live in `decisions.md` (see Decisions).

## What we never compromise on

### 1. Numbers you can trust

The food database decides grams and nutrients. The AI reads the input and picks the food, the amount, and the household unit. Portion tables turn that into grams, and the `foods` table gives nutrients per 100 g. When the database cannot place a food, the AI may estimate it. That entry carries the "estimated" label everywhere it appears, for as long as it stays an estimate. Photo entries keep the label. Swapping in a database food clears it. An unknown food never counts as 0 kcal.

### 2. Every change can be undone

The food ledger (`entries` and their revision rows) is the truth. The day view, the totals, and the Coach chat are views of it. Every food change writes a new revision, and undo reverts one. Anything else a log writes, such as food memory, gets undone with it.

### 3. Logging is quick enough to do every meal

A confident typed meal logs in one send. Every extra tap, confirm card, or spinner on that path needs a reason.

### 4. A minimal, fun daily driver

Utility first: what you ate and what is left today, readable at a glance. The fun comes from a flat mascot (Polo, name not final) and springy motion, not from extra screens. Light and dark both ship and follow the system setting.

If a rule in this file fights the task in front of you, say so and ask the owner before breaking it.

## Words we use

- **entry**: one logged food in the ledger. **revision**: one saved version of an entry. Workout sets live in `sets`, and weigh-ins in `weights` (one per day, overwritten).
- **draft** (draft card): a whole log the pipeline was not sure about, waiting for the user to confirm or fix.
- **portion**: a household measure (katori, roti, teacup, glass) with its grams for a food.
- **food memory**: a user's confirmed choice for a phrase, reused on the next log.
- **estimate**: a food or amount the AI guessed because the database could not place it.
- **Coach**: the AI chat. It reads the log and changes it through tool calls.
- **own key**: a user's OpenRouter key. Calls on it skip Stride's cost caps.
- **dev** and **prod**: the two Convex deployments. Prod holds the alpha testers' real data.

## Ways to hurt yourself

1. **Writing to prod.** `npx convex deploy`, any `--prod` flag, and prod env vars are the owner's call. A release worktree's `.env.local` may point at prod, so run Convex commands only in a checkout set up for dev.
2. **Shipping to phones.** `eas update` reaches the testers' phones within minutes, and release builds are signed with the release key. Run either only when the owner asks.
3. **Leaking secrets.** Refer to env vars by name. Open `.env*` files only when the owner asks, and never print, log, or commit their values.
4. **Killing by pattern.** Metro, `convex dev`, and Gradle often run in several worktrees at once. Kill only a PID you started.
5. **Shipping food data we may not share.** Every imported dataset keeps its licence and its credit in settings. IFCT 2017 is personal-use only and stays out of any seed that ships.

## Hit every surface

The most common bug here is a fix that works on the path you tested and is missing on the others. Before calling a change done, say which of these applied:

- **Inputs**: text, voice, photo, barcode, and the Coach.
- **Writers**: the compose sheet, the draft card, Coach tool calls, and food memory. A label or field one writer sets must follow the same rules whichever writer edits the entry next. The "estimated" label is the usual one to check.
- **Undo**: every new write has a way back.
- **Clients**: mobile first. Web is a desktop day log and Progress view on the same backend, with no account or chat screens.
- **Time**: the user's IANA time zone, IST midnight, and meal slots.
- **Themes**: light and dark.
- **AI failures**: out of credits, a provider error, and a user's own key.

## Working in worktrees

- The main checkout stays on `main` and stays clean. It is for reading, running dev servers against dev, and the owner's local notes.
- Every change gets its own branch in its own worktree, cut from `origin/main`. Name branches after the change (`fix/draft-amounts`).
- A new worktree has no `node_modules` and no `.env.local`. Run `pnpm install`. Ask the owner before copying env files in.
- Gitignored local material (`decisions.md`, `.scratch/`, `reports/`, `temp/`, `docs/`, and plan drafts) exists only in the main checkout. `git worktree list` shows its path.

## Verifying

- Run the smallest check that could prove the change wrong: `pnpm --filter <package> test` or `pnpm --filter <package> typecheck`. Run the root `pnpm typecheck` and `pnpm test` when you touch `packages/core`, the schema, or validators shared across modules.
- CI runs install, typecheck, test, and an Android bundle export. After changing mobile imports, run `pnpm --filter @stride/mobile exec expo export --platform android`.
- Logic bugs in math, matching, portions, or the ledger get a failing test first, in the module's existing test file, then the fix. Purely visual fixes need no test.
- The owner checks UI on a phone. Drive a device, emulator, or browser only when asked.

## Pull requests

- Conventional commit titles in plain words: `fix(portions): soymilk chai is not a teacup of chai`.
- Body: the problem, the fix, how to test. UI changes include before and after screenshots.
- One change per PR. Stage by path, only the files your work changed.
- Squash-merge once the PR is ready: every check green, the review bots approve the head commit, and every review thread is resolved. The main session merges. Agents working a branch hand it back instead.

## Decisions

`decisions.md` records choices that changed what gets built or how, with what was rejected and why, newest first. It is local only and lives in the main checkout. Read it before reversing a behavior or choosing between approaches. An active entry wins over your own preference.

When you make or hear such a choice, list it under "Decisions" in your final report so it gets recorded. Leave `decisions.md` itself alone. If a decision changes a rule in this file, the rule here gets rewritten in the same change.

## Plans and notes

Plans and research notes describe intent at one moment and go stale. Treat them as background unless the owner points you at one. Keep them out of commits. A merged PR is the record of what was built.

## How it works

Both clients talk to Convex. A log runs through `convex/pipeline/log.ts`. Voice is transcribed first (Groq). `extract.ts` asks the model (OpenRouter) for items. `resolve.ts` matches each one against the user's foods, food memory, and the `foods` table, then resolves its portion to grams. Items the matcher cannot place go to a short tool loop (`tools.ts`), and to an estimate as a last resort. The gate in `packages/core` checks every item. If all pass, the whole log saves at once with an undo toast. Otherwise the whole log comes back as a draft card (`drafts.ts`). `entries.ts` writes entries and revisions, and `day_totals.ts` sums them with math from `packages/core`. The Coach (`chats.ts`) changes the log through the same entry functions. `ai_guard.ts` caps AI spend per user and overall. Weigh-ins feed the adaptive TDEE in `tdee_recompute.ts`.

## Where code lives

- `apps/mobile`: Expo app (expo-router, Clerk). The main client.
- `apps/web`: React and Vite desktop view.
- `packages/backend/convex`: functions, schema, and the logging pipeline. Read `_generated/ai/guidelines.md` before writing Convex code. It overrides habits from training data.
- `packages/core`: pure TypeScript math for nutrition, energy, strength, and dates, with zero runtime dependencies. Food data import scripts live in its `scripts/`.
- `packages/ui-tokens`: one `tokens.ts` for both clients.

## Taste

- Each formula has one implementation, in `packages/core`. Round once, at the total.
- Every local date goes through the one time-zone resolver.
- Every Convex query reads through an index with a limit or pagination.
- Styles come from `tokens.ts`: Tailwind v4 `@theme` on web, StyleSheet on mobile.
- Validate where data comes in or goes out: Convex argument validators, model output, user input. Inside, trust the types.
- TypeScript with real types. Define the type instead of reaching for `any` or a cast.
- Each function gets a one-line comment saying what it is for. Other comments explain why.

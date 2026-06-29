# Monorepo Migration Plan

Status: Planned · Owner: TBD · Source decisions: grilling session 2026-06-29

## Goal

Restructure the repo into a pnpm workspace monorepo so web and a future Expo
mobile app can share one Convex deployment, one set of design tokens, and shared
TypeScript types — without duplicating backend or business logic.

## Why monorepo (vs sibling repos)

- Single Convex deployment serves both web and mobile (`convex/react` hooks work
  in React Native).
- Design tokens authored once, consumed by both apps (see
  `DESIGN_SYSTEM_ADOPTION.md`).
- Shared domain types + pure helpers in one package; no copy-paste drift.
- One CI, one dependency graph, atomic cross-cutting changes.

Cost: one-time restructure touching Convex config, Clerk env, import paths, CI.
Mitigated by staging (below) so the app stays shippable after every step.

## Target layout

```
stride/
├── apps/
│   ├── web/            # was frontend/  (React 19 + Vite, Tailwind v4)
│   └── mobile/         # new Expo app (added later, see MOBILE_APP_PLAN.md)
├── packages/
│   ├── backend/        # was backend/  (Convex deployment, single source)
│   └── shared/         # tokens (TS), domain types, pure helpers
├── pnpm-workspace.yaml
├── package.json        # root: workspace scripts, dev tooling
└── turbo.json          # optional: task pipeline (build/test/lint)
```

Rules:
- `packages/shared` = framework-agnostic only. No React components (web and RN
  render layers differ). Tokens, types, pure TS helpers.
- `packages/backend` = the only Convex deployment. Generated client imported by
  both apps.
- One Clerk instance/keys shared across apps.

## Branch & PR plan

Keep `main`'s current landing page. Do **not** merge
`feat/landing-page-improvements` for now — landing on main is preferred. All
foundation work branches off `main`, independent of that landing branch.

Note: the 3 plan docs currently live on `feat/landing-page-improvements`
(uncommitted). Since that branch is not merging, commit/move them to a foundation
branch off `main` so they reach the trunk.

| Phase | Branch | Lands |
|---|---|---|
| 1 | `feat/monorepo-foundation` | pnpm workspace + move web/backend |
| 2 | `feat/shared-tokens-package` | `packages/shared` tokens + types |
| 3 | `feat/mobile-scaffold` | Expo app skeleton (parallel-safe) |

Each phase = its own PR, independently reviewable, app green after merge.

## Phase 1 — workspace + move (branch: `feat/monorepo-foundation`)

1. Add `pnpm-workspace.yaml` (`apps/*`, `packages/*`).
2. Move `frontend/` → `apps/web/`. Move `backend/` → `packages/backend/`.
3. Fix import paths, `tsconfig` references, Vite root, Convex paths.
4. Update Convex deploy config (project unchanged; only path moves). Verify
   `convex dev` + deploy still target the same deployment.
5. Update Clerk env wiring (`.env` locations); keys unchanged.
6. Update CI: install via pnpm, run web typecheck/test from `apps/web`.
7. **Acceptance:** web builds, web tests pass, Convex deploy green, Clerk login
   works. No feature change.

Risks: stale `node_modules`, hardcoded relative paths, Convex `_generated`
paths, the obsolete `backend/server.py` + `stride.db*` (Convex migration done —
confirm these are dead before move; do not migrate cruft).

## Phase 2 — shared package (branch: `feat/shared-tokens-package`)

1. Create `packages/shared` with `tokens.ts` (single source of truth) + build
   step that emits web CSS vars and an RN/NativeWind JS map. Detail in
   `DESIGN_SYSTEM_ADOPTION.md`.
2. Move shared domain types + pure helpers out of `apps/web` into `shared`.
3. Repoint `apps/web` imports to `@stride/shared`.
4. **Acceptance:** web consumes tokens/types from `shared`; build + tests green;
   no visual change (token values identical to today).

## Phase 3 — mobile scaffold (branch: `feat/mobile-scaffold`)

Parallel-safe once Phase 2 merged. See `MOBILE_APP_PLAN.md`.

## After foundation

Web polish and mobile build proceed in parallel; both depend on `shared`.

## Open items

- Decide: Turborepo task pipeline now or defer (recommend defer until 2+ apps).
- Confirm `backend/server.py`, `stride.db*` are dead (Convex migration done) and
  remove rather than relocate.

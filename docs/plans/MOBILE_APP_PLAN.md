# Mobile App Plan

Status: Planned · Owner: TBD · Source decisions: grilling session 2026-06-29

## Goal

Ship a native mobile app (iOS + Android) that reuses Stride's existing Convex
backend, Clerk auth, design tokens, and TypeScript types — starting with a
chat-first MVP, then expanding to full tabs.

## Tech stack — Expo (React Native)

Chosen because the stack is already React 19 + Convex + Clerk:

- **Expo** (+ Expo Router) — managed RN, native camera/mic/push, EAS build.
- **Convex** — same deployment; `convex/react` hooks work in RN. No backend
  rewrite (Convex migration already done).
- **Clerk** — `@clerk/clerk-expo` + `expo-secure-store` token cache + OAuth
  deep-link scheme. Same Clerk instance/keys as web.
- **NativeWind** — port the ui-kit Tailwind classes ~1:1. Constraint below.
- **Moti** (+ Reanimated) — replaces framer-motion (not available in RN).
  Springs / presence map over from the mock cleanly.
- **lucide-react-native** — same icon set as web.
- **expo-font** — Manrope.

Rejected: Capacitor (web-in-shell, weak native feel for chat/camera/voice),
Flutter (full rewrite, zero reuse).

### Known constraints (port the mock, don't assume)

`docs/ui-kit/src/mobile/MobileApp.tsx` is **React DOM + Tailwind v4 +
framer-motion** — none run on React Native as-is. It is a visual blueprint, not
portable code. Re-implement in RN primitives.

- **Tailwind v4 vs NativeWind:** NativeWind GA targets Tailwind **3.4**; web +
  ui-kit are Tailwind **v4**. Pin Tailwind **3.4 for mobile only**; web stays v4.
  Classes mostly transfer; token **values** identical (both read
  `packages/shared/tokens`). Not byte-identical configs — acceptable divergence.
  Validate NativeWind's current Tailwind-v4 support at build time; if stable by
  then, drop the pin.
- **Animation:** every `motion.div` / `AnimatePresence` in the mock → Moti
  equivalent.
- **SVG status bar / icons:** use `react-native-svg` + lucide-react-native.

## Architecture

```
apps/mobile/            # Expo app
  app/                  # Expo Router routes (chat MVP → tabs)
  components/           # RN components (re-impl of ui-kit mobile views)
  theme/                # NativeWind config from @stride/shared tokens
packages/shared/        # tokens (JS map), domain types, pure helpers
packages/backend/       # single Convex deployment (shared with web)
```

Reuse boundary: tokens + types + pure helpers + Convex functions/hooks shared.
Render layer (components) is mobile-specific.

## Phases

### Phase M0 — scaffold (branch: `feat/mobile-scaffold`)
- Expo + Expo Router app under `apps/mobile` (monorepo Phase 3).
- Wire pnpm workspace deps (`@stride/shared`, Convex client).
- NativeWind configured from shared tokens; Manrope via expo-font; pin Tailwind
  3.4 for mobile.
- App boots, renders a token-styled placeholder, reads one Convex query.
- **Acceptance:** runs on iOS sim + Android emulator, tokens applied, Convex
  connected.

### Phase M1 — auth (branch: `feat/mobile-auth`)
- `@clerk/clerk-expo` + secure-store cache.
- OAuth deep-link scheme for callback.
- Sign-in / sign-up / signed-in gate.
- **Acceptance:** login works on device, session persists, Convex calls
  authenticated.

### Phase M2 — chat MVP (branch: `feat/mobile-chat`)
- Re-implement the chat view from `MobileApp.tsx` in RN: ChatBubble, log cards
  (MealLogCard, MacroCard), Composer/InputBar.
- Wire to existing Convex `chat.ts` / `meals.ts`. Text-only loop:
  user message → AI → log card.
- Keyboard handling, scroll, send.
- **Acceptance:** full text chat-log loop works against real backend; matches DS
  visual.

### Phase M3 — native log inputs (branch: `feat/mobile-photo-voice`)
- Camera photo-log (expo-camera), voice-log (expo-av / speech).
- **Prerequisite:** confirm backend photo/voice ingest path exists in
  `packages/backend/convex/ai/` before committing scope. If not ready, file
  backend work first.
- **Acceptance:** photo and voice produce logged entries.

### Phase M4 — tabs (branch: `feat/mobile-tabs`)
- Add today / nutrition / workouts / insights tabs per `MobileApp.tsx`.
- Floating ink nav bar.
- Reuse W2–W4 surface logic from web where shared (data/types).

### Phase M5 — ship (branch: `feat/mobile-release`)
- App icons / splash from `Stride_Design_System/assets` (stride-appicon.svg).
- EAS Build + EAS Submit → App Store / Play.
- Push notifications for nudges (`convex/nudges.ts`).

## Testing / QA

- Unit: `jest-expo`.
- E2E: **Maestro** for the chat-log flow. Defer e2e until post-MVP (after M2).

## Sequencing

Depends on monorepo Phases 1–2 (workspace + shared tokens). M0 starts after
Phase 2 merges. M1+ runs in parallel with web design adoption.

## Open items

- Confirm backend photo/voice ingest readiness (gates M3).
- Decide push-notification provider config (Expo push vs APNs/FCM direct).
- Verify NativeWind ↔ Tailwind v4 support status at M0 start; drop the 3.4 pin if
  stable.

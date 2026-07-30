---
label: wayfinder:map
title: Entry Experience Revamp — Onboarding + Auth
tracker: local-markdown
created: 2026-07-23
---

# Entry Experience Revamp — Onboarding + Auth

> **How this tracker works.** Tickets are files under `tickets/`. Each has frontmatter:
> `id`, `title`, `type` (research | prototype | grilling | task), `status` (open | closed),
> `assignee` (the claim — empty means unclaimed), `blocked_by` (list of ticket ids).
> The **frontier** = open tickets whose every `blocked_by` id is closed and with no assignee.
> Open tickets are found by scanning `tickets/` — they are **not** listed here.
> Resolutions are appended to each ticket under `## Resolution`, then `status: closed`,
> then gisted into **Decisions so far** below.

## Destination

A **locked, hand-off-ready spec + design** for Stride's entire entry experience —
**landing → auth → onboarding → plan reveal as one cohesive branded arc**. It settles:
a chosen visual direction, a hybrid onboarding model (conversational framing + focused
per-question steps), reworked question/information-architecture, accessibility, and motion —
as **one shared design language** that splits into per-platform (web + React Native)
build tickets. **No production code is merged in this effort.** Done when a builder has
every decision they need to implement, on both platforms.

## Notes

- **Domain:** Stride — adaptive AI wellness app. Web at `apps/web` (React + Vite + Tailwind
  tokens + motion/react + Clerk + Convex). Mobile at `apps/mobile` (React Native). Auth = Clerk.
- **Current code:** onboarding = `apps/web/src/pages/OnboardingPage.tsx` (chat thread, phases
  name→stats→goal→work→lifestyle→training→diet→style→plan, ends in computed nutrition-plan
  reveal). Auth = `apps/web/src/pages/AuthPages.tsx` (split-screen Clerk sign-in/up/verify/forgot).
  Routing in `apps/web/src/App.tsx`.
- **Decisions locked at chartering (2026-07-23):** hybrid flow (not pure chat, not pure wizard);
  full reflow of auth as part of the arc; question/IA open to redesign; visual direction is an
  open decision (generate concepts to react to); web+mobile shared design, platform-split build;
  motion tooling deferred to a prototype.
- **Skills to consult:** `design-directions`, `prototype`, `grilling`, `domain-modeling`,
  `frontend-design`, `design-taste-frontend`, `mobile-app-ui-design`, `clerk-custom-ui`,
  `ui-ux-pro-max`, `research`.
- **Repo rule (permanent):** main session orchestrates only — code/design artifacts are produced
  by subagents. **Reviews go to gpt-5.6-sol via codex, never Opus.**
- **Deliverable is a SPEC**, not merged code. Prototypes built while charting are throwaway props
  to make decisions concrete — they are linked from tickets, not shipped.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Research: hybrid + accessible onboarding patterns](tickets/R1-onboarding-ux-patterns.md) —
  "conversation is the skin, state machine is the engine": persona line + focused single-question
  step (not a chat log); slide+fade step-card motion ≤250ms; focus-to-`<h2>` + one polite live
  region (never both); real progress semantics + validate-before-advance. Findings in
  `research/R1-findings.md`.
- [Research: Clerk custom auth-flow capabilities](tickets/R2-clerk-custom-auth.md) — full custom UI
  (incl. MFA) available; only hard-fixed points are the global session boundary (`<Show>` unmounts
  across auth line → persist state, can't keep one component mounted) and the OAuth redirect (own
  `/sso-callback` route + branded loader). Keep `#clerk-captcha`; swap `window.location.href`
  finalize for client-side nav. Findings in `research/R2-findings.md`.

## Not yet specified

<!-- in-scope fog; graduates as the frontier advances -->

- **Mobile (React Native) adaptation + platform-split build tickets** — how the chosen design
  language and web interaction model translate to `apps/mobile`. Graduates once the visual
  direction (T1), hybrid interaction (T4), and auth design (T5) lock. One patch that will likely
  become several tickets (onboarding-mobile, auth-mobile, motion-mobile).
- **Stry persona voice & microcopy** — tone, copy, and the mascot/PixelAgent's role across the
  hybrid flow. Graduates after IA (T2) and interaction (T4) settle.
- **Analytics/PostHog event map for the new flow** — which funnel events fire where. Graduates
  after the flow structure (T3) and interaction (T4) settle.

## Out of scope

<!-- ruled beyond the destination; never graduates within this effort -->

- **Backend/Convex implementation of IA changes** — if the reworked question set implies new
  fields or plan-calc changes, the spec may *recommend* them, but building them is a separate
  downstream effort. This map produces decisions, not backend code.
- **Landing-page marketing content strategy** — copy/SEO/positioning of the public landing page
  beyond its role as the first beat of the entry arc.

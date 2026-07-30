---
id: T3
title: Entry-arc flow & routing structure
type: grilling
status: open
assignee:
blocked_by: []
---

## Question

What is the **structure** of the full-reflow entry arc — landing → auth → onboarding → app — as
routes, gates, and states? This decides the skeleton the visual/interaction tickets dress.

Decide:
- The route/screen map: does auth stay a discrete gated route (`/sign-in`, `/sign-up`) or fold
  into the arc as step 0? (respect R2's Clerk constraints)
- Gating: who lands where — new user, returning-unauth, authed-not-onboarded, authed-onboarded,
  OAuth SSO callback. Current: sign-up → `/onboarding`; sign-in → `/`.
- Persistence/resume: current onboarding drafts to localStorage (`onboardingPersistence`). Keep,
  extend, or change? What happens on refresh/abandon/return.
- Transitions between beats (landing→auth→onboarding) — cross-route continuity vs hard nav.
- Edge cases: already-authed hitting landing, expired session mid-onboarding, back-button.

Use `grilling` + `domain-modeling`. Resolution = the decided flow/route/state map.

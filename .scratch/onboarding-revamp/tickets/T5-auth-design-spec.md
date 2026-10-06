---
id: T5
title: Auth screens design spec
type: prototype
status: open
assignee:
blocked_by: [T1, T3, R2]
---

## Question

What are the redesigned **auth screens** (sign-in, sign-up, email verify, forgot-password) within
the arc? Apply the visual direction (T1) and flow structure (T3), within Clerk's limits (R2).

Decide and prototype:
- Screen-by-screen layout replacing the current split-screen shell — hero role, form treatment,
  how it reads as one family with onboarding.
- All states: sign-in, sign-up→verify, forgot-password (email→code→new-pwd), OAuth/Google,
  MFA/second-factor (per R2 — custom or handoff), CAPTCHA slot, inline errors.
- The landing→auth and auth→onboarding transition moments.
- Micro-interactions and motion (defer final tooling to T7, but define intent).

Use `prototype` + `frontend-design` + `clerk-custom-ui`. Build a throwaway prototype of sign-in +
one sub-flow. Resolution = the decided auth design spec + linked prototype.

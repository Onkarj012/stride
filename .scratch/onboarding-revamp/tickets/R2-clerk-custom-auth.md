---
id: R2
title: "Research: Clerk custom auth-flow capabilities"
type: research
status: closed
assignee: wayfinder-research
blocked_by: []
---

## Resolution (2026-07-23)

Findings: `../research/R2-findings.md`.

- **Full custom UI available** for sign-in, sign-up, email verify, forgot-password, **and MFA**.
  Current hosted-page MFA punt (`AuthPages.tsx:138-141`) is self-imposed, not a Clerk limit —
  `signIn.mfa.verifyTOTP/verifyPhoneCode/verifyEmailCode/verifyBackupCode` allow a branded 2FA
  step inside the arc.
- **Hard boundary:** top-level `<Show when="signed-out/signed-in">` (`App.tsx:230-263`) splits the
  route tree by auth state; `finalize()` unmounts landing+auth and mounts onboarding. **Cannot keep
  one component mounted across the pre-auth→post-auth line** — in-memory state must persist
  (localStorage draft, or Clerk `unsafeMetadata` via `signUp.update()`). Arc can still *look*
  continuous via shared shell + non-reload nav.
- **OAuth is the one unavoidable "leaves the app" step** — full-page redirect to Google →
  `/sso-callback` (own route rendering `AuthenticateWithRedirectCallback`); can't animate inline →
  plan a branded callback loader.
- **CAPTCHA:** `#clerk-captcha` (`AuthPages.tsx:432`) must exist at `signUp.password()` time; on by
  default, styleable via `data-cl-*`, missing div silently degrades → keep it, give sign-up step
  flexible height.
- **Quick win:** all three `finalize()` calls use `window.location.href = decorateUrl(...)` (hard
  reload/flash) → branch on `url.startsWith('http')`, use client-side nav otherwise for seamless
  entry into onboarding.

Net: nothing forces a screen sequence for email/password paths — only the global session boundary
and the OAuth redirect are structurally fixed.

## Question

For a **full reflow** of auth (landing→auth→onboarding as one designed arc), what are Clerk's
boundaries and building blocks? The design cannot promise interactions Clerk can't support.

Cover:
- What Clerk's custom-flow (headless) API allows for fully bespoke sign-in / sign-up / email
  verification / forgot-password / OAuth screens (the repo already uses `@clerk/react` headless).
- Constraints: MFA / second-factor handling (current code punts MFA to Clerk hosted page — can a
  custom flow handle it?), CAPTCHA (`#clerk-captcha`), SSO callback routing, session finalize.
- Whether auth can be visually embedded *inside* an onboarding arc (step 0) vs must be a
  discrete gated route — routing/session implications.
- Anything that forces a particular screen structure or blocks a seamless branded transition.

Consult local skills `clerk-custom-ui`, `clerk-react-patterns`, `clerk-react-router-patterns`
plus current usage in `apps/web/src/pages/AuthPages.tsx`. Deliver a capabilities/constraints doc.

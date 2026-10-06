# R2 — Clerk headless auth: capabilities & constraints for the onboarding revamp

**Ticket:** R2 (auth revamp) · **Date:** 2026-07-23
**Stack:** `@clerk/react` ^6.7.1 (headless / "Future" fluent API — `signIn.password()`, `signIn.sso()`, `signIn.finalize()`, `signUp.verifications.*`)
**Current code:** `apps/web/src/pages/AuthPages.tsx` (custom sign-in/up/reset), `apps/web/src/App.tsx` (routing + `<Show>` gate)
**Sources of truth:** local skills `clerk-custom-ui/core-3/{custom-sign-in,custom-sign-up}.md`, `clerk-react-patterns`, `clerk-react-router-patterns`; Clerk docs (links inline).

---

## TL;DR

- Sign-in, sign-up, email verification, and forgot-password are **already fully custom** and can stay 100% in-app. Nothing forces Clerk's hosted UI for these.
- **MFA / second factor can ALSO be fully custom** — the current punt to Clerk's hosted page (`AuthPages.tsx:138–141`) is **not a Clerk limitation** and can be replaced with custom UI (`signIn.mfa.verify*` methods exist).
- The one hard "leaves the app" step is **OAuth (Google SSO)** — it is a full-page redirect round-trip to Google and back to `/sso-callback`, by design. Email/password + email-code flows never leave the page.
- Auth can be made to **look** like a continuous branded arc, but there is a **hard session boundary**: the instant `finalize()` activates the session, the app's top-level `<Show when="signed-out">` tree unmounts and the `signed-in` tree mounts. In-memory React state does **not** survive that boundary — anything captured pre-auth must be persisted (localStorage / URL / backend), exactly like the existing `onboardingPersistence.ts` draft pattern.

---

## 1. What the headless API gives you for bespoke screens

All of the following are first-class in the current SDK and need **no** hosted Clerk page. (Refs: `clerk-custom-ui/core-3/custom-sign-in.md`, `custom-sign-up.md`.)

| Screen | Methods | In current code? |
|---|---|---|
| Sign-in (password) | `signIn.password({ identifier / emailAddress, password })` | ✅ |
| Sign-in (email/phone OTP, passkey, web3, ticket) | `signIn.emailCode.*`, `signIn.phoneCode.*`, `signIn.passkey()`, `signIn.web3()`, `signIn.ticket()` | password only |
| Sign-up | `signUp.password({ emailAddress, password, firstName })` | ✅ |
| Add fields to an in-progress sign-up | `signUp.update({ firstName, unsafeMetadata, legalAccepted, … })` | ❌ (available — useful for onboarding capture) |
| Email/phone verification | `signUp.verifications.sendEmailCode()` / `verifyEmailCode({ code })` (also link + phone) | ✅ (email code) |
| Forgot password | `signIn.resetPasswordEmailCode.sendCode()` → `verifyCode()` → `submitPassword()` | ✅ |
| OAuth / enterprise SSO | `signIn.sso()` / `signUp.sso()` | ✅ (Google) |
| Finalize session | `signIn.finalize({ navigate })` / `signUp.finalize({ navigate })` | ✅ |
| Errors | Structured reactive `errors.fields.{identifier,password,code,…}` + `errors.global` + `errors.raw`; also `{ error }` return per call | uses `{ error }` + custom `mapClerkError` |

Notably `signUp.update()` + `unsafeMetadata` means **onboarding answers captured during/right-after sign-up can be attached to the Clerk user** without a separate round-trip — an option worth considering vs. the current Convex-only `ensureUser`/`profile` path.

---

## 2. Constraints

### 2a. MFA / second factor — **the hosted-page punt is removable**
The current code sends an MFA email code then bails to Clerk's hosted page with a "please use the hosted sign-in page for now" message (`AuthPages.tsx:138–141`). This is a self-imposed shortcut, **not** a Clerk boundary.

A second factor is signalled by `signIn.status`:
- `'needs_second_factor'` — user has MFA (TOTP / SMS / backup codes) enabled.
- `'needs_client_trust'` — new-device sign-in without MFA; requires an email or phone code (`signIn.supportedSecondFactors` lists available methods).

All verifications have custom methods — no redirect needed:
- `signIn.mfa.verifyTOTP({ code })` (authenticator app)
- `signIn.mfa.verifyPhoneCode({ code })` / `sendPhoneCode()` (SMS)
- `signIn.mfa.verifyEmailCode({ code })` / `sendEmailCode()` (email — used for the `needs_client_trust` new-device case)
- `signIn.mfa.verifyBackupCode({ code })`

After success, `signIn.status` → `'complete'`, then `finalize()`. So the revamp **can** fold a branded 2FA step into the arc.
Docs: https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication · https://clerk.com/docs/references/react/use-sign-in
> Note: docs describe email codes primarily for the `needs_client_trust` new-device path and TOTP/SMS/backup for full MFA. Confirm exactly which second factors are enabled in the Clerk Dashboard before building the UI, so you only render supported branches.

### 2b. CAPTCHA / bot protection (`#clerk-captcha`)
- Bot protection is **on by default** for new apps (Smart CAPTCHA / Cloudflare Turnstile); enabled via the "Bot sign-up protection" toggle. Applies to **sign-up only**.
- A `<div id="clerk-captcha" />` must exist in the DOM **by the time `signUp.password()` / `signUp.create()` is called** — it's the render target. Present today at `AuthPages.tsx:432`.
- **If the div is absent**, the SDK silently falls back to an **invisible** widget so sign-up doesn't break — but that invisible fallback auto-blocks suspected bots with **no** challenge to prove otherwise (worse UX for false positives). So keep the div.
- Style/position freely via data attributes on the div: `data-cl-theme` (`light|dark|auto`), `data-cl-size` (`normal|flexible|compact`), `data-cl-language`. The widget renders wherever you place the div — it does **not** force any particular form layout.
- **Implication for the arc:** the sign-up form must own a stable mounted div at call time. Smart CAPTCHA may render a visible interactive challenge for suspicious traffic, so the sign-up step must leave room for it (don't build a fixed-height step that can't accommodate the widget).
- Docs: https://clerk.com/docs/react/guides/development/custom-flows/authentication/bot-sign-up-protection · https://clerk.com/docs/guides/secure/bot-protection

### 2c. OAuth / SSO callback routing — **inherent full-page redirect**
- `signIn.sso()` / `signUp.sso()` navigate the browser **out** to the provider (Google) and back to `redirectCallbackUrl` (`/sso-callback`). This is a real cross-origin round-trip — it **cannot** be embedded inline in a single-page arc.
- `/sso-callback` renders `<AuthenticateWithRedirectCallback />` (`App.tsx:235`), which calls `handleRedirectCallback()` under the hood and **must** live on its own route = the `redirectCallbackUrl`.
- That component accepts routing props worth using for the branded arc: `signInFallbackRedirectUrl` / `signUpForceRedirectUrl` (final destination), `continueSignUpUrl` (when OAuth sign-up needs more info), and `transferable` (default `true` — lets an OAuth sign-in attempt transfer into a sign-up when the email is new). Today these are unset, so it defaults to `/`; onboarding relies on the `OnboardingGuard` redirect to catch new users. Setting `signUpForceRedirectUrl="/onboarding"` (or `continueSignUpUrl`) would make the OAuth path land in the arc more deliberately.
- Docs: https://clerk.com/docs/react/reference/components/control/authenticate-with-redirect-callback

### 2d. Session finalize / `decorateUrl`
- `finalize({ navigate })` activates the session. `decorateUrl(path)` appends session hand-off params required for **Safari ITP** and **may return an absolute URL**.
- Current code always does `window.location.href = decorateUrl("/")` / `"/onboarding"` (`AuthPages.tsx:137,203,379`) — a **full page reload every time**. That hard-reload throws away any in-progress arc animation and causes a white flash.
- Recommended pattern (from the skill): only hard-navigate when `decorateUrl` returns an absolute URL (`url.startsWith('http')`); otherwise use client-side router navigation. This enables a **smooth, no-reload transition** from auth into onboarding — important for the "continuous journey" goal.
- `finalize`'s navigate callback also receives `session.currentTask` (Clerk **session tasks**) — if any post-auth tasks are configured, they must be routed before landing the user. Not used today; relevant only if session tasks get enabled.

---

## 3. Can auth be visually embedded INSIDE the onboarding arc?

**Visually yes; structurally there is a hard session boundary.**

The app's top level splits the entire route tree by auth state (`App.tsx:230–263`):
```
<Show when="signed-out">  → LandingPage, SignInPage, SignUpPage, /sso-callback
<Show when="signed-in">   → EnsureUser, OnboardingPage, main app (OnboardingGuard)
```
Consequences for a "landing → auth → onboarding as one arc" design:

1. **The session flip unmounts everything.** The moment `finalize()` succeeds, Clerk flips `<Show>` from `signed-out` to `signed-in`. React unmounts the **entire** signed-out subtree (landing + auth) and mounts the signed-in subtree (onboarding). You **cannot** keep one continuous React component mounted across the pre-auth → post-auth line.
2. **In-memory state does not survive the boundary.** Anything the user entered pre-auth (name, goals captured on a landing/"step 0") is lost across the flip unless persisted. The codebase already has the right tool: `apps/web/src/lib/onboardingPersistence.ts` (localStorage draft, read on mount in `OnboardingPage`). Pre-auth captured data should flow through the same persistence layer (or Clerk `unsafeMetadata` via `signUp.update()`).
3. **A continuous *look* is fully achievable.** Shared layout shell (the `AuthShell` split-panel already exists), shared design tokens, and matching enter/exit transitions make the flip visually seamless. Combined with client-side navigation in `finalize` (§2d) instead of `window.location.href`, the transition can avoid a reload/flash and *feel* like one journey even though it's two route trees.
4. **OAuth is the exception that always breaks the frame** (§2c): it round-trips through Google, so that particular path can't be animated inline — plan for a branded `/sso-callback` loading state rather than a seamless in-place transition.

**Net:** treat auth as a *styled boundary*, not a truly continuous mounted flow. Design the arc as: landing (signed-out) → auth (signed-out, same shell) → **[session boundary]** → onboarding (signed-in, same shell), with pre-auth data persisted across the boundary and client-side (non-reload) navigation on finalize.

---

## 4. What forces structure / blocks seamlessness (checklist)

| Forcing factor | Hard or soft? | Mitigation |
|---|---|---|
| `<Show signed-out/in>` splits the route tree → full remount at session flip | **Hard** (auth state is global) | Shared shell + persist pre-auth data (localStorage / `unsafeMetadata`) |
| OAuth is a full-page redirect to the provider + `/sso-callback` route | **Hard** (external navigation) | Branded callback loading screen; set `signUpForceRedirectUrl`/`continueSignUpUrl` |
| `#clerk-captcha` div must exist at `signUp.password()` call; Smart CAPTCHA may show a visible challenge | **Hard-ish** (needed for good bot UX) | Keep the div; give the sign-up step flexible height; style via `data-cl-*` |
| `finalize` + `decorateUrl` may return an absolute URL (Safari ITP) | **Hard** (only that case) | Branch: `window.location` only when absolute, else router `navigate` |
| Current `window.location.href` on every finalize causes a reload/flash | **Soft** (self-imposed) | Switch to client-side navigation for relative URLs |
| MFA punt to hosted page | **Soft** (self-imposed) | Build custom `signIn.mfa.*` step |
| Email verification / forgot-password as separate "views" | **Soft** | Already in-app; can be arc steps |

Nothing in Clerk forces a specific screen *sequence* or blocks branded transitions for the email/password paths. The only unavoidable structural facts are the global signed-out/signed-in boundary and the OAuth redirect round-trip.

---

## Concrete code notes tied to `AuthPages.tsx` / `App.tsx`

- `AuthPages.tsx:138–141` — MFA hosted-page punt → replace with custom `signIn.mfa.verify{TOTP,PhoneCode,EmailCode,BackupCode}` step (§2a).
- `AuthPages.tsx:137,203,379` — `window.location.href = decorateUrl(...)` → branch on `url.startsWith('http')` for reload-free arc transition (§2d).
- `AuthPages.tsx:432` — `#clerk-captcha` correctly present; keep it, consider `data-cl-*` styling (§2b).
- `AuthPages.tsx:155,393` — `signIn/up.sso(... redirectCallbackUrl: /sso-callback, redirectUrl: /onboarding )` — works; OAuth path can't be inline (§2c).
- `App.tsx:230/239` — `<Show>` gate = the session boundary that prevents a single mounted arc (§3).
- `App.tsx:235` — `<AuthenticateWithRedirectCallback />` unconfigured; add `signUpForceRedirectUrl` / `continueSignUpUrl` / rely on `OnboardingGuard` (§2c).
- `App.tsx:84–101` — `OnboardingGuard` already routes new/no-profile users to `/onboarding`; the arc should lean on this rather than fighting it.
- `apps/web/src/lib/onboardingPersistence.ts` — existing localStorage draft pattern = the vehicle for carrying pre-auth captured data across the session boundary.

## Key doc links
- Custom sign-in: https://clerk.com/docs/references/react/use-sign-in · Custom sign-up: https://clerk.com/docs/references/react/use-sign-up
- Custom flows overview: https://clerk.com/docs/custom-flows/overview
- MFA custom flow: https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication
- Bot protection: https://clerk.com/docs/react/guides/development/custom-flows/authentication/bot-sign-up-protection · https://clerk.com/docs/guides/secure/bot-protection
- OAuth custom flow: https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections
- AuthenticateWithRedirectCallback: https://clerk.com/docs/react/reference/components/control/authenticate-with-redirect-callback

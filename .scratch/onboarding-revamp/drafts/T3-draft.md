# T3 — Entry-arc flow & routing structure (PROPOSAL, not ratified)

Status: draft for grilling. Does not close T3. Written against the code as of 2026-07-23
(commit `4fffaf1`), grounded in `apps/web/src/App.tsx`, `apps/web/src/pages/AuthPages.tsx`,
`apps/web/src/pages/OnboardingPage.tsx`, `apps/web/src/lib/onboardingPersistence.ts`, and
R2's closed findings (`research/R2-findings.md`).

---

## 0. Corrections to the record before deciding anything

Two things stated as fact in the ticket/R2 gist don't match the current code. Flagging these
first because they change what "keep vs extend" means for persistence.

1. **The draft store is `sessionStorage`, not `localStorage`.** `onboardingPersistence.ts`
   calls `window.sessionStorage` (`getSessionStorage()`), not `window.localStorage`. This was
   introduced in #39 (`a3b360d`, "honest first-run experience"), the most recent commit before
   this effort started. The ticket text ("current onboarding drafts to localStorage") and R2's
   findings doc (`localStorage draft`) both describe the wrong storage. Practical effect: the
   draft **survives refresh and same-tab redirects** (including the OAuth round trip and today's
   `window.location.href` reloads — both same-tab navigations) but **does not survive closing the
   tab/browser**, a new tab, or a different device. This is the actual gap to close (§3).
2. **"Already-authed hitting landing" is already structurally impossible, not an edge case to
   design for.** `LandingPage` only exists inside `<Show when="signed-out">` (`App.tsx:230-238`).
   A signed-in user visiting `/` never reaches it — `/` isn't declared in the signed-in route
   table either, so it falls through to the `*` route, which is `OnboardingGuard` wrapping
   `AppLayout` → `HomePage`. Clerk's session-driven `<Show>` swap already guarantees this. I'm
   treating it as **confirmed correct, no change**, not a gap (§5 has the one related edge case
   that *is* real: direct/stale navigation to `/onboarding` after completion).
3. **There's an existing "Replay onboarding" feature** (`ProfilePage.tsx:698-709`,
   `SettingsTab.handleReplayOnboarding`) that sets `profile.onboardingComplete = false`, clears
   the draft, then navigates to `/onboarding`. Any gating rule for `/onboarding` must not break
   this deliberate re-entry path (§5 addresses the ordering that makes this safe).

---

## 1. The headline decision: does auth fold into the arc as step 0?

**No — auth stays discrete, gated routes (`/sign-in`, `/sign-up`, `/sso-callback`), each rendered
inside a shared visual shell.** Not a style preference — R2 already forecloses the alternative:
`<Show when="signed-out">` / `<Show when="signed-in">` is a global, Clerk-driven remount boundary
(`App.tsx:230,239`). The instant `finalize()` flips it, React unmounts the entire signed-out
subtree (landing + auth) and mounts the signed-in subtree. There is no version of "auth as step 0
of one continuous component" that survives that — the boundary is structural, not a routing
choice I get to make differently.

So the real design lever isn't "route vs. step" — it's **how much the discrete routes are made to
look and feel like one arc despite being separate trees.** That's what §4 (continuity) actually
specifies. Concretely, this means:

- `/sign-in`, `/sign-up` remain their own routes (deep-linkable, bookmarkable, and matching how
  Clerk's `AuthenticateWithRedirectCallback` and error/verification flows expect to be addressed).
- They render inside a shared `EntryShell` (see §4) so the *chrome* — wordmark position, background
  treatment, an arc-wide progress affordance — is visually continuous across the remount, even
  though the React tree underneath it is not the same tree.
- No new "unified" route (e.g. a single `/start` stepper component spanning auth+onboarding) is
  introduced, because it would misrepresent what's actually happening under the hood — Clerk's
  session model doesn't care what URL scheme wraps it, and a fake single-route abstraction would
  just be a leaky one, adding a maintenance surface with no structural benefit.

**Adjacent option I'm explicitly *not* deciding here:** whether to defer the registration wall —
i.e. let the visitor answer one or more onboarding-style questions *before* creating an account
(progressive registration), landing on `/sign-up` only once they've invested something. This is
structurally possible (an anonymous pre-auth question would just be more content inside the
signed-out tree, persisted the same way landing/auth state would be) and is a known lever for
activation, which matters given the active growth-strategy plan. But it's an IA/content decision
(which question, how many, what it does to the funnel) that belongs to T2/T4, not a routing
decision T3 should pre-empt. I'm flagging it here so it isn't silently foreclosed by this
ticket's route table, and I say more about why I didn't just decide it in §7 (this is my most
contestable call).

---

## 2. State model

Two independent axes drive every routing decision: **auth state** (Clerk: signed-out / signed-in)
and, only once signed-in, **profile state** (Convex `profile` query: `undefined` loading / `null`
none / `{onboardingComplete: false}` incomplete / `{onboardingComplete: true}` complete). OAuth
adds a transient third axis (mid-redirect) that resolves back into the other two.

```
                 ┌─────────────────────────┐
                 │        signed-out        │
                 │                          │
   ┌────────┐    │  /            LandingPage │
   │ anon / │───▶│  /sign-up     SignUpPage │──┐
   │returning│    │  /sign-in     SignInPage │  │
   │unauth  │    │  /sso-callback  (redirect)│  │  finalize()
   └────────┘    └─────────────────────────┘  │  [HARD BOUNDARY —
                                                │   full unmount,
                                                ▼   Show flips]
                 ┌─────────────────────────┐
                 │        signed-in         │
                 │                          │
                 │  profile === undefined   │  (loading spinner,
                 │        │                 │   "Loading your
                 │        ▼                 │   Stride space…")
                 │  profile === null   ─────┼──▶ /onboarding
                 │        or                │      (OnboardingPage)
                 │  !onboardingComplete ────┤
                 │        │                 │
                 │        ▼                 │
                 │  onboardingComplete:true ┼──▶ / , /nutrition, /coach, …
                 │                          │      (AppLayout + guarded routes)
                 └─────────────────────────┘
```

State table (this is the contract downstream tickets build against):

| # | State | Auth | Profile | Route(s) reachable | Renderer |
|---|---|---|---|---|---|
| A | New visitor | signed-out | n/a | `/` | `LandingPage` |
| B | Returning, unauth | signed-out | n/a | `/`, `/sign-in` | `LandingPage` → `SignInPage` |
| C | Mid sign-up | signed-out | n/a | `/sign-up` (internal views: form → verify) | `SignUpPage` |
| D | Mid sign-in, needs 2nd factor | signed-out | n/a | `/sign-in` (internal view, no new route) | `SignInPage` |
| E | OAuth in flight | signed-out→transient | n/a | `/sso-callback` | `AuthenticateWithRedirectCallback` |
| F | Session loading | unknown | n/a | any | `ClerkLoading` full-screen loader |
| G | Authed, profile loading | signed-in | `undefined` | any | `OnboardingGuard` spinner |
| H | Authed, not onboarded | signed-in | `null` or `onboardingComplete:false` | `/onboarding` (redirected here from anywhere else) | `OnboardingPage` |
| I | Authed, onboarded | signed-in | `onboardingComplete:true` | `/`, `/nutrition`, `/coach`, … | `AppLayout` + page |
| J | Authed, onboarded, replaying (deliberate) | signed-in | flipped to `false` by `handleReplayOnboarding` *before* navigating | `/onboarding` | `OnboardingPage` |

States D and E are **not new routes** — D is an internal view inside `/sign-in`'s existing
`view` state machine (`signin | forgot_email | forgot_code | forgot_newpwd` → add `mfa_verify`
as a sibling, once the MFA hosted-page punt at `AuthPages.tsx:138-141` is replaced per R2 §2a;
that replacement is out of T3's scope but the route table doesn't need to change for it). E is
already a route (`/sso-callback`) and stays one — it's the one leg that's an actual full-page
redirect out to Google and back, so it can't be folded into anything.

---

## 3. Gating rules (per user state)

| User state | Hits | Resolves to | Mechanism |
|---|---|---|---|
| New user | `/` | `LandingPage` (marketing) | `<Show signed-out>` route table |
| New user clicks "Start free" | `/sign-up` | Sign-up form | Direct route |
| Returning-unauth | `/` | `LandingPage` (with a "sign in" nav link) | same table — landing doesn't try to detect "have I been here before," no personalization; keep it simple |
| Returning-unauth, incomplete onboarding, signs in | `signIn.finalize()` → `/` | Guard sees `profile !== null but !onboardingComplete` (or `null`) → redirect `/onboarding` | `OnboardingGuard` on the `*` route — **this is the existing safety net and it's correct; no change** |
| Sign-up completes | `signUp.finalize()` → `/onboarding` (hardcoded target) | `OnboardingPage`, fresh or resumed draft | Direct — bypasses the guard round-trip entirely, which is why sign-up doesn't show the "Loading your Stride space…" flash that a same-tab sign-in redirect briefly does. **Recommend leaving this asymmetry as-is** (see rationale below) rather than routing both through `/` |
| OAuth sign-up (new user) | `/sso-callback` → today defaults to `/` (no `signUpForceRedirectUrl` set) → guard sees `profile === null` → redirect `/onboarding` | `OnboardingPage`, one extra redirect hop | **Recommend fix:** set `signUpForceRedirectUrl="/onboarding"` and `signInFallbackRedirectUrl="/"` explicitly on the `/sso-callback` route (`App.tsx:235`) per R2 §2c. Removes the hop/flash. The guard still exists as the fallback either way — this is a polish fix, not a correctness one |
| Authed, not onboarded, hits any app path directly (`/coach`, `/nutrition`, typed URL) | any `*` path | Redirected to `/onboarding` | `OnboardingGuard` — **already correct, no change** |
| Authed, onboarded, hits `/onboarding` directly (stale bookmark, typed URL, back-button) | `/onboarding` | Today: re-renders the onboarding chat unconditionally, no guard | **Gap — recommend adding a guard**: if `profile.onboardingComplete === true` on mount, redirect to `/`. Must not fire for the deliberate replay path — but replay already flips `onboardingComplete` to `false` via `await upsertProfile(...)` *before* calling `navigate("/onboarding")`, so by the time the redirect target is evaluated, the query already reads `false` and the guard correctly lets it through. Ordering already correct in `ProfilePage.tsx:698-709`; the guard just needs to read the same field |
| Authed, onboarded | any signed-in route | Normal app | `AppLayout` |

**Why keep the sign-up/sign-in finalize asymmetry (hardcoded `/onboarding` vs `/` + guard)
instead of unifying both through the guard:** unifying them (always finalize to `/`) would make
every fresh sign-up pay for a Convex round-trip and loading spinner it doesn't need — a brand-new
account is deterministically going to `/onboarding` (profile is always `null` for a user that
didn't exist a second ago). Sending sign-up straight there is strictly better for that case with
no downside. The guard's value is for sign-in, where the destination genuinely depends on state
the client doesn't know yet.

---

## 4. Persistence / resume strategy

**Recommendation: keep the existing shape (versioned draft, schema-tolerant merge, save-on-every-
change), change the backing store from `sessionStorage` to `localStorage`.**

What stays, because it's already well-built:
- The `{version, phase, state}` envelope and `ONBOARDING_DRAFT_VERSION` bump mechanism — this is
  exactly the tool needed when T2's IA rework changes the `Phase`/`State` shape; bumping the
  version safely discards incompatible old drafts instead of crashing on them.
- `mergeAcceptedState` — field-by-field type-compatible merge against a fresh default, so a
  renamed/removed field degrades to default rather than corrupting the whole draft. Keep this
  exactly as-is; it's the right primitive regardless of storage backend.
- Save-on-every-change (`useEffect` keyed on `[phase, state]`, which fires on every keystroke via
  `set()`) — there's essentially no un-persisted window. Keep.

What changes and why:
- **Storage backend: `sessionStorage` → `localStorage`.** This is the one concrete gap in
  "refresh/abandon/return": today, closing the tab (or the browser, or a session/cookie timeout
  that outlives the tab) loses the draft even though the user's Clerk account may still exist.
  `localStorage` survives all of that on the same device/browser. This is a one-line change in
  `onboardingPersistence.ts` (swap `window.sessionStorage` for `window.localStorage` in
  `getSessionStorage()` — rename the function while at it) with no schema impact.
- **Scope the key by identity, not just by device.** Today the storage key
  (`stride_onboarding_draft`) is global to the browser profile — if Account A abandons onboarding
  mid-flow and Account B signs in on the same device, B's `OnboardingPage` would read A's
  leftover draft. This is a real (if narrow) correctness/privacy gap, not hypothetical — nothing
  today clears the draft on sign-out (`DesktopSidebar.tsx:122`, `ProfilePage.tsx:814/897` both
  call bare `signOut()`). **Recommend:** either (a) clear the draft on sign-out, or (b) namespace
  the key by Clerk user id once known (`stride_onboarding_draft:${userId}`) so concurrent/sequential
  accounts on one device don't collide. (a) is simpler and sufficient — recommend (a).
- **Cross-device resume (Clerk `unsafeMetadata`) — explicitly deferred, not required.** R2 raises
  `signUp.update({ unsafeMetadata })` as a way to survive the auth boundary via the Clerk user
  object itself rather than local storage, which would also enable resuming on a different
  device/browser. I'm not recommending building this now: it requires a network call per phase
  change (vs. a synchronous local write), race handling if the user is mid-`signUp` (metadata
  can't be attached before the account exists), and there's no signal in the growth/beta plan
  that cross-device onboarding resume is a real user need at this stage. `localStorage` covers
  the actual stated cases (refresh, abandon-and-return, same-device) cheaply. Revisit if usage
  data says otherwise.

What happens, concretely, in each case:
- **Refresh mid-onboarding:** `localStorage` draft re-read on mount, same as today's `sessionStorage`
  behavior — no change in outcome, just durability.
- **Abandon (tab/browser closed) and return same device:** today loses the draft; after this
  change, resumes exactly where they left off, including if they never finished the account
  (still on `/sign-up`) since draft-reading doesn't depend on being signed in for the parts of the
  draft written pre-auth (there currently are none — see §1's "adjacent option" — but the plumbing
  is ready if T2/T4 add any).
- **Abandon and return on a different device:** starts fresh (no cross-device sync, by decision
  above). Acceptable — Convex has no profile row yet either way, so nothing was "lost" that had
  already been saved server-side; only in-progress, unsaved answers reset.
- **Finish onboarding:** `clearOnboardingDraft()` already fires in `finish()` — keep.
- **Replay onboarding (deliberate, from Settings):** already clears the draft before navigating
  (`ProfilePage.tsx:702`) — keep, unaffected by the storage swap.

---

## 5. Continuity across the hard unmount boundary

The unmount is real and can't be hidden, but three cheap things make it *read* as one journey
instead of two apps stapled together:

1. **Shared shell (`EntryShell`).** Introduce one shell component wrapping `LandingPage`,
   `SignInPage`/`SignUpPage`, and `OnboardingPage`, carrying: consistent wordmark placement,
   consistent background/surface tokens, and a slot for an **arc-wide progress affordance** — not
   just "step 2 of 7 onboarding questions" but "step 2 of 9" where steps 0–1 are account creation
   and steps 2–8 are onboarding. Concretely: define one ordered `ARC_STEPS` constant (e.g.
   `["sign-up", "verify", "name", "stats", "goal", ...]`) that both `AuthPages.tsx` and
   `OnboardingPage.tsx` import, so the step-count math is defined once and can't drift between the
   two trees even though they're separately rendered. (Visual design of the shell itself is T1's
   call; this ticket only fixes that the *step-numbering contract* must be shared, not per-tree.)
2. **Matching mount transition.** `AuthPages.tsx` already fades/slides its views in
   (`SPRING` transition, `initial={{opacity:0,y:8}}`). `OnboardingPage`'s chat view currently has
   *no* entrance transition at all (only the terminal "plan" phase does, `OnboardingPage.tsx:316-318`).
   Recommend giving the chat's first render the same fade/slide the rest of the arc uses (per R1's
   ≤250ms budget) so the first frame after `finalize()` doesn't visually "pop" relative to
   everything before it — the remount is invisible to the *component tree*, not to the *user*, if
   the entry animation matches.
3. **No-reload finalize.** Per R2 §2d: all three `finalize()` call sites currently do
   `window.location.href = decorateUrl(target)` unconditionally (`AuthPages.tsx:137,203,379`),
   which is a hard reload + white flash every time, even though `decorateUrl` only needs to be an
   absolute URL for Safari ITP edge cases. **Recommend:** `const dest = decorateUrl(target); if
   (dest.startsWith("http")) window.location.href = dest; else navigate(dest, { replace: true
   });` at all three sites. `{ replace: true }` matters for §6's back-button behavior below, not
   just for avoiding an extra history entry.

The one leg that genuinely cannot be made continuous is OAuth (§2c of R2): it's a real cross-origin
redirect to Google. Plan a branded loading state on `/sso-callback` (matching the shell) rather
than pretending it's inline — trying to hide that hop would just create a confusing "did it hang?"
moment.

---

## 6. Edge cases

| Edge case | Resolution |
|---|---|
| Already-authed user hits `/` (landing) | **Not reachable — structurally guaranteed by `<Show>`.** No design needed (§0.2). |
| Session expires mid-onboarding (Clerk session times out while `/onboarding` is mounted) | `<Show>` flips to signed-out, `OnboardingPage` unmounts. Because saves are synchronous and fire on every change (§4), essentially nothing typed is lost. On re-auth (same tab), Clerk session restarts, `<Show>` flips back, `OnboardingGuard`/`/onboarding` sees the still-incomplete profile and the `localStorage` draft is re-read on `OnboardingPage`'s fresh mount — resumes at the same phase. **No new mechanism needed beyond the storage swap in §4**, but worth an explicit test case since it's the one path that actually exercises the unmount-and-remount round trip within a single user action. |
| Back-button from `/onboarding` | In-app phase changes (the chat's own `goBack()`) don't touch browser history — only whole-route navigation does. After the `navigate(..., { replace: true })` change in §5, there's no dangling `/sign-up` or `/sign-in` history entry to bounce through; pressing Back from `/onboarding` lands on whatever was in history *before* auth (e.g. `/` marketing, viewed as `LandingPage` if by then signed-out, or silently redirected back to `/onboarding` by `OnboardingGuard` if the URL happens to resolve to a stale in-app route while still signed-in-and-incomplete). Either outcome is safe — nothing dead-ends, and no confirmation dialog is needed since nothing is lost (draft is autosaved). |
| Back-button / direct nav to `/onboarding` after completion | Currently unguarded (§3 gap) — recommend the `onboardingComplete === true → redirect to /` guard, verified compatible with the deliberate Replay flow (§0.3, §3). |
| User abandons at CAPTCHA / mid-sign-up, comes back later | Draft (localStorage, post-fix) still has their name/email typed if it made it into onboarding-adjacent state; the sign-up form's own fields (email/password) are *not* currently persisted by `onboardingPersistence` (it only covers the onboarding phases, not the auth form) and Clerk doesn't let you resume a half-typed, unsubmitted sign-up either — this is expected and fine, it's not a data-loss regression, it's the same as any web form today. |
| Two accounts, one device (Account A abandons, Account B signs in) | Addressed in §4 — recommend clearing the draft on sign-out to prevent cross-account leakage. |
| OAuth sign-up lands a *returning* user (email already exists) via Google | Clerk's `transferable` default (`true`, per R2 §2c) already lets an OAuth sign-in attempt transfer into sign-up territory only when the email is new; for an existing email it resolves as a normal sign-in. No new gating needed — falls through to the same "authed, profile already complete" path as any other sign-in. |

---

## 7. Most contestable call, named explicitly

**Not deciding whether registration is deferred (progressive/anonymous pre-auth capture) — I
scoped that out of T3 and left it as an option for T2/T4 to pick up (§1).** The alternative view:
given the active growth-strategy plan is explicitly about activation and this whole effort exists
partly to fix the *first* experience, a routing ticket that hands back "auth is still a hard wall
before any onboarding content, exactly like today" could be read as under-delivering on the
"cohesive branded arc" destination — arguably the routing skeleton *should* pre-commit to at
least one pre-auth capture point so T2/T4 aren't structurally boxed out of it later.

I chose not to pre-commit because: (a) it's a product/IA call about *which* content earns its way
pre-auth, not a routing-capability question — the routing skeleton already supports it without
deciding it (an anonymous pre-auth question is just more content in the signed-out tree, carried
across the boundary the same way §4 already plans for); (b) committing to it here would mean T3
silently deciding T2's scope; and (c) it measurably increases build complexity (anonymous-state
merge-into-account logic) that shouldn't be taken on speculatively before T2 has picked the
actual question set. But I'd treat pushback on this as legitimate — if the human grilling this
wants T3 to lock "yes, there is exactly one pre-auth hook question" as a hard requirement handed
to T2, that's a reasonable amendment and doesn't conflict with anything else in this proposal.

Second-most contestable, smaller: recommending `localStorage` over Clerk `unsafeMetadata` for
cross-boundary persistence (§4) trades away cross-device resume for simplicity. If the growth plan
cares about mobile-web → desktop continuation specifically, that call should flip.

---

## 8. Summary of concrete recommendations (for the eventual build ticket)

1. Keep `/sign-in`, `/sign-up`, `/sso-callback`, `/onboarding` as discrete routes (§1). No new
   unified route.
2. Wrap `LandingPage` / `SignInPage`+`SignUpPage` / `OnboardingPage` in a shared `EntryShell` with
   one arc-wide `ARC_STEPS` step-count contract (§5).
3. Give `OnboardingPage`'s chat view a matching entrance transition (§5).
4. Swap all three `finalize()` call sites from unconditional `window.location.href` to the
   `decorateUrl`-absolute-URL branch + `navigate(dest, { replace: true })` otherwise (§5).
5. Set `signInFallbackRedirectUrl="/"` and `signUpForceRedirectUrl="/onboarding"` on the
   `/sso-callback` route (§3).
6. Swap `onboardingPersistence`'s backing store from `sessionStorage` to `localStorage`; clear the
   draft on sign-out (§4).
7. Add a guard: signed-in + `profile.onboardingComplete === true` visiting `/onboarding` directly
   → redirect to `/`, verified not to break `handleReplayOnboarding` (§3, §6).
8. Not now, tracked as deferred: cross-device draft resume via Clerk `unsafeMetadata`; the MFA
   hosted-page replacement (R2 §2a, someone else's ticket but the route table already
   accommodates it with zero changes, §2).

None of this is implemented — all eight are proposals for the human to accept, amend, or reject
before this ticket closes.

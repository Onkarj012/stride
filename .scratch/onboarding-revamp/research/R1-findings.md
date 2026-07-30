# R1 — Hybrid Conversational + Focused-Step Onboarding: Patterns & Accessibility

**Ticket:** R1 (Onboarding revamp research)
**Date:** 2026-07-23
**Scope:** Best-in-class hybrid (persona + one-question-per-screen) onboarding, premium step-motion, and accessible multi-step form patterns. Feeds visual-direction + interaction-design decisions for the "Stry" flow.

---

## TL;DR — what to adopt vs avoid

**ADOPT**
- **One decision per screen** with a persona wrapper for *framing*, not for input. Conversation sets tone; a focused control (buttons/slider/single field) captures the answer.
- **Persona as a light, consistent voice** (avatar + 1 short line per screen), plus **selective empathy** — reassurance/rationale on *sensitive* screens only, not every step.
- **Explain "why" before sensitive asks** (weight, sex-at-birth, goals) to defuse "random data grab."
- **Checkpoint payoffs** — periodic summary/graph screens that show accumulated value; a real payoff (plan preview) before any email/paywall gate.
- **Determinate progress with real semantics** — visible "Step X of N" *and* `role="progressbar"` / `aria-valuenow` so it's not "accessibility theater."
- **Move focus on every step change** to the step heading (`tabindex="-1"` + `.focus()`), backed by an `aria-live` announcement — but never both firing at once.
- **Directional, short slide+fade transitions** (150–250ms, translate ≤24px, opacity) that respect `prefers-reduced-motion`.

**AVOID**
- A **scrolling chat thread as the primary input surface** (see §4 pitfalls: focus reset, SR verbosity, scroll ambiguity).
- **Streaming/token-by-token announcements** to screen readers — announce the *complete* reply once.
- **Persona chattiness on every screen** — empathy everywhere reads as fake and slows tap-through.
- **Progress bars with no programmatic value**, or listing all N steps at once (overwhelming).
- **Large scale/pan/parallax** transitions (vestibular triggers) and motion that gates usability.

---

## 1. Real apps: conversational framing + focused steps

| App | Domain | What makes it personal | What makes it structured |
|-----|--------|------------------------|--------------------------|
| **Noom** | Weight/behavior | Conversational reassurance after vulnerable answers ("Thank you for sharing. That's a hard first step."); *selective* empathy branching; explains rationale *before* sensitive questions | ~1 sentence max per screen for fast tap-through; strict one-question-per-screen; "Question X of 10"; checkpoint "small wins" (graphs, projections); payoff before email gate (~1/3 in) |
| **Cal AI** | Calorie tracking | Quiz-style flow that builds felt personalization + sunk-cost investment before the paywall; personalized plan reveal | Long, tightly-chunked single-question steps; each answer feeds a "personalized plan" payoff, then trial offer |
| **Ada Health** | Symptom triage | Conversational AI that asks *targeted follow-ups* in the user's own words, narrows possibilities | Under the hood it's a structured decision tree delivering a discrete report — conversation is the skin, structure is the engine |
| **Calm (2026 AI onboarding)** | Mental health | Conversational onboarding to surface intent/qualitative signal that scores + reviews miss | Maps free-form intent onto structured member-discovery paths |

**The recurring recipe (this is the model for Stry):** *conversation is the skin; a state machine is the engine.* The persona reduces the felt weight of a long form and adds warmth/rationale; the focused single-question steps keep data capture unambiguous, resumable, and low-cognitive-load. Noom is the reference implementation — "structure creates predictability; empathy creates belonging."

Sources: [RevenueCat – Noom funnel teardown](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel/) · [screensdesign – Cal AI breakdown](https://screensdesign.com/showcase/cal-ai-calorie-tracker) · [Perspective AI – Calm conversational onboarding](https://getperspective.ai/blog/calm-ai-strategy-mental-health-app-conversational-onboarding-2026) · [Merge – best-designed health apps](https://merge.rocks/blog/8-best-designed-health-apps-weve-seen-so-far)

---

## 2. Motion / transition patterns that read premium without hurting usability

- **Directional slide + fade between steps.** Forward = new step enters from the right (translateX small, e.g. 16–24px) + fades in; back = mirror. Direction encodes "advance vs return," which aids orientation. Keep it **subtle and short** (~150–250ms) so it gives feedback without blocking the next tap. (`motion/react`: `AnimatePresence` + `mode="popLayout"`/`"wait"`, `custom` direction prop, `initial/animate/exit`.)
- **Animate the container, not the whole page.** Transition the step card; keep the persona header and progress bar persistent so they read as a stable frame. Persistent chrome is what makes long flows feel like one continuous experience rather than N disjoint pages.
- **Micro-feedback on selection.** Brief scale/opacity on the chosen option before advancing gives a tactile "got it," and covers the state change while the next step mounts.
- **Progress bar tween.** Animate the fill width on advance — cheap, and reinforces momentum ("distance traveled").
- **View Transitions API** is a clean native option for step swaps if you're not tied to `motion/react`, but `motion/react` gives finer control over per-direction custom variants and is already in the stack.
- **Reduced motion is non-negotiable.** Under `@media (prefers-reduced-motion: reduce)` / `window.matchMedia('(prefers-reduced-motion: reduce)')`, drop translate/scale and keep only a fast opacity crossfade (or nothing). Motion should never be the *only* signal that the step changed — pair it with the focus move + live announcement (§3). Avoid large scale/pan/parallax entirely; those are vestibular triggers.

Sources: [MDN – prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) · [Andy Fry – multi-step form animations (Framer Motion)](https://andyfry.co/multi-step-form-animations/) · [Piccalilli – view transitions to elevate UI](https://piccalil.li/blog/some-practical-examples-of-view-transitions-to-elevate-your-ui/) · [PixelFreeStudio – animating forms/inputs](https://blog.pixelfreestudio.com/best-practices-for-animating-forms-and-inputs/)

---

## 3. Accessible multi-step form patterns (with WCAG/ARIA cites)

### Focus management on step change (the single most important one)
- On advancing to a new step, **move focus to the new step's heading**: render an `<h1>`/`<h2>` with `tabindex="-1"` and call `.focus()` after mount. This tells non-visual users the context changed and starts them at the top of the new content — not at a random/detached node.
- **Do not rely on focus alone.** NVDA+Firefox and VoiceOver+Safari don't reliably announce the newly focused element. Back it up with a live-region announcement ("Step 3 of 8: Your goals").
- **Never fire both at the same time.** Focus move + `aria-live` firing together causes double-speech/conflict. Pattern: announce via live region *or* rely on the focused heading; if managing focus for the step, gate the live region so they don't collide.

### aria-live for conversational persona replies
- Persona lines and validation should live in a **polite** live region (`aria-live="polite"`), so they're announced without interrupting.
- If the persona reply **streams/types**, do **not** announce token-by-token — it floods the SR. Suppress the live region during streaming and announce the **complete** message once it finishes. Same rule for any typing-indicator affordance.
- Prefer a **single, stable live region** updated on step change over sprinkling many — reduces redundant/duplicate announcements. (Per-step embedded live regions are fine when each step carries genuinely different contextual copy.)

### Progress semantics (avoid "accessibility theater")
- Visual "Step X of N" must be **programmatically exposed**: `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, plus a descriptive `aria-label`. A pretty bar with no ARIA "looks inclusive but fails the users who need it most."
- For a stepper/wayfinding list, mark the active step with **`aria-current="step"`**.
- Show current position, steps remaining, and (ideally) a sense of time — users need to gauge "2-minute task vs 20-minute commitment." Don't render all N steps as one long list (overwhelming); checkpoints or a compact bar are better.

### Keyboard flow
- Everything operable by keyboard (**WCAG 2.1.1 Keyboard**). Logical focus order matching visual/reading order (**2.4.3 Focus Order**). Visible focus indicator on every control (**2.4.7 Focus Visible**).
- Only move focus to **natively interactive** elements (or a `tabindex="-1"` heading) — don't dump focus on non-interactive nodes; behavior across AT is unreliable otherwise.
- Enter/Space should advance single-select steps; ensure a clear, reachable Back control.

### Error handling
- Validate **before** allowing progression; don't let users advance past an invalid step and discover it later.
- Announce validation via `aria-live="polite"`; associate messages with fields (`aria-describedby`), and expose invalid state with `aria-invalid`. Errors as **status messages** map to **WCAG 4.1.3 Status Messages**.
- Group related controls with `<fieldset>`/`<legend>`; label every input (**1.3.1 Info and Relationships**, **4.1.2 Name, Role, Value**).

### Reduced motion & timing
- Honor `prefers-reduced-motion` (see §2). Motion must never be the sole indicator of a step change.
- Avoid time limits; if any exist, allow extend/disable + warnings, and support save-and-resume for users who pace differently (**WCAG 2.2.1 Timing Adjustable**). Resumability doubles as a product win for a long flow.

**Applicable WCAG success criteria:** 1.1.1, 1.3.1, 1.4.3 (Contrast), 2.1.1, 2.2.1, 2.4.3, 2.4.7, 4.1.2, 4.1.3.

Sources: [W3C WAI – Forms Tutorial](https://www.w3.org/WAI/tutorials/forms/) · [accessibility.chat – multi-step forms](https://www.accessibility.chat/articles/multi-step-forms-where-user-experience-and-accessibility-collide) · [VA.gov Design System – Focus management](https://design.va.gov/accessibility/focus-management) · [AccessivePath – accessible progress bar (WCAG 2.2 AA)](https://accessivepath.com/blog/how-to-make-progress-bar-accessible) · [Reform – accessible form validation](https://www.reform.app/blog/accessible-form-validation-best-practices) · [Medium – enhancing multi-step form accessibility with aria-live](https://medium.com/@python-javascript-php-html-css/enhancing-multi-step-form-accessibility-with-aria-live-78d2459e415a)

---

## 4. Pitfalls of a scrolling chat-thread onboarding (current Stride model) — and how hybrids avoid them

| Pitfall (chat thread) | Why it hurts | How the hybrid avoids it |
|---|---|---|
| **Focus resets to top after a message/turn** | SRs commonly jump focus back to page top after sending; user must re-navigate to the input every turn — brutal on a 10-step flow | Discrete steps own focus deterministically: focus moves to the *new step heading*, input is the next stop. No hunting. |
| **Screen-reader verbosity / token flooding** | Streaming persona text announces token-by-token; SR reads a flood; unrelated page chrome gets picked up mid-conversation | Persona line is short, in a controlled live region, announced *once complete*; step content is bounded, not an ever-growing log |
| **Scroll management ambiguity** | Growing thread means new content can appear off-screen; auto-scroll fights the user; position is unpredictable for everyone | One screen = one question; nothing scrolls out from under the user; persistent header/progress stay put |
| **No sense of progress / length** | An open-ended thread hides how much is left → drop-off; can't tell 2-min vs 20-min | Determinate progress bar + "Step X of N" + checkpoints set expectations |
| **`aria-live` log misuse** | Live regions "used in ways they weren't designed for" in chat; double-vocalization when focus + live fire together | Single stable live region, gated against focus moves; `role="log"` only if a true transcript is retained |
| **Resumability / correcting answers** | Editing an earlier chat answer is awkward; state is a transcript, not a form | Step state is a form model — Back to any step, edit, resume; save-and-resume supported |

**Design implication for Stry:** keep the *conversational feel* (persona avatar, one warm line, empathetic micro-copy on sensitive steps) but make the **input surface a focused step, not a chat log**. The thread metaphor can survive visually as a light framing device, but the accessibility + focus + progress model must be the multi-step-form model, not the chat model.

Sources: [TestDevLab – live chat accessibility](https://www.testdevlab.com/blog/accessible-live-chats-tips-for-designing-creating-and-testing) · [Orange – chatbot a11y best practices](https://a11y-guidelines.orange.com/en/articles/chatbot/) · [Inovarc – chatbot accessibility issues & fixes](https://inovarcai.io/chatbot-accessibility-common-issues-and-fixes/) · [Medium/Bootcamp – your SPA is broken for screen readers](https://medium.com/design-bootcamp/accessible-by-design-part-2-your-spa-single-page-application-is-broken-for-screen-readers-739769110ce1)

---

## Quick implementation checklist for the Stry build

1. State machine of steps (not a message array); each step = `{ heading, personaLine?, control, validate }`.
2. Persistent frame: persona header + `role="progressbar"` bar; only the step card animates.
3. On step change: focus the step `<h2 tabindex="-1">`; announce "Step X of N: {title}" via one polite live region (gated vs focus).
4. Persona line short + in the live region; if typed, announce only when complete.
5. `motion/react` `AnimatePresence` directional slide+fade, 150–250ms; collapse to opacity-only under `prefers-reduced-motion`.
6. Validate before advance; `aria-invalid` + `aria-describedby` + polite error announcement.
7. Selective empathy: rationale/reassurance copy only on sensitive steps.
8. Checkpoint payoff screen(s) + plan preview before any email/paywall gate; save-and-resume state.
9. Keyboard: Enter/Space advances, reachable Back, visible focus rings, logical order.

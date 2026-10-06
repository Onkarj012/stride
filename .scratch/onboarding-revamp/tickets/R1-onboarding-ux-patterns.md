---
id: R1
title: "Research: hybrid + accessible onboarding patterns"
type: research
status: closed
assignee: wayfinder-research
blocked_by: []
---

## Resolution (2026-07-23)

Findings: `../research/R1-findings.md`.

Winning recipe: **"conversation is the skin, a state machine is the engine."** Reference models —
Noom (empathy + rationale-before-sensitive-asks + checkpoint payoffs), Cal AI (quiz-driven
investment before paywall), Ada Health (conversational front / decision-tree back). Keep persona
framing (avatar + one short warm line, empathy only on sensitive steps); make the input surface a
**focused single-question step**, not a chat log.

- **Motion:** directional slide+fade on the step card only (150–250ms, translate ≤24px),
  persistent persona/progress chrome; collapse to opacity-only under `prefers-reduced-motion`;
  avoid scale/pan/parallax (vestibular).
- **A11y essentials:** move focus to new step's `<h2 tabindex="-1">` per step change + a single
  polite `aria-live` region — never both at once (double-speech). Real progress semantics
  (`role=progressbar`, `aria-current=step`), validate-before-advance (`aria-invalid` +
  `aria-describedby` + 4.1.3 status), announce streamed persona replies only when complete.
  WCAG SC: 1.3.1, 2.1.1, 2.2.1, 2.4.3, 2.4.7, 4.1.2, 4.1.3.
- Current chat-thread failures (focus resets to top, token-flood verbosity, scroll ambiguity, no
  progress sense, awkward editing) are exactly what focused-step fixes. Doc has pitfall table +
  ADOPT/AVOID shortlist + 9-point build checklist.

## Question

What do best-in-class **hybrid conversational + focused-step** onboarding flows look like, and
what are the concrete **accessibility** patterns for accessible multi-step forms? Surface the
facts T1 (visual direction) and T4 (interaction spec) will build on.

Cover:
- Apps that pair a conversational/persona framing with focused one-question-per-screen steps
  (e.g. finance/health/fitness onboarding). What makes them feel personal *and* structured.
- Motion/transition patterns between steps that read as premium without harming usability.
- Accessible multi-step form patterns: focus management on step change, `aria-live` for a
  conversational reply, progress semantics, keyboard flow, error handling, reduced-motion.
- Pitfalls of the current chat-thread model (scroll, focus loss, SR verbosity) and how the
  best hybrids avoid them.

Deliver a concise findings doc with cited examples and a shortlist of patterns to adopt/avoid.

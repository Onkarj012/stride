---
id: T6
title: Accessibility spec for the entry flow
type: grilling
status: open
assignee:
blocked_by: [T4]
---

## Question

What is the **accessibility contract** for the revamped entry flow? The user named accessibility
as a core weakness of the current chat model — this ticket makes the bar explicit and testable
against the decided interaction model (T4).

Decide:
- Target conformance (WCAG 2.2 AA assumed unless raised) and how it's verified.
- Focus management across step transitions (where focus lands, focus trapping, restore on back).
- Live-region strategy for conversational replies / dynamic content (`aria-live`, politeness).
- Progress + step semantics for screen readers; accessible names for choice chips, builders.
- Keyboard operability of every input pattern from T4; visible focus states.
- Reduced-motion behavior (current `useReducedMotion` hook) — what each animation degrades to.
- Color contrast obligations for the chosen visual direction (feeds back to T1 if it conflicts).

Use `grilling`. Resolution = the accessibility spec (requirements + acceptance checks).

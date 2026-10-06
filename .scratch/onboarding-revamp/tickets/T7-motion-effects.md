---
id: T7
title: Motion & effects language + tooling decision
type: prototype
status: open
assignee:
blocked_by: [T1]
---

## Question

What is the **motion/effects language** for the arc, and which **tooling** delivers it? The user
wants "much better visual effects"; tooling was deliberately deferred to a prototype.

Decide and prototype:
- The motion vocabulary implied by the chosen visual direction (T1): easing, timing, choreography
  for step transitions, the plan-reveal peak, hero moments, micro-interactions.
- Tooling per effect: `motion/react` (current, cross-platform-friendly) vs `GSAP` for showpiece
  moments (gsap skills available) — with a clear rule for when each is used.
- Performance + reduced-motion budget (coordinate with T6); mobile-feasibility of each effect
  (feeds the mobile fog — some web effects may not translate to RN).

Use `prototype`; consult `gsap-*` skills if GSAP is in play. Build a throwaway motion demo of the
hero transition + plan reveal. Resolution = the motion spec + tooling decision + linked demo.

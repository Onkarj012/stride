---
id: T10
title: Consolidated hand-off spec
type: task
status: open
assignee:
blocked_by: [T4, T5, T6, T7, T8]
---

## Question

Assemble every resolved decision into **one hand-off-ready spec** a builder can implement from —
the destination artifact.

Consolidate:
- Flow & routing (T3), information architecture (T2), visual direction (T1).
- Hybrid interaction spec (T4), auth design (T5), plan-reveal payoff (T8).
- Accessibility contract (T6), motion/effects + tooling (T7).
- Per-platform build breakdown: split shared design decisions into web (`apps/web`) and mobile
  (`apps/mobile`, React Native) implementation tickets — this is where the mobile fog graduates.
- Any recommended backend/Convex changes flagged along the way (as recommendations — building is
  out of scope per map).

This is a `task` (assembly + authoring), not a new decision. Resolution = the finished spec doc,
linked, with the platform-split build tickets enumerated. Reaching this closes the map.

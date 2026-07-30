---
id: T2
title: Onboarding information architecture
type: grilling
status: open
assignee:
blocked_by: []
---

## Question

What should the onboarding **actually ask**, in what **order**, grouped into which **steps**?
The question set is open to redesign — this ticket decides the content/IA independent of visuals.

Current phases: name → stats (age/weight/height/sex/bodyfat) → goal → work → lifestyle →
training → diet → style → plan reveal. Decide:
- Which questions stay, get cut, merge, or are added; what's required vs optional vs deferrable.
- Ordering for momentum (quick win first? heaviest question placement?) and perceived length.
- How questions group into hybrid steps (one-per-screen vs small clusters like the stats grid).
- What the **plan reveal** should show and how much calculation transparency (current: MacroDonut
  + calorie/macro breakdown + "About this calculation" details).
- Where AI free-text parsing (`api.ai.parseOnboarding`) fits per step.
- Note any question changes that would imply backend/Convex field changes (flag for out-of-scope
  build, per map).

Use `grilling` + `domain-modeling`. Resolution = the decided question/step list with rationale.

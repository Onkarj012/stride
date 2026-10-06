---
id: T4
title: Hybrid onboarding interaction spec
type: prototype
status: open
assignee:
blocked_by: [T1, T2, R1]
---

## Question

How does the **hybrid** onboarding actually behave, step to step? Turn the chosen visual direction
(T1), question set (T2), and researched patterns (R1) into a concrete interaction spec.

Decide and prototype:
- The per-step frame: how "conversational framing + focused step" works — is Stry a persistent
  presence, a per-step greeting, a reactive line? Where does the question live vs the input.
- Transitions between steps (enter/exit, direction, progress indication).
- Input patterns per question type (choice chips, number grids, free-text AI parse, builders like
  the training rows) reconceived for focused steps.
- Navigation: back, skip, edit-a-previous-answer, progress affordance.
- Empty/loading/error states inside a step (e.g. AI parse failure, plan calc loading).

Use `prototype` + `frontend-design`. Build a throwaway interactive prototype of 2–3 representative
steps. Resolution = the decided interaction spec + linked prototype.

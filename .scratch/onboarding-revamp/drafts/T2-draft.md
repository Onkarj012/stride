---
ticket: T2
title: Onboarding information architecture — PROPOSAL (not ratified)
status: draft, awaiting grilling
---

> **This is a proposal, not a decision.** Every call below is justified so a human grilling
> session has something concrete to push on. Nothing here closes T2.

## Method note

The `domain-modeling` skill could not be invoked directly (disabled for model invocation in
this session's settings), so I read its source
(`~/.agents/skills/domain-modeling/SKILL.md`, `ADR-FORMAT.md`) and applied the discipline
manually: sharpen fuzzy terms before using them, stress-test with concrete scenarios, check
claims against the actual code, and reason in ADR style (context → decision → why → rejected
alternative) for the calls that are genuinely hard to reverse — without spinning up a
`CONTEXT.md`/`docs/adr/` in the repo, since this effort's only sanctioned artifact is the
ticket resolution itself.

## Grounding: what the code actually does today

Read in full before drafting anything below:
- `apps/web/src/pages/OnboardingPage.tsx` — phases `name → stats → goal → work → lifestyle →
  training → diet → style → plan`.
- `apps/web/src/components/charts/MacroDonut.tsx` — animated ring, kcal-in-center only.
- `packages/backend/convex/ai.ts` (`parseOnboarding`, line ~892) — free-text→JSON extractor with
  a per-field schema map: `stats`, `goal`, `work`, `training`, `diet`, `name`. **No `lifestyle`
  key** — the lifestyle step's `FreeText` component reuses `field="work"` (confirmed at
  `OnboardingPage.tsx:492`), piggy-backing on the fact that the `work` schema's output already
  includes `lifestyleActivity`. Works, but the shared key is confusing to read and to extend.
- `packages/backend/convex/tdee_engine.ts` — the actual math. **Load-bearing fact: this engine
  has no `dietaryPreference` field in `PlanInput` at all.** Diet preference/allergies do not
  affect calories or macros — they exist purely for downstream meal-suggestion personalization,
  not the plan calculation shown on the reveal screen.
- `packages/backend/convex/schema.ts` (`user_profiles`) — already has `goalWeightKg`,
  `dislikedFoods`, `cuisines`, `equipment`, `scheduleNote`, all optional, none currently written
  by any UI flow except `dislikedFoods`/`cuisines`/`equipment`/`scheduleNote` via
  `ProfilePage.tsx`'s `ProfileDetailsCard` (Goals tab → "Personalization").
- `packages/backend/convex/profile.ts` — `upsertPlanFromOnboarding` (mutation) already accepts
  `goalWeightKg`, `dietaryPreference`, `allergies` as args and persists them; `upsertProfile`
  (used by `ProfileDetailsCard`) already accepts `dietaryPreference`, `allergies`,
  `dislikedFoods`, `cuisines`, `equipment`, `scheduleNote` — but **not** `goalWeightKg`.
- `apps/web/src/pages/ProfilePage.tsx` (`AccountField`, `RightPanel.tsx:55`) — **`goalWeightKg`
  is displayed in two places in the live app (desktop mobile-account layout, dashboard right
  panel) and is never settable anywhere.** It always renders "Not set." This is a genuine,
  pre-existing dead-field gap, not a hypothetical.

These facts drive several decisions below — flagged inline as "(grounded in code)".

## Sharpening the vocabulary

The ticket asks for required/optional/deferrable and stay/cut/merge/add. Before applying these,
pinning down what each means (fuzzy otherwise):

- **Required** — onboarding's Continue is blocked without a valid value; there is no safe
  default the calculation can silently assume for this person; skipping it would make the
  reveal screen wrong or impossible to compute at all.
- **Optional** — onboarding completes fine without it; a default (or "none"/"no preference")
  stands in; skipping degrades personalization precision but never breaks or falsifies the
  plan.
- **Deferrable** — deliberately *not asked* during onboarding at all. Captured later through an
  existing (or trivially extended) post-signup surface, at zero cost to onboarding momentum.
  A field only qualifies as deferrable if a real "later" home for it already exists or is a
  one-screen addition to one — otherwise "deferrable" is just "silently dropped," which is a
  different, worse thing.

## Headline decisions

1. **Reorder: goal moves ahead of stats** (name → **goal** → **stats** → work → lifestyle →
   training → diet → style → plan). Everything else keeps its current relative order.
2. **`dietaryPreference` demoted from required-tap to optional-with-default** ("none"
   preselected, Continue never blocked on it) — grounded in code: the TDEE/macro engine never
   reads it, so gating Continue on it today buys zero calculation correctness, only friction.
3. **Add `goalWeightKg` as an optional field inside the `goal` step**, shown conditionally
   (loss/gain goals only, hidden for maintain/recomp) — closes the pre-existing dead-field gap
   above, and it is *fully wired end-to-end already*: zero schema change, zero new mutation
   args needed on the onboarding-write path (`upsertPlanFromOnboarding` already accepts it).
4. **Three deliberate exceptions to R1's one-question-per-step rule** — stats cluster, work
   cluster, training builder — each named and justified individually (R1 said "not clusters
   unless truly quick"; I'm treating that as a real test, not a blanket carve-out).
5. **Plan reveal keeps its current three-tier transparency architecture** (headline macros →
   collapsed engineering breakdown), with one content addition (a one-line narrative framing
   inside the breakdown) and one new stat (distance to goal weight, when set) — no structural
   rebuild.
6. **No new fields are asked outside what's listed above.** `dislikedFoods` / `cuisines` /
   `equipment` / `scheduleNote` stay **deferred** to `ProfilePage`'s existing Personalization
   card — they already live there, they don't feed the calculation, and adding them to
   onboarding would lengthen the flow for no plan-quality benefit.
7. **Zero `schema.ts` changes are implied by anything in this proposal.** Two small,
   flagged `convex/ai.ts` prompt/schema edits are recommended (not required) — see the
   backend-impact section.

---

## Full question inventory: stay / cut / merge / add

| Field | Current step | Verdict | Required? | Why |
|---|---|---|---|---|
| `firstName` | name | **Stay** | Required | Zero-friction, personalizes copy for every later step ("Nice to meet you, X"). |
| `goal` (enum) | goal | **Stay, reordered to step 2** | Required | Single tap; the one input everything else calibrates around (`goalAdjustment` in `tdee_engine.ts`); best placed as the motivational anchor, not buried after demographic data entry. |
| `goalWeightKg` | *(new)* | **Add**, inside `goal` step | Optional | Closes a live dead-field gap (see Grounding). Conditional: only shown for `aggressive_loss / moderate_loss / mild_loss / lean_gain / muscle_gain`; hidden for `maintain` (no target by definition) and `recomp` (target is body composition, not scale weight). |
| `age`, `weightKg`, `heightCm`, `sex` | stats | **Stay, reordered to step 3** | Required | Mifflin-St Jeor / Katch-McArdle need all four simultaneously — no safe default exists; the plan literally cannot be computed without them. |
| `bodyFat` | stats | **Stay** | Optional | Gates Katch-McArdle vs. Mifflin-St Jeor precision; already optional in code, keep it that way. |
| `occupationType` | work | **Stay** | Required | Feeds `neatJob`; four single-tap choices, cheap to require. |
| `workHoursPerDay` | work | **Stay** | Required-with-default | Pre-filled "8"; user only has to change it if wrong — effectively required but frictionless. |
| `lifestyleActivity` | lifestyle | **Stay** | Required | Feeds `neatLifestyle`; single tap, four choices. |
| `weeklyWorkouts[]` | training | **Stay** | Optional (explicit Skip already exists) | Feeds `eat`; genuinely optional — someone with no regular training still gets a valid, if lower, plan. |
| `dietaryPreference` | diet | **Stay, demoted to optional** | Optional (was required-to-continue) | **Grounded in code: `PlanInput` never reads this field.** Requiring a tap for a value the calculation ignores is pure friction with no payoff. Default to `"none"`, never block Continue. |
| `allergies` | diet | **Stay** | Optional | Already optional free text; no change. |
| `coachingStyle` | style | **Stay** | Required-with-default | Already defaults to `"gentle"`; always has a valid value, single tap to change. No change needed. |
| `dislikedFoods`, `cuisines`, `equipment`, `scheduleNote` | *(not currently in onboarding)* | **Deferred, not added** | N/A | Already have a home: `ProfilePage.tsx` → Goals tab → `ProfileDetailsCard` ("Personalization"), backed by `upsertProfile`, both already shipped. Don't feed the calculation. Zero reason to add to onboarding — would only add screens for data that already has a low-friction post-signup path. |
| `sex` — third option | stats | **Not resolved by this ticket, flagged** | — | Current picker is a hard binary and `tdee_engine.ts`'s BMR formula uses sex-specific *coefficients* (`+5` male / `−161` female), not just a label — adding a third option is an engine change, not an IA change. Flagging for a future ticket; T2 does not attempt to fix this. |

**Nothing is cut.** Every field currently asked earns its place once you check what the engine
actually consumes — the only genuine waste found was the `dietaryPreference` required-gate,
which is a friction bug, not a wrong question.

**Merge considered and rejected:** merging `work` + `lifestyle` into one screen (both are NEAT
inputs, both are quick taps) was considered and rejected — see "Deliberate exceptions" below for
the full reasoning; short version: they're two distinct real-world questions ("what's your job
like" vs. "how do you move outside work/gym") and stacking three fields (occupation + hours +
lifestyle) on one screen crosses from "one coherent concept" into "a small form," which is
exactly what R1 said to avoid unless the cluster is truly one concept.

---

## Ordering, and why goal moves before stats

**Proposed order:** name → **goal** → **stats** → work → lifestyle → training → diet → style →
plan. (Only goal and stats swap: positions 2 and 3. Everything after is unchanged.)

**Rationale:**
- R1's cited reference models (Cal AI: quiz-driven investment *before* the effortful/paywall
  moment; Noom: rationale-before-sensitive-asks) both put a motivational, low-effort choice
  ahead of the heaviest data-entry screen — not after it. Right now goal comes *after* stats,
  meaning the very first thing a user does past their name is fill in 4 numeric/categorical
  fields with zero context for why. Goal-first gives every subsequent step ("what's your job
  like", "how do you train") an implicit frame ("...so I can hit your goal") instead of feeling
  like an unmotivated intake form.
- Stats becomes the third step instead of the second — still early, still gets the heaviest
  multi-field screen out of the way while momentum from two quick single-tap wins (name, goal)
  is fresh, but no longer the very first thing after the name.
- **Alternative considered and rejected:** keep stats first (status quo) on the theory that
  getting the "hard part" out of the way immediately, before attention drops, is safer than
  reordering a shipped flow. Rejected because it front-loads the single highest-effort screen
  with the least earned momentum and no stated reason ("why do you need my body fat %?" reads
  colder before a goal has been named than after). The reorder is cheap to implement (state
  machine change only, no new fields) and cheap to revert if grilling disagrees.
- Training stays positioned after work/lifestyle (not moved to be adjacent to goal, despite also
  being effort-related) because it shares the same underlying "how do you move" narrative thread
  as work/lifestyle — breaking that thread to move it elsewhere would cost more coherence than
  it buys.
- Diet and style stay last, before the reveal, because they're now both single-tap-with-default
  steps (after diet's required-gate is dropped) — the flow tapers to its lightest questions
  right before the payoff screen, which is the "almost done" beat R1's hybrid models rely on.

This is a **headline call flagged for grilling** — see closing section.

---

## Step grouping — hybrid model, and the three deliberate exceptions to "one question per step"

R1's ratified model: **one focused question per step**, not a chat log, not clusters "unless
truly quick." Applying that literally to every current field:

**Steps that need no exception (single question, single screen, matches R1 exactly):**
name, goal (+ conditional goalWeightKg follow-up, same screen — a pick with an optional
elaboration field, same shape as diet's pick+free-text, not a second question), lifestyle, diet
(pick + optional free text, one coherent "what to avoid/prefer" concept), style.

**Exception 1 — Stats screen** (`age`, `weightKg`, `heightCm`, `sex`, optional `bodyFat`):
kept as one cluster. These four required fields are *jointly* necessary before any plan math
can run at all — there's no meaningful order to ask them in, no single one of them means
anything on its own, and users mentally reach for "my stats" as one unit, not four sequential
facts revealed one at a time. Splitting into four steps would be four extra "Next" taps for data
that changes nothing about how the user thinks about it. This is R1's own carve-out
("truly quick") in its clearest form.

**Exception 2 — Work screen** (`occupationType` + `workHoursPerDay`): kept as one cluster.
One real-world question — "what's your workday like" — expressed as a single tap (job type)
plus one number that's pre-filled and rarely needs touching. Splitting these would make
"how many hours do you work" a orphaned non-sequitur immediately after the user just answered
what kind of job they have.

**Exception 3 — Training builder** (`weeklyWorkouts[]`, repeatable rows of
type/duration/sessions): kept as its own dedicated screen with a variable-length list editor,
not decomposed into sequential per-workout questions. This isn't really a "cluster of
questions" in the same sense as the other two — it's a single concept ("how do you train in a
normal week") whose answer happens to be a list. Forcing it into "one question per step" would
mean a branching sub-flow (type → duration → frequency → "add another?" loop) that is
objectively worse UX than one add/remove table, and R1's own pitfall list warns against exactly
that kind of proliferating micro-step tedium.

**Merge rejected — work + lifestyle:** both feed NEAT and both are fast, so merging them into
one screen was the most tempting "cluster" call in the whole set. Rejected because they're two
distinct real-world framings ("your job" vs. "you outside work and workouts") and combining them
would put three fields (occupation, hours, lifestyle-tap) on one screen — that crosses from "one
concept, several facets" (the bar the three approved exceptions clear) into "a small form,"
which is the thing R1 is explicitly guarding against. The two screens back-to-back already read
as a natural pair without needing to be physically merged.

---

## Plan reveal: what to show, how much transparency

Current architecture (`OnboardingPage.tsx` plan phase + `MacroDonut.tsx`): a three-tier reveal —
(1) always-visible donut + total kcal, (2) always-visible macro grams + percentages row, (3)
collapsed `<details>` "About this calculation" with the full 7-line engineering breakdown (BMR,
NEAT-job, NEAT-lifestyle, workouts avg/day, TEF, TDEE/maintenance, goal adjustment).

**Decision: keep this architecture as-is, structurally.** It already matches R1's cited
Noom/Cal-AI "checkpoint payoff" pattern and the general trust-building logic of a math-driven
promise: show the number confidently, but make the receipts one tap away for anyone who wants
them. Rebuilding this would be solving a problem that doesn't exist.

**Two content additions, no structural change:**
1. **One narrative sentence above the numeric breakdown**, inside the same `<details>` block —
   e.g. "We start with your resting burn, add what your job and daily movement cost, add your
   training, then adjust for your goal." Currently the breakdown is a bare number table with no
   framing sentence at all; this is the one place the current implementation under-serves R1's
   "rationale alongside the numbers" pattern (it has the numbers, not the rationale). This is a
   copy addition, not a data change — flagged for whoever owns persona voice (map's "Stry
   persona voice" open item), not resolved here.
2. **A goal-weight stat, shown only when `goalWeightKg` is set** (the new optional field from
   this proposal) — e.g. "12 kg to your goal weight" as a small stat alongside the calorie/macro
   row. Cheap, and gives the one new question we're adding a visible payoff on the very next
   screen instead of disappearing into the profile silently.

**Explicitly not adding:** a fourth "deep" tier (full formulas, citations, methodology essay).
That's appropriate for a Help/FAQ article, not a first-run reveal screen — more transparency
here has diminishing and eventually negative returns on a screen whose job is to build
confidence, not teach nutrition science.

---

## Where AI free-text parsing (`api.ai.parseOnboarding`) fits

**General rule** (not per-step ad hoc): offer free-text parsing on any step where a single
sentence plausibly captures more nuance, faster, than tapping through discrete controls —
withhold it where the tap surface already has zero nuance headroom.

| Step | Free text today? | Verdict | Why |
|---|---|---|---|
| name | Yes (`field="name"`) | Keep, low value | Input is already a text field; parsing just trims a spoken-style sentence to a first name. Harmless, not a priority. |
| goal | Yes (`field="goal"`) | Keep; **recommend extending schema** to also extract an implied target weight ("get down to 70kg") into `goalWeightKg` | One sentence can carry both goal and target weight — let the parser capture both rather than making the user re-state weight in a separate tap. **Backend touch**: prompt/schema string edit in `convex/ai.ts`, not a schema.ts change. |
| stats | Yes (`field="stats"`) | Keep as-is | Already handles the highest-nuance case (units conversion, multiple facts in one sentence) — this is the parser's best use case. |
| work | Yes (`field="work"`) | Keep as-is | Good use case: "office job, 9 hours" is faster than two taps. |
| lifestyle | Yes, but **reuses `field="work"`'s schema** | **Recommend** splitting into its own `lifestyle` schema key in `convex/ai.ts` | Currently works only because the `work` schema's output happens to include `lifestyleActivity` — functionally fine today, but the shared key is a latent trap for the next person who edits either schema without realizing the other step depends on it. **Backend touch**, code-only, no schema.ts change. |
| training | Yes (`field="training"`) | Keep as-is | Best use case alongside stats — "lift 4x/week ~1h, run twice 30min" beats a five-tap builder session. |
| diet | Yes (`field="diet"`) | Keep as-is | "Vegetarian, allergic to peanuts" in one sentence beats a pick plus a separate text field. |
| style (coachingStyle) | No | **Correctly absent, no change** | Three discrete tones with an always-valid default leave no nuance a sentence could add that a tap doesn't already capture — adding a parser here would be effort spent on a step that has no headroom to benefit from it. |

---

## Backend/Convex impact — flagged list (out of scope to build, per map)

**Schema (`schema.ts`) changes required: none.** Every field this proposal touches
(`goalWeightKg`, `dietaryPreference`, `allergies`) already exists in `user_profiles` and is
already accepted by the mutation the onboarding flow calls (`upsertPlanFromOnboarding`).

Smaller flagged code touches (none require a DB migration):

1. **Wire `goalWeightKg` through the onboarding UI** — frontend-only change in
   `OnboardingPage.tsx`: add the field to `State`, render it conditionally on the goal screen,
   pass it to `upsertPlanFromOnboarding` (already accepts `goalWeightKg`). No backend change at
   all.
2. *(Optional)* Extend the `goal` schema string in `convex/ai.ts`'s `parseOnboarding` to also
   emit `goalWeightKg` from free text. Prompt/code edit inside an existing action; no
   `schema.ts` change.
3. *(Optional)* Add a dedicated `lifestyle` schema key in `convex/ai.ts`'s `parseOnboarding`
   (currently the lifestyle step's free text reuses the `work` key). Prompt/code edit only; no
   `schema.ts` change.
4. *(Optional, only if the team wants diet made editable post-onboarding too, matching
   dislikedFoods/cuisines/etc.)* Add `dietaryPreference` + `allergies` inputs to
   `ProfileDetailsCard` in `ProfilePage.tsx`. `api.profile.upsertProfile` **already accepts both
   fields** — this is a pure web-UI addition, zero backend work. Not required by this proposal
   (diet stays in onboarding as optional), noted only as a natural companion if diet ever needs
   post-signup editing too.
5. **Not proposed, flagged for a future ticket, not this one:** `sex` as a hard binary is baked
   into `tdee_engine.ts`'s BMR coefficients, not just the picker UI. Adding a third option is an
   engine change (new coefficient branch), separate from this IA ticket.

---

## Summary table — final step sequence

| # | Step | Fields | Required | Cluster? | Free text |
|---|---|---|---|---|---|
| 1 | name | firstName | Required | No | Yes (low value) |
| 2 | goal | goal, goalWeightKg (conditional) | goal required, goalWeightKg optional | No (pick + elaboration, not a cluster) | Yes (recommend extending) |
| 3 | stats | age, weightKg, heightCm, sex, bodyFat | age/weight/height/sex required, bodyFat optional | **Yes — Exception 1** | Yes |
| 4 | work | occupationType, workHoursPerDay | Required (hours defaulted) | **Yes — Exception 2** | Yes |
| 5 | lifestyle | lifestyleActivity | Required | No | Yes (recommend own schema key) |
| 6 | training | weeklyWorkouts[] | Optional (explicit skip) | **Yes — Exception 3 (list builder, not multi-question)** | Yes |
| 7 | diet | dietaryPreference, allergies | Optional (both — dietaryPreference demoted) | No | Yes |
| 8 | style | coachingStyle | Required-with-default | No | No (correctly absent) |
| 9 | plan reveal | — | — | — | — |

---

## For the grilling session — flagged as contestable, ranked

1. **Most contestable: reordering goal ahead of stats.** This is the widest-blast-radius change
   in the whole proposal — it touches the `PHASES` array, the `PREVIOUS_PHASE` back-map, and
   every step's persona copy that assumes what's already been established. The justification
   (Cal-AI/Noom precedent: motivational anchor before the effortful screen) is persuasive but is
   ultimately a judgment call about user psychology, not something proven by the codebase the
   way the diet-friction finding is. A reasonable counter-argument: stats-first is shipped,
   tested-enough, and "get the hard part out of the way first" is also a legitimate, commonly-
   cited pattern — reasonable people could land either way. Push on this one hardest.
2. **Second: demoting `dietaryPreference` from required-tap to optional.** Well-evidenced (the
   engine never reads it) but changes existing product behavior — worth confirming the team
   isn't relying on the required-tap as a soft data-capture nudge for reasons outside the
   calculation (e.g., a future personalization roadmap item that isn't visible in the code I
   read).
3. **Third: treating the training builder as a legitimate structural exception** rather than
   trying to force it into sequential single-question steps. I think this is the most clearly
   correct of the three "exceptions," but it's worth explicitly confirming R1's author agrees a
   list-builder is a different UI primitive than the "question" R1 was scoping, not a loophole.
4. Minor: whether the `goalWeightKg` narrative payoff on the reveal screen ("N kg to go") edges
   into T4/persona-voice copy territory that this ticket shouldn't be prescribing. Flagged as a
   content suggestion, not a locked decision — easy to strip if it's judged out of T2's lane.

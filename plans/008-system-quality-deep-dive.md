# Stride System Quality and Product Deep Dive

**Audit date:** 2026-10-02 (handoff written 2026-10-03)  
**Branch at audit:** `fix/chat-logging-reliability`  
**Audit thread:** `e70ca97e-b8cd-4dde-89f2-27c9155b7587`  
**Mode:** Read-only code review and competitor research. No application code changed as part of this audit.  
**Status:** Deep dive captured for continuation. Findings below were traced through source; they were not validated against a deployed app.

## How to resume

Start with this document, then reopen the audit thread above for the full discussion and agent handoffs. The audit used delegated reviews from Sol 6.1 across logging correctness, security/privacy, mobile usability, and performance/maintainability. Luna 6 researched competitors and independently checked major risks. One Luna follow-up hit a 429 usage limit; Sol 6.1 completed that remaining check. Keep the project scope read-only until implementation is requested.

The working tree already contained unrelated user changes during the audit. Do not reset, stage, or tidy them. At the time this handoff was created, `git status --short` showed modifications in mobile/web chat logging, backend action handling, shared chat types and package metadata, plus untracked `.scratch/`, `plans/006-chat-logging-reliability-findings.md`, `reports/`, `scripts/`, and `t3.json`. Preserve all of them.

## Executive summary

Stride's most important gap is trust in everyday logging, not a shortage of AI features. The audit found source-level paths where edits may be ignored, a repeated meal may reuse the wrong amount, a rejected food memory may influence later nutrition, intentional repeated logs may collapse, and batch undo may leave data behind. Privacy and authorization issues also need attention before broader use.

Recommended product direction: **an Android-first nutrition and strength tracker that understands meals and portions in Indian households, makes corrections easy, and explains where nutrition numbers came from.** Build dependable daily logging first; add more capture modes and coaching only after corrections, retries, and saved totals are trustworthy.

## What already works and what is unfinished

Useful pieces exist and should be preserved: centralized logging functions; submission tracking; confirmation, duplicate handling, undo, and persistent result cards; tests for concurrency, retries, stale requests, and partial failures; web authentication/onboarding, voice transcription, photo input, history editing, and repeat logging; mobile reads for nutrition, workouts, history, and progress; mobile text chat confirmation and undo; and ownership checks in many server functions.

Mobile still has substantial first-use gaps:

| Area | Audited state |
|---|---|
| Fresh mobile sign-in | Providers exist, but a usable sign-in journey and route guard are missing |
| Text logging | Implemented |
| Voice, photo, barcode | Not connected to a usable mobile composer |
| Settings and account | Several controls/values are placeholders |
| Meal/history corrections | Mostly display-only outside chat |
| Workout detail | Reads outdated field names |
| Weight trend/adaptive expenditure | Planned experience not implemented in audited screens |
| Detailed strength progression | Planned, not implemented in audited screens |

Plan 007 understates existing backend separation: records already live outside chat messages. Preserve the guarantees in the existing pipeline when replacing it.

## Findings: correctness and logging

### P0/P1: Confirmation can ignore meal edits

The confirmation card passes edited values, but the final save path rebuilds the meal from the original nutrition draft. Example: draft says 400 calories, user changes it to 260, confirmation receives 260, but the writer can save the original 400. Date edits survive because they are copied explicitly; name and macro edits do not receive equivalent treatment. The existing test does not model the nested draft shape used by the real pipeline.

**Suggested fix:** Keep one authoritative meal representation and apply edits to it before saving. If the user changes totals, invalidate ingredient details that no longer agree.

Evidence: `packages/backend/convex/ai.ts:948`, `packages/backend/convex/meals.ts:73`, `packages/backend/convex/nutrition_draft.ts:359`.

### P1: Rejected or removed food memories may still affect nutrition

Some food-memory readers filter removed entries, but the nutrition-matching path does not apply the same eligibility rule. A matching memory with at least two uses can remain eligible after rejection, deletion, or undo. User consequence: telling Stride a remembered item is wrong may not stop it being reused.

**Suggested fix:** Apply one eligibility rule before every use. Removed, rejected, undone, or unapproved memories must not affect a new entry.

Evidence: `packages/backend/convex/food_memory.ts:41`, `packages/backend/convex/nutrition_draft.ts:469`.

### P1: Remembered meal quantities can match while differing

Matching removes single-character tokens, so “2 eggs” and “4 eggs” can both normalize to “eggs”. A memory shortcut can then reuse whole-meal nutrition without scaling. This is conditional on the description reaching the matcher in that form, not a claim that every model response triggers it.

**Suggested fix:** Store a defined portion with every remembered meal. Reuse only when the portion matches, scale explicit quantities, or resolve ingredients normally.

Evidence: `packages/backend/convex/food_memory_match.ts:19`, `packages/backend/convex/nutrition_draft.ts:474`, `packages/backend/convex/ai.ts:3197`.

### P1: Intentional repeat logs can collapse into one entry

Two distinct submissions with matching content, source, date, and time bucket may resolve to the same meal/workout row. The second action can report “committed” although daily totals contain only the first entry; the second action does not own a row and its undo cannot reverse one. “Log anyway” does not bypass the earlier content-key lookup. Some workout routes avoid this with explicit tokens; the current chat workout route does not supply them.

**Suggested fix:** Distinguish a retry of the same request from a new intentional log. Same request saves once; a distinct request saves separately or asks whether it is intentional.

Evidence: `packages/backend/convex/meals.ts:83`, `packages/backend/convex/workouts.ts:122`, `packages/backend/convex/actions_writer.ts:235`.

### P1: Batch undo can leave an earlier value active

If one action records 5,000 steps and a later action in the same group replaces it with 8,000, undo processes the first before the second. The first is skipped because the second owns the row; undoing the second restores 5,000. “Undo all” therefore leaves the earlier value behind.

**Suggested fix:** Reverse dependent writes in reverse save order while protecting unrelated later edits.

Evidence: `packages/backend/convex/actions_undo.ts:365`, `packages/backend/convex/wellness.ts:117`.

### Other correctness issues

| Issue | User impact | Suggested direction |
|---|---|---|
| Mobile sends local date; confirmation defaults missing timezone to UTC | A valid early-morning Pune log can be rejected as future-dated | Capture timezone on mobile and use one date resolver |
| Workout storage has `load`/`loadUnit`, clients read `weight`/older fields | Saved lifting weight appears blank | Share one workout-set definition across backend and clients |
| Mobile recipe action omits required time and shows success before result | “Logged” may appear although save failed | Await save, provide valid date/time, show retryable failure |
| Web composer clears text/photo before request finishes | Early failure forces retyping/reselecting | Keep draft until save is acknowledged |
| “Log again” may reuse ingredient detail invalidated by an edit | Repeated meal can restore old macros | Copy current authoritative values and respect invalidation |

Evidence: timezone `packages/backend/convex/ai.ts:1151`, `apps/mobile/components/ChatPanel.tsx:151`; workout fields `packages/backend/convex/workout_draft.ts:240`, `apps/web/src/pages/WorkoutsPage.tsx:85`, `apps/mobile/app/(tabs)/workouts.tsx:36`; recipe save `apps/mobile/app/(tabs)/nutrition.tsx:499`, `packages/backend/convex/time_resolve.ts:147`; draft clearing `apps/web/src/components/home/AssistantConsole.tsx:305`, `apps/web/src/pages/CoachPage.tsx:400`; repeat after edit `packages/backend/convex/meals.ts:347`.

## Findings: security, privacy, and AI safety

### Export includes a saved API key

`exportAllData` returns full settings rows including the saved OpenRouter key; web serializes them into downloaded JSON. This is not a cross-user leak: an authenticated user gets their own data. It does put a spendable credential in an ordinary export.

**Suggested fix:** Build export from an explicit allowlist of safe fields and handle any previously stored keys if user-supplied keys are removed.

Evidence: `packages/backend/convex/users.ts:116`, `apps/web/src/pages/ProfilePage.tsx:783`.

### “Clear all data” currently fails and has incomplete coverage

Cleanup requests a `nudges` index not present in the schema. The uncaught error rolls back deletion. Even after repairing that query, cleanup omits action groups, actions, and other user-linked records; action rows can contain original input and extracted health information. Current impact is deletion failure, not partial deletion that successfully leaves a few rows.

**Suggested fix:** Repair the invalid query, define full deletion coverage, and distinguish account deletion, log clearing, and non-personal billing totals. Do not delete shared counters as though they belong to one user.

Evidence: `packages/backend/convex/users.ts:48`, `packages/backend/convex/schema.ts:438`, `packages/backend/convex/schema.ts:521`.

### Chat error handling can disrupt another user's pending group

Normal ownership checks reject another user's clarification group, but an error cleanup path writes against the supplied group without rechecking ownership. Conditions: signed-in caller knows the victim's group ID and omits an optional submission ID. Pending actions may be marked failed. The audit did not establish private-record reads or rewrites of committed meals; the owner can retry.

**Suggested fix:** Check ownership before processing and before failure cleanup. Authorization failures should not write to the rejected target.

Evidence: `packages/backend/convex/ai.ts:571`, `packages/backend/convex/ai.ts:2282`, `packages/backend/convex/chat.ts:517`.

### Model confidence can override a server warning

Nutrition construction lowers confidence when it clamps out-of-range values, but later chat logic may prefer model-supplied confidence and omit warning flags. This can avoid review even when the server detected a problem.

**Suggested fix:** Server warnings force confirmation. Model confidence may make the system more cautious, never less.

Evidence: `packages/backend/convex/nutrition_draft.ts:349`, `packages/backend/convex/ai.ts:3393`.

### Smaller safety/abuse gaps

- Homepage advice omits saved allergies from model context, while Coach includes them. Share one advice-context builder. (`packages/backend/convex/ai.ts:4412`.)
- Truncated AI responses can fail before usage is recorded and a reservation is released. Track provider cost even when content is unusable. (`packages/backend/convex/ai/llm.ts:135`.)
- Food lookups lack equivalent server throttling; repeated uncached searches/invalid barcodes can consume shared provider allowance. Add modest per-user limits and short-lived negative-result caching. (`packages/backend/convex/foods.ts:283`.)
- Some numeric settings accept non-finite values such as `NaN` or infinity. Validate finite values at save boundaries. (`packages/backend/convex/goals.ts:40`.)
- Define supported health use cases before public release; adult weight-loss defaults should not silently become advice for minors or unsupported groups.

## Findings: performance and maintainability

No timings, provider costs, or bundle sizes were measured. These are source-level growth patterns.

- **Chat loads all messages to keep the latest 40.** It also loads history again to count it. Fetch newest 40 directly; page older history; use an existence check where only “first message?” matters. Evidence: `packages/backend/convex/chat.ts:141`, `:157`.
- **New log writes can recalculate gamification from lifetime history.** Since plan 007 removes gamification, remove the dependency when retiring that feature rather than optimizing code scheduled for deletion. Evidence: `packages/backend/convex/derived_state.ts:30`, `packages/backend/convex/gamification.ts:56`.
- **Calendar queries read beyond the requested month.** The database bounds the start date and filters the end date after collection. Put both bounds in the indexed query and validate requested range length. Evidence: `packages/backend/convex/history.ts:21`, `packages/backend/convex/progress.ts:28`.
- **A logging turn does several sequential AI calls:** reply, extraction, per-item parsing, food resolution, and sometimes title generation, with independent retries and no overall deadline. Extract once, resolve known data in code, parallelize independent lookups with limits, apply one request deadline, and do not delay logging for titles. Evidence: `packages/backend/convex/ai.ts:2162`, `:3185`, `packages/backend/convex/ai/llm.ts:59`.
- **Web mounts hidden interfaces and eagerly loads routes.** Hidden components still run hooks; duplicated server requests are not proven because subscriptions may be shared. Mount the appropriate layout and load heavy routes when needed. Lower priority than logging and mobile onboarding. Evidence: `apps/web/src/App.tsx:207`, `:15`.

## Competitor research and product direction

Research reviewed official documentation/policies on 2026-10-02. It shows documented capabilities, not independently measured quality.

| Product | Documented strength | Lesson for Stride |
|---|---|---|
| MacroFactor | Multi-item logging, reusable foods/meals, intake-and-weight-based expenditure estimates | Make repeats cheap; explain when enough data supports target changes |
| Cronometer | Nutrition-source documentation, reviewed food submissions, editable meals, export | Show data source and make correction easy |
| MyFitnessPal | Voice logging with review, serving edits, saved meals, food-error reporting | Voice alone is not a differentiator; correction and reuse matter |
| HealthifyMe | Photo meal capture and coaching marketed to Indian users | Relevant local comparison; reviewed sources did not establish database accuracy/methodology |
| Hevy | Reusable routines, exercise library, portable workout history | Strength logging needs fast set entry, reusable structure, export |

Sources: [MacroFactor food logging](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor), [expenditure interpretation](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure); [Cronometer data sources](https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources), [custom meals](https://support.cronometer.com/hc/en-us/articles/17687459173908-Create-Custom-Meal); [MyFitnessPal voice logging](https://support.myfitnesspal.com/hc/en-us/articles/30332897072269-How-to-log-food-with-your-voice), [saved meals](https://support.myfitnesspal.com/hc/en-us/articles/360032625331-Create-find-and-log-your-saved-meals); [HealthifyMe product](https://www.healthifyme.com/in/index.html), [privacy terms](https://www.healthifyme.com/terms-of-use/); [Hevy exercise library](https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises), [data export](https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Your-Data-from-Hevy).

**Position on reliability and personal household portions, not number of AI modes or database size.** A useful feature could remember “my katori of dal” as a food-specific, editable portion. Vessel volume alone does not determine weight for every food.

## Quality-of-life opportunities

1. Remember household portions (katori, roti, glass, ladle) with food-specific conversions and correct scaling.
2. Preserve durable drafts and attachments through dismissal, network loss, and uncertain save outcomes. Show “saved on device / sending / saved to account / failed, retry”. A full offline database can wait.
3. Correct a meal from Today or History: food, portion, date, meal slot, delete/undo. Do not require finding the original conversation.
4. Add “usual breakfast”, “same lunch as yesterday”, and recent-food shortcuts before rebuilding a full recipe product.
5. Explain nutrition provenance in plain language (“household recipe”, “portion estimated from photo”, “review grams”). Do not present a text-match score as nutritional certainty.
6. Give strength users exercise, prior-session load/reps, current sets, add/edit set, and a basic rest timer. Add estimated one-rep maximum and weekly volume later. Fix the existing field mismatch first.
7. Explain calorie-target changes with trend window, weigh-in count, logging completeness, reasons for change/pause. TDEE means total daily energy expenditure; it is an estimate, not measured metabolism.
8. Make controls truthful and accessible: remove fake settings, connect real identity/sign-out, fix New Chat reset, label icon buttons, use real switch semantics, keyboard-enable attachments, distinguish unknown from zero. Examples: `apps/mobile/app/stry.tsx:191`, `apps/mobile/app/settings.tsx:62`, `apps/web/src/components/ui-kit/InputBar.tsx:143`.

## Restart plan cautions

Plan 007 has useful direction (Android first, database-backed nutrition, explicit portions, editable records, one timezone resolver, fewer distractions), but the audit recommends:

- Replace one working flow end-to-end before deleting APIs that existing clients still call; switch clients, then retire old code. Evidence: `plans/007-restart.md:106`, `:108`, `:115`.
- Preserve acceptance guarantees for retries, concurrent writes, partial results, and undo, even if implementation changes.
- Define revision semantics: which revision counts in totals, what deletion does, what undo does after later edits, how batch undo handles dependencies, and whether food database corrections alter historical meals.
- Include sign-in, failed-save recovery, draft preservation, and accessible controls in every usable slice, not a final polish phase.
- Start with a small legally usable food dataset and validate the end-to-end journey before bulk imports or ambitious matching.
- Avoid framework upgrades as prerequisites unless current versions block necessary behavior.

## Research implications

### Food-data licensing

USDA FoodData Central documents public-domain/CC0 data. IFCT 2017 allows some personal reproduction and encourages dissemination, but its publication text restricts electronic reproduction for creating a product without permission; “personal use only” is not a sufficient plan. Open Food Facts carries attribution/share-alike obligations. Combining sources requires understanding the combined obligations; separate tables alone do not settle licensing.

Sources: [USDA API guide](https://fdc.nal.usda.gov/api-guide/), [official IFCT 2017 PDF](https://www.nin.res.in/ebooks/IFCT2017.pdf), [Open Food Facts API conditions](https://support.openfoodfacts.org/help/en-gb/12-donnees-api/94-y-a-t-il-des-conditions-pour-utiliser-l-api).

### Adaptive calorie expenditure

Intake-versus-weight-change output is an estimate. Short-term weight shifts include water, glycogen, and food still being digested; incomplete intake logs distort it. Keep manual targets available, pause updates when evidence is weak, and label output as a trend-based estimate.

Sources: [NIDDK Body Weight Planner research](https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner), [MacroFactor partial logging](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging).

### AI data recipients

“Uses OpenRouter” does not fully explain where health data goes; requests may reach model providers with different retention policies. Document what leaves the device, minimize health context, and verify provider settings before promising zero retention. Apply the same scrutiny to voice processing.

Sources: [OpenRouter privacy](https://openrouter.ai/privacy), [Groq data handling](https://console.groq.com/docs/your-data), [Google Play health-app policy](https://support.google.com/googleplay/android-developer/answer/18258653?hl=en).

## Recommended order of work (proposal, not authorization)

| Priority | Outcome | Completion condition |
|---|---|---|
| 1 | Repair logging trust failures on retained paths | Edits stick; intentional repeats work; removed memories stay removed; undo restores expected state |
| 2 | Repair privacy and permissions | Exports omit keys; deletion succeeds with defined scope; cross-user failures cannot write |
| 3 | Make Android usable from fresh install | Sign-in, onboarding, timezone, real settings, truthful save/error states |
| 4 | Complete reliable manual/text nutrition flow | Select food, resolve portion, save, edit, history, repeat, undo |
| 5 | Add durable drafts and household shortcuts | Interrupted logs survive; common meals need little re-entry |
| 6 | Add voice, barcode, photo one at a time | Each capture mode has correction and failure paths |
| 7 | Add weight feedback and strength workflow | Targets explain evidence; sets compare with previous session |
| 8 | Retire old APIs and improve desktop analysis | No active client depends on removed behavior |

## Suggested behavior-level acceptance checks

- Confirm a real AI draft after changing calories and name.
- Log identical food twice intentionally, then retry one request: two intentional entries, one retry result.
- Reject a food memory and ensure it never supplies later nutrition.
- Double a remembered portion and verify the quantity/nutrients scale as intended.
- Submit and confirm across Pune midnight.
- Undo two same-day recovery updates in one group.
- Simulate network failure before and after server save; retain draft and avoid duplicate save.
- Export with a sentinel API key and ensure it is absent.
- Clear one user's data without affecting another user's records.
- Display saved workout load on both clients.
- Attempt cross-user action and verify no cleanup writes occur.

Measure baseline before making speed claims: repeat-meal completion time, correction time, successful saves, duplicate mistakes, unresolved portions, and AI cost per successful log.

## Limits and next step

The audit did not run tests, builds, device checks, timing/cost measurements, deployed behavior checks, live exploit tests, provider-retention verification, or clinical-suitability review. The codebase observations reflect the worktree at the time and need revalidation before implementation. One Luna follow-up hit a 429 and was completed by Sol 6.1. No application code or plans were modified during the audit itself.

Recommended first implementation scope, once requested: logging integrity and privacy repairs, followed by the fresh-install Android account-to-first-log journey. The product quality bar is one ordinary day working end to end: breakfast, corrected lunch portion, repeated dinner, workout, correction, then accurate totals the next day—without missing entries, false success, or unexplained numbers.

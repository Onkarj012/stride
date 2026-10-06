# Chat logging reliability findings

Status: OPEN

Branch: `fix/chat-logging-reliability`
HEAD: `8406bd0 fix(chat): fence claimed logging takeovers`
Branch delta: 29 commits ahead of `main`
Review date: 2026-08-28

## Scope

Reviewed committed reliability work in `git diff main...HEAD` plus current uncommitted changes.

Focus:

- Convex claim leases and takeover fencing
- Action-group/member idempotency
- Canonical persisted assistant outcomes
- Confirmation, clarification, duplicate recovery, and undo
- Domain-row ownership and stale state
- Web/mobile behavior parity
- Runtime card validation
- Tests and missing coverage

Review used Codex Luna. Findings below were independently checked against current source and tests. No code was changed during review.

## Merge status

Not merge-ready. Six P1 findings can affect saved data, model context, or duplicate prevention. Five P2/P3 findings affect truthful UI state and reconciliation.

## Findings

### P1. Distinct actions can claim one canonical row

Files:

- `packages/backend/convex/meals.ts:90`
- `packages/backend/convex/workouts.ts:134`
- `packages/backend/convex/actions_writer.ts:229`
- `packages/backend/convex/actions_writer.ts:251`
- `packages/backend/convex/ai.ts:3995`

Meal/workout domain writers return an existing active row when domain idempotency matches. They do not check whether that row's `sourceActionId` belongs to current action member. A different action can then commit against row owned by older action.

Result:

- Action reports success against another action's row.
- Reconciliation treats action metadata as committed.
- Logged-item hydration rejects row because ownership does not match.
- Persisted cards and API response can disagree.

Fix direction: when idempotency finds existing row, expose ownership. Return existing row only when it is owned by same action, or mark current action as duplicate/rejected without committing it against that row.

### P1. Takeover can leave stale or conflicting members

Files:

- `packages/backend/convex/ai.ts:439`
- `packages/backend/convex/ai.ts:3654`
- `packages/backend/convex/actions_writer.ts:144`
- `packages/backend/convex/chat_concurrency.test.ts:375`

`stageClarificationGroup` returns early when group already has members. A lease takeover with fewer extracted candidates leaves old members pending. A changed action type at same ordinal does not match the writer's type-plus-ordinal fallback and can create another member.

Result: one submission can retain stale pending actions or contain conflicting action members after takeover.

Fix direction: execute persisted canonical members only, or reject extraction divergence. Add tests for changed count and changed action type, not only changed payload.

### P1. Current user message can enter model context twice

Files:

- `packages/backend/convex/chat.ts:141`
- `packages/backend/convex/ai.ts:1927`
- `packages/backend/convex/ai.ts:2013`
- `packages/backend/convex/ai.ts:2141`
- `packages/backend/convex/ai.ts:2940`
- `packages/backend/convex/ai.ts:4304`

Claiming a submission persists its user message before history is read. Coach history then includes current message and code appends current message again. Homepage removes the last history entry with `slice(0, -1)` instead of removing the exact claimed message.

With overlapping submissions, homepage can remove another request's message and still append current message.

Fix direction: remove exact current message by message ID or `clientSubmissionId`. Pass persisted message identity through context-history helpers. Stop relying on list position.

### P1. Home Enter key allows overlapping submissions

Files:

- `apps/web/src/components/home/AssistantConsole.tsx:291`
- `apps/web/src/components/home/AssistantConsole.tsx:407`
- `apps/web/src/components/ui-kit/InputBar.tsx:171`
- `apps/web/src/components/ui-kit/InputBar.tsx:205`
- `apps/web/src/lib/submissionId.ts:16`

Send button disables while `busy`, but textarea Enter calls `onSubmit` without checking busy. Two requests can run at once. `useSubmissionId` stores one mutable `{ key, id }`; concurrent calls can replace each other's ID, and one completion can clear the other retry identity.

Result: retry can receive a new submission ID and bypass backend deduplication.

Fix direction: block Enter while request is in flight, or track submission IDs per request. Prefer blocking overlapping Home sends unless product needs concurrency.

### P1. Reconciliation trusts committed action metadata

Files:

- `packages/backend/convex/chat.ts:350`
- `packages/backend/convex/ai.ts:3995`

`reconcileCards` creates committed result items from action status and `committedRowRef` alone. It does not verify row existence, active state, user ownership, or matching `sourceActionId`.

Result: persisted result cards can claim saved rows that were deleted, undone, replaced, or owned by another action. `getActiveCanonicalLoggedItems` applies stricter checks, so persisted cards and returned logged-item data can diverge.

Fix direction: reconcile committed items through one ownership-aware canonical-row lookup. Treat missing, inactive, or mismatched rows as unresolved/skipped rather than committed.

### P1. Manual edits do not invalidate chat Undo ownership

Files:

- `packages/backend/convex/meals.ts:223`
- `packages/backend/convex/workouts.ts:312`
- `packages/backend/convex/actions_undo.ts:257`

Manual meal/workout updates preserve original `sourceActionId`. Undo checks that field, so old chat Undo can tombstone a row after user edits. Upsert undo can replace newer edits with an old snapshot.

Fix direction: add row revision or change ownership/version on manual edits. Undo must compare revision, not only `sourceActionId`.

### P2. Direct deletion does not reconcile original assistant turn

Files:

- `packages/backend/convex/actions_undo.ts:195`
- `packages/backend/convex/meals.ts:315`
- `packages/backend/convex/workouts.ts:350`
- `packages/backend/convex/wellness.ts:269`
- `packages/backend/convex/wellness.ts:321`
- `packages/backend/convex/wellness.ts:380`

Meal/workout/water deletion marks action-owned rows undone but does not reconcile their assistant message. Sleep and mood deletion hard-delete rows without action reconciliation.

Result: transcript can continue showing saved result and available Undo after row deletion. Action state can also remain committed after direct hard delete.

Fix direction: route all action-owned deletes through shared tombstone plus assistant reconciliation. For hard-delete-only legacy paths, resolve or remove the linked action before returning.

### P2. Clarification can link assistant turn from another session

Files:

- `packages/backend/convex/ai.ts:559`
- `packages/backend/convex/chat.ts:667`

`linkResolvedTurnMessage` checks user and assistant role but not matching session IDs. A clarification submitted in session B can link the resolved assistant turn from session A when both belong to same user.

Fix direction: require `resolved.sessionId === userMessage.sessionId` before linking, or require clarification group/session association and validate it at resolver boundary.

### P2. Clarification clients ignore canonical result

Files:

- `apps/web/src/components/chat/cards/useChatCardActions.ts:98`
- `apps/mobile/components/ChatPanel.tsx:196`
- `packages/backend/convex/ai.ts:529`

Backend clarification action returns canonical turn. Web ignores it and always shows `Saved`. Mobile ignores it and shows no success/failure notice. Neither applies returned turn through baseline override while subscription catches up.

Result: expired, failed, discarded, or no-action clarification can produce misleading feedback and stale cards.

Fix direction: return `turn` from both handlers, apply it through existing override path, and derive notice/toast from `turnOutcome` and returned result.

### P2. Web confirmation ignores canonical turn

Files:

- `apps/web/src/components/chat/cards/useChatCardActions.ts:13`
- `apps/web/src/components/chat/cards/useChatCardActions.ts:76`
- `apps/web/src/components/chat/cards/ChatTurnMessage.tsx:56`

Backend confirmation returns `turn`, but web result type omits it and handler returns nothing. `ChatTurnMessage` can apply temporary overrides only when card handlers return a canonical turn. Confirmation UI therefore waits for subscription and can remain stale or actionable briefly.

Fix direction: include `turn` in confirmation result type, return it from handler, and apply it through existing `ChatTurnMessage` wrapper.

### P2. Empty submission ID bypasses claims and deduplication

Files:

- `packages/backend/convex/ai.ts:1903`
- `packages/backend/convex/ai.ts:1922`
- `packages/backend/convex/ai.ts:4222`
- `packages/backend/convex/ai.ts:4257`
- `packages/backend/convex/chat.ts:205`

Public action validators accept `clientSubmissionId: ""`. Truthiness checks then route empty IDs through legacy unclaimed behavior. `addMessage` also skips duplicate lookup for empty IDs.

Result: repeated requests with empty ID can create duplicate chat turns and domain writes.

Fix direction: reject empty IDs at public boundary with a minimum length validator, or normalize empty to undefined only if legacy behavior is explicitly desired. For reliability paths, reject.

### P3. Empty result cards validate and render contradictory copy

Files:

- `packages/shared/src/chat-turn.ts:199`
- `packages/shared/src/chat-turn.ts:230`
- `apps/web/src/components/chat/cards/ChatTurnCards.tsx:95`
- `apps/mobile/components/ChatTurnCards.tsx:95`

Runtime validator accepts `result.data.items: []`. Web and mobile render `Nothing was logged` plus saved-detail copy when no result items exist.

Normal backend producers usually avoid this shape. Impact is malformed persisted/network data, legacy data, or future producer regression.

Fix direction: require at least one result item, or render explicit non-saving fallback when result is empty.

## Existing strengths

- Lease owner/version checks fence stale workers after successful takeover.
- Terminal outcomes persist on assistant messages, making retries deterministic.
- Confirmation, clarification, duplicate recovery, and Undo converge through canonical action state.
- `getActiveCanonicalLoggedItems` checks action status, row existence, active state, user ownership, and `sourceActionId`.
- Client overrides use a baseline signature and clear after subscription state changes.
- Concurrency tests cover meaningful overlapping confirmation, clarification, Undo, and takeover paths.

## Verification limits

- Read-only review only. No code changes, staging, cleanup, commit, push, PR, or merge.
- Tests and typechecks were not run because dependencies are not installed.
- Independent Luna verification command timed out after 10 minutes. Final findings were checked directly against current source and existing tests.
- Existing unrelated working-tree changes remain untouched, including `scripts/` and `t3.json`.

## Next-session work order

1. Fix P1 row ownership and reconciliation path.
2. Fix takeover divergence handling and add changed-count/type tests.
3. Fix exact current-message history trimming.
4. Block overlapping Home Enter submissions.
5. Add row revision protection for manual edit versus Undo.
6. Route direct deletes through action-aware reconciliation.
7. Add session equality check for clarification linking.
8. Wire canonical turns into web/mobile clarification and web confirmation handlers.
9. Reject empty submission IDs.
10. Tighten result-card validation and add empty-result test.
11. Install dependencies only if explicitly needed for verification, then run focused backend concurrency/undo/contract tests and web card tests.

## Resume prompt

Continue `plans/006-chat-logging-reliability-findings.md` on branch `fix/chat-logging-reliability`. Use Codex Luna for review and implementation delegation. Keep main session read-only for application code. Start with P1 findings. Do not touch existing unrelated working-tree changes. Do not commit, push, open PR, or merge without explicit approval.

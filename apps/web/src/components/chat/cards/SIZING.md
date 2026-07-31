# Chat card sizing rules

Status: active · Applies to: Home chat (`AssistantConsole`) and Coach chat (`CoachPage`)
Source of truth in code: `cardSizing.ts`, next to this file

These rules exist so "the scaling is off" has an objective, testable definition
(issue #41, user story 19). Every chat card — confirmation, clarification,
duplicate, result, failure, undo — is laid out by the same constants, on both
surfaces. If Home and Coach ever look different, one of them stopped using this
module and that is the bug.

## Non-negotiables

1. **No visual scaling transforms.** CSS `zoom`, `transform: scale()`, and
   friends are banned on chat cards and their containers. They shrink type below
   legibility (`zoom: 0.72` turned 14px text into ~10px), defeat breakpoints, and
   make the rendered size impossible to inspect or test. Size comes from layout.
2. **One set of rules, both surfaces.** Home and Coach import the same
   constants. No surface-local widths, gutters, or type sizes.
3. **Minimum interactive target: 44 × 44 CSS px** on every control a card
   renders, at every width. Applied via the shared `min-h-[44px] min-w-[44px]`
   rule so it is inspectable in the DOM.
4. **Minimum type size: 13px.** No text inside a card may render below it,
   including eyebrow labels, validation notes, and status pills.

## Breakpoint bands

Tailwind's default breakpoints. "Column" is the transcript column both surfaces
centre their content in; "card" is the band a card may occupy inside it.

| Band            | Width          | Column max width | Column gutter | Card max width |
| --------------- | -------------- | ---------------- | ------------- | -------------- |
| Phone (base)    | < 640px        | 720px            | 16px (`px-4`) | full column    |
| Small (`sm`)    | 640px – 1023px | 720px            | 20px (`px-5`) | 560px          |
| Large (`lg`+)   | ≥ 1024px       | 720px            | 24px (`px-6`) | 560px          |

Rationale: on a phone the gutters already give the card breathing room, so the
card takes the full column. From `sm` up the card is capped at 560px so it reads
as a card inside the conversation instead of stretching the full 720px column
(the old Coach confirmation card had no absolute cap and reached ~662px).

## Type scale inside a card

| Role                          | Size | Constant             |
| ----------------------------- | ---- | -------------------- |
| Card title                    | 15px | `CHAT_CARD_TITLE`    |
| Body copy / item description  | 14px | `CHAT_CARD_BODY`     |
| Meta, validation, status copy | 13px | `CHAT_CARD_META`     |
| Uppercase category label      | 13px | `CHAT_CARD_EYEBROW`  |

13px is the floor. Earlier card code carried hand-tuned sizes (11px/12px meta,
15px title) that were chosen to survive the `zoom: 0.72` shrink on Home; those
compensations were removed together with the zoom rather than layered on top of
it, and every size above is now stated in real, unscaled pixels.

## Controls

| Control                            | Rule                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| Pill button (confirm/discard/undo) | `CHAT_CARD_PILL` — 44px min height and width, 16px side padding, 13px extrabold label |
| Text / date field                  | `CHAT_CARD_FIELD` — 44px min height, 14px value text    |
| Icon-only button (include, remove) | `CHAT_CARD_ICON_BUTTON` — 44 × 44 hit area around a 16–24px glyph |

## Card state

A card that is committed, discarded, or expired renders as a **resolved** state:
it keeps its content (so the conversation still shows what happened) and drops
every active control. `data-card-state="resolved"` marks it in the DOM.

## How to check it

- `pnpm --filter @stride/web test` — component tests assert card structure per
  kind, resolved cards exposing no confirm/discard controls, reconstruction from
  persisted state, the 44px target rule on every card control, and that Home and
  Coach produce identical structure for identical contract data.
- Manual: no `zoom`/`scale` in the chat tree; at 375px a card fills the column
  minus 16px gutters; at ≥640px it never exceeds 560px; every tappable thing in
  a card is at least 44px on its shortest side; no card text below 13px.

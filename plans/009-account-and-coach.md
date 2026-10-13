# 009 Account and Coach

Status: approved 2026-10-13. Adds two slices to `plans/007-restart.md`. Old slice 9 (polish) becomes 11 and the web retarget becomes 12.

Base: `main` after #49–#51 (slices 6–8). Mobile app in `apps/mobile`, backend in `packages/backend/convex`, math in `packages/core`.

## Decisions

| # | Decision |
|---|---|
| A1 | Profile and Settings are two screens, both opened from an avatar in the Today header. The dock stays at 4 tabs (D17). |
| A2 | Profile holds who you are: name, photo, body stats, goal, pace, diet, training days, current targets. Settings holds the app: units, theme, data, account, about. |
| A3 | Onboarding is required and runs after Clerk sign-in. One question per screen. Users without a complete profile see it on next launch. |
| A4 | Onboarding asks: goal, sex, dob, height, current weight, activity, diet type, target weight and pace, training days per week. Then a target reveal. |
| A5 | Pace is a preset: relaxed, steady, fast. Loss pace max 1% of body weight per week. Gain pace max 0.5 kg per week. |
| A6 | Calorie floor: 1,500 kcal for male, 1,200 for female. A clamped target says so on screen. |
| A7 | Name is editable in Profile and saved to Clerk. Photo comes from Clerk and is read-only. |
| A8 | No notifications row in Settings until reminders exist. |
| A9 | Coach chats read the user's data and can edit or delete entries with undo cards. They do not log food. Logging stays in Compose. |
| A10 | Chat v1: chat list, auto titles, rename, delete, search, starter prompts, streaming replies, markdown, stop, regenerate, photo attachments. |
| A11 | A photo in chat is discussed only. The reply offers "Log this", which opens Compose with the photo attached. |
| A12 | Streaming writes the reply in chunks to the message row. Convex pushes the updates. No new dependency. |
| A13 | Web gets no onboarding, Profile, Settings or chat screens in slice 12. Web reads the same profile and targets. |

## Slice 9: Onboarding, Profile, Settings

Depends on 6–8. Agents: Haiku codes, Opus polishes the screens against v5, Codex (Sol 6.1) reviews.

### Backend and core

- `user_settings`: add `dietType` (`veg | eggetarian | non_veg | vegan | jain`), `targetWeightKg`, `pace` (`relaxed | steady | fast`), `trainingDaysPerWeek` (0–7). All optional so existing rows stay valid.
- `packages/core/src/energy/targets.ts`: replace the fixed `GOAL_KCAL_OFFSETS` with a pace-based daily offset (pace kg/week × 7,700 / 7). Apply the A5 caps and A6 floor. Return the target plus a `clamped` flag and reason. Property tests for the caps, the floor and maintain (offset 0).
- Preset values: relaxed 0.25, steady 0.5, fast 0.75 kg/week for loss; relaxed 0.1, steady 0.25, fast 0.5 for gain. The 1% cap still wins.
- `saveProfile` in `progress_v2.ts`: accept the new fields and validate them at the boundary (target weight 30–300 kg and on the right side of current weight for the goal, training days 0–7). Onboarding also logs the current weight through the existing weight mutation.
- Add a `profileStatus` query: `complete` when goal, sex, dob, height, activity, diet and a weight exist. The app gates on it.
- Add `updateProfile` for Profile edits, or let `saveProfile` take partial input. Pick whichever keeps one validation path.
- Delete pre-restart code that this replaces: `profile.ts` (`getProfile`, `upsertProfile`, `calculateTDEE`, `upsertPlanFromOnboarding`, LLM key settings) and `tdee_engine.ts`, after checking that nothing on `main` still imports them. Drop the `openRouterKey` and `openRouterModel` fields from `user_settings` only if no rows hold data, or leave them optional and unused.
- Delete account: an action that runs `clearAllData`, then deletes the Clerk user through the Clerk backend API.

### Mobile screens

- **Onboarding** (`app/onboarding/*`). Follow v5 `#/onboarding` in `temp/mocks/stride-mocks-v5.html`. Steps: goal → sex → dob → height → weight → activity → diet → target weight + pace → training days → reveal. Progress bar, back button, one primary button. Units follow device locale until Settings changes them. The reveal shows the daily target, the macro split, and Polo (happy mood). If the target is clamped, the reveal says why in one line.
- **Gate:** the root layout reads `profileStatus` after sign-in. Incomplete sends the user to onboarding. Complete goes to the tabs.
- **Avatar:** Clerk photo or initials, top right of Today. Tap opens a small sheet with Profile and Settings.
- **Profile** (`app/profile.tsx`): name (editable, saved with Clerk `user.update`), photo (read-only), then rows for each onboarding field. Tapping a row opens the same input used in onboarding, in a sheet. Targets section at the bottom: daily kcal and macros, marked "Learned from your logs" when the adaptive TDEE snapshot drives them, otherwise "From your profile".
- **Settings** (`app/settings.tsx`): units (metric/imperial), theme (System/Light/Dark, stored locally and applied through `useTheme`), export data (`exportAllData`, share as a JSON file), clear all data (confirm sheet, `clearAllData`), sign out, delete account (confirm by typing DELETE), about (app version, food data credits: IFCT, USDA FDC, Open Food Facts).
- No v5 mock exists for Profile or Settings. Opus designs them from v5 tokens and components (list rows, sheets), with no new visual language.

### Acceptance

- A new user can't reach the tabs without finishing onboarding. An existing user with a full profile never sees it.
- The target shown on the reveal equals the target on Today.
- Core tests: 1% loss cap, 0.5 kg gain cap, both floors, `clamped` flag set when either applies.
- Changing goal, pace or weight in Profile updates the Today target on the same screen visit.
- Delete account leaves no rows for that user and removes the Clerk user.
- Typecheck and tests pass in core, backend, mobile. Tested on an Android dev build.

## Slice 10: Coach chat

Only the context task depends on 9 (needs profile and diet). The rest runs in parallel with slice 9 on its own branch. Agents: Haiku codes, the main session writes streaming, Opus polishes the thread screen, Codex (Sol 6.1) reviews.

### Backend

- **Context:** extend `turnContext` with profile (goal, pace, diet, training days), current targets, and the weight trend from `progress_v2`, on top of D12's history, today's entries and user foods.
- **Tools:** remove `add_entry` from `CHAT_TOOLS` in `chats.ts` (A9). Keep `edit_entry`, `delete_entry` and the lookup tools. If the user asks to log food, the reply says to use Compose and offers the same "Log this" action as photos.
- **Streaming:** `messages` gets `status` (`streaming | done | stopped | failed`). `sendMessage` inserts the assistant row first, then patches `text` every ~300 ms or ~200 characters from the OpenRouter stream. The final patch sets `status: done`. `callOpenRouter` needs a streaming variant. Tool calls run between stream segments as they do now.
- **Stop:** `stopMessage` mutation sets a stop flag on the row. The action checks it between chunks and ends with `status: stopped`, keeping the partial text.
- **Regenerate:** soft-delete the last assistant message and its tool rows, then rerun the turn from the last user message. Entry edits from the old reply are not undone automatically. Their undo cards stay.
- **Rename:** `renameChat` mutation, 60 character cap as in `createChat`.
- **Auto titles:** keep the current first-message naming. Optionally replace it with a short model-written title after the first reply.
- **Search:** add a `searchIndex` on `messages.text` filtered by `userId`, and a `searchChats` query returning chat id, title and a snippet. Cap at 20 results.
- **Photos:** reuse the slice 6 upload URL and `requireOwnUpload`. Send the image to the model as in the extraction pipeline (luna or the Gemini fallback per D13). The assistant message can carry a `logAction` with the storage id. The client renders it as a "Log this" button.

### Mobile screens

- **Coach tab** (replaces the placeholder in `app/(tabs)/coach.tsx`): search field, chat list sorted by `updatedAt` with title and last message preview, swipe or long-press for rename and delete, a "New chat" button. Follow v5 `#/coach`.
- **Thread** (`app/chat/[id].tsx`): follow v5 `#/thread` and v7 `#/thread-stream`. Markdown rendering with `react-native-markdown-display` (lists, bold, tables, code). Streaming text with a stop button while `status` is `streaming`. Regenerate on the last reply. Undo cards for entry edits, reused from slice 6. Photo attach in the input. "Log this" opens Compose with the photo.
- **New chat** (`#/thread-new`): 3–4 starter prompts built from the user's day ("How's my protein today?", "Plan dinner for what's left", "Why did my weight go up?").

### Acceptance

- Text appears within 1.5 s of sending on Wi-Fi and grows as it streams.
- Stop keeps the partial reply and marks it stopped. Regenerate replaces only the last reply.
- Asking chat to log food doesn't create an entry.
- "Change lunch to 2 roti" edits the entry and shows an undo card that works.
- Search finds a message by a word in its text and opens that chat.
- A photo in chat creates no entry. "Log this" opens Compose with the same photo.
- Backend tests cover streaming status changes, stop, regenerate and search ownership (no other user's chats).

## Renumbered slices in 007

| Slice | Deliverable |
|---|---|
| 9 | Onboarding, Profile, Settings (this doc) |
| 10 | Coach chat (this doc) |
| 11 | Polish: motion pass, empty/loading/error states, Sentry + PostHog, EAS internal APK. Onboarding moves out to 9. |
| 12 | Web retarget: minimal desktop log, day view, Progress. No account or chat screens (A13). |

## Future features

- Edit a sent message: truncate and resend, or full branching with a version switcher.
- Notification settings, once reminders exist.
- Web Profile and Settings.
- Usual meal times in Profile.
- Protein preference (standard or high).
- Editable profile photo.

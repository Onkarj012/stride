# Stride product reference

What v1 is, who it is for, and what it leaves out. Source: `plans/007-restart.md` (decisions D1-D25) plus the 2026-10-06 amendments V1-V10 listed in `AGENTS.md`. If this file and the plan disagree, the plan and its amendments win.

## Goals

1. Track nutrition, strength, weight, and energy expenditure as well as the best apps do.
2. Every log lands once, on the right day, and can be edited or undone.
3. Numbers come from verified food databases and fixed math. The AI parses text. It never estimates macros.
4. The UI is animated, fun, and built for a phone first.

## Who it is for

- The owner first, on Android.
- Then 2-3 family members, through an internal APK build.
- Not a public launch. Data can be reset during the rebuild.

## v1 scope (D4)

| Area | In v1 |
|---|---|
| Nutrition | Logging by text, voice, photo, and barcode. Daily totals and macros. |
| Workouts | Exercise library, set logging (reps, weight, RPE), estimated 1RM, weekly volume per muscle. |
| Weight | Morning weigh-in prompt and a smoothed trend line. |
| Energy | Adaptive TDEE from your own intake and weight data. |
| Coach | Multi-chat AI coach that can read and correct your log. |

Wearables (Health Connect steps and sleep, read-only) wait for v1.5.

## Logging model

One input bar sits on every screen. It takes text, voice, a photo, or a barcode (D5).

1. Voice goes through Groq Whisper and becomes text.
2. The model extracts a list of `{food, quantity, unit}` items, with an optional meal slot and date. It never outputs grams or nutrients (D10).
3. A matcher looks each food up in this order: your own foods, food memory, then the `foods` table.
4. A portion resolver turns the unit into grams using portion tables, your own measures, or density.
5. Shared math computes nutrients from per-100 g values times grams.
6. A confidence gate decides what happens next.

### Auto-commit or ask (D7)

| Case | Result |
|---|---|
| Every item matches with score 0.85 or higher, the portion resolved, and nothing hit a clamp | Saved at once. A 10-second undo toast appears. |
| Anything else | A draft card asks you to confirm or fix it. |
| Item came from a photo | Saved with an "estimated" badge. |
| Food the matcher cannot resolve | The model gets search tools for a second try. If that fails, the app asks. An unknown food never counts as 0 kcal. |

### Corrections (D8)

- You can edit any entry at any time, from the log or by telling the Coach.
- The Coach changes the log through `add`, `edit`, and `delete` tool calls.
- Every change writes a new revision row. Undo reverts to the prior revision.
- The ledger of entries is the truth. Chat is only a view of it.

### Portions (D10)

Indian household measures are seeded and editable: katori (150 ml), roti (40 g), bowl, plate, glass, ladle, piece. You can override any of them with your own measure.

### Meal slots and dates (D15, D16)

- Slots come from local time: before 11:00 breakfast, 11-16 lunch, 16-19 snack, after 19:00 dinner. The text can override this, and you can edit it.
- Every date uses your IANA time zone, captured at onboarding and refreshed each session.

## Accuracy

- Food data: USDA FoodData Central (SR Legacy and Foundation), IFCT 2017, and Open Food Facts for barcodes (D3). A curated subset lives in Convex. Barcodes are fetched once and cached (D9).
- The AI maps text to database entries. No AI-produced macro number is ever stored.
- Any entry's kcal can be recomputed from its food's per-100 g values times its grams.
- Day totals are the sum of unrounded entry values, rounded once.
- Unknown units stay unresolved. The app never guesses them.
- IFCT 2017 is licensed for personal use only. Do not redistribute the dataset.

## Adaptive TDEE (D11)

Stride learns your real maintenance calories from what you eat and how your weight moves.

- Weight trend: exponential moving average with alpha 0.1.
- Slope: least-squares fit over the last 14-28 days.
- Estimate: `TDEE = meanIntake − slope × 7700`, where 7700 is kcal per kg of body weight.
- Gate: at least 14 days of data, 10 weigh-ins, and 70% of days logged.
- Clamp: 0.75 to 1.3 times the Mifflin-St Jeor estimate.
- The estimate recomputes daily. Targets update weekly. No LLM is involved.
- The morning weigh-in prompt stays in v1 because this needs it (V4).
- When the gate first passes, a "Burn estimate ready" milestone screen appears (V8, ships with slice 7).

## Tabs (D17)

| Tab | Shows |
|---|---|
| Today | Rings for calories and macros, today's entries, the input bar |
| Log | Calendar history, one day at a time |
| Progress | Weight trend, energy expenditure, targets, strength charts |
| Coach | Chat list and chats |

The tabs sit in the v5 dock. The layout may change after the slice 6 review.

## Coach (D12, D13)

- Multi-chat, like ChatGPT or Claude. Each chat has its own history and attachments. You can start, open, and delete chats.
- Each turn the model sees the chat history, today's entries, and your saved foods.
- One general coach. The chat screen is titled "Coach".
- Models run through OpenRouter only. Voice uses Groq Whisper. Model ids are listed in plan 007 D13.

## Mascot (V5)

The mascot's temporary name is Macro Polo, shown as "Polo" in the app. The v5 mocks say "Chana". The app uses Polo. The name is not final.

## Design (V1, V9)

- v5 is the locked design. It sets the tokens, type (Bricolage Grotesque for display, Geist for text), the dock, cards, and motion.
- The mock is a local-only file: `temp/mocks/stride-mocks-v5.html`. Open it in a browser; routes are hash links like `#/today`.
- Light and dark themes both ship in v1. The app follows the system setting.
- Tone: clear utility first, with a flat mascot and springy motion for fun.
- One `tokens.ts` drives web and native styles (D20).

## Not in v1

Removed in slice 1 and not coming back in v1 (D18): check-ins, nudges, XP and streaks, the 7 specialist coaches, daily and weekly AI narratives, recipes, the landing page showcase, bring-your-own API keys, chat session titles, homepage sessions.

### v1.5 backlog

- Saved meals (recipes return in this form).
- Health Connect steps and sleep, read-only.
- Program templates and progressive overload.
- Offline use with on-device SQLite.
- iOS build.
- "What fits what's left" suggestions (V8).
- Voice transcription hints for Hinglish and Indian food words.
- Retention (V4): a forgiving weekly streak (5 of 7 days, with automatic freezes), a comeback screen after 3+ days away, a Sunday recap, a wins log, and at most 2 notifications a day.
- v7 design experiments: Today layouts (timeline, ring), inline chat and a quick-talk sheet, typing in the dock, hold-to-talk, check-ins as chat prompts or notifications.

### Later

- The web app returns in slice 10 as a desktop view: log, day view, and Progress charts.
- E2E tests.

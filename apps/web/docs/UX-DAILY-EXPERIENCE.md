# Stride — Daily User Experience Design

## Core Principle: The App Comes to You

The app should not be a tracker users have to remember to open.
It should be a companion that meets users at the right moment, asks the right question, and exits cleanly.

**Constraint: every interaction window is ≤ 5 minutes.**

---

## Four Daily Windows

### Window 1 — Morning (first open after waking)

**Goal:** Set today's intention. Acknowledge yesterday. Anchor 1–2 priorities.

**Flow (in order, conversational):**

1. **Greet + acknowledge sleep** (pulled from yesterday's wind-down or estimated):
   *"Morning, Sandra. You logged 6.5 hours — a bit short. How are you feeling?"*

2. **Quick mood/energy ping** (one question, 3-option tap: low / okay / great):
   *"Energy this morning?"*

3. **Surface ONE priority** based on yesterday's data — not a list:
   *"Yesterday hydration was 1.1L — let's aim for 2L today. I'll check in at lunch."*

4. **Soft breakfast suggestion** if user typically logs breakfast:
   *"Want me to suggest something quick? Yesterday you were 30g short on protein."*

5. **Exit.** Total: ~60–90 seconds.

**Adaptive behavior:**
- If user dismissed yesterday's morning chat → shorter greeting today
- If sleep was great → motivating tone; if poor → gentle, lower-pressure
- If pattern shows user works out mornings → ask about workout intent

---

### Window 2 — During the Day (passive + reactive)

**Goal:** Be there when invoked. Nudge once if a clear gap shows.

**Behavior:**
- Quick logging stays as-is (voice, photo, text). Bot only responds to what the user does.
- **One mid-day nudge max**, only if a strong signal warrants it:
  *"It's 2pm — you haven't logged a meal yet. Did you skip or forget to log?"*
- After each meal log, acknowledge in context:
  *"Nice protein hit — 35g. You're tracking well for today's target."*
- After a workout: short and validating, then drops off.

**Adaptive behavior:**
- Frequency of mid-day nudges scales down if dismissed repeatedly
- Acknowledgment style matches personality picker (gentle / motivating / analytical)

---

### Window 3 — Evening Check-in (~6–8pm)

**Goal:** 90-second reflection. Catch what was missed. Set tomorrow.

**Flow:**

1. *"How was today, 1–5?"* (one tap)
2. **Auto-summarize the day in one line:**
   *"You hit your protein target, missed 600ml of water, no workout logged."*
3. **Ask about gaps gently:**
   *"Did you actually skip the workout, or just forget to log? No pressure either way."*
4. **Tomorrow primer if relevant:**
   *"Anything different tomorrow? Travel, a workout planned, dinner out?"*
5. Exit.

---

### Window 4 — Before Sleep (~10–11pm)

**Goal:** Wind-down. Capture sleep intent. Close the day's loop.

**Flow:**

1. *"Heading to bed?"* (yes / not yet)
2. *"How's your stress right now, 1–5?"*
3. **Set sleep target if not already:** *"Aiming for 7.5 hours? I'll mark sleep started now."*
4. **Optional 30-second wind-down:** a single breathing prompt or one-line reflection (skippable).
5. Exit. No more notifications until morning.

---

## What Makes the Bot Adaptive (Not Scripted)

The current codebase uses canned flows. To make this real, the system needs:

### 1. Behavioral Memory Store
Beyond log data. Track:
- Typical wake/sleep time
- Dismissal rate of each window's chat
- Which suggestions get acted on
- Which agents the user engages with most
- Response time patterns

### 2. Today Brief Generator
A function that runs at session start, reads yesterday + this week + user prefs, and returns 1–2 priorities as plain strings the chat uses as context.

### 3. Time-Window Awareness
The app knows whether you're in morning / day / evening / night window and changes the entry experience accordingly. CoachPage at 7am should feel different from 10pm.

### 4. Adaptive Tone
The personality picker is a starting point. The system should weight styles based on behavior — if the user consistently engages longer with motivating language, lean that way automatically.

---

## Proposed Build Order (Smallest → Biggest Impact)

| # | Feature | Size | Impact |
|---|---------|------|--------|
| 1 | Time-aware home greeting + DailyGuidanceCard priority by window | Small | High |
| 2 | Conversation flows for each window (`morningFlow`, `eveningReflection`, etc.) | Medium | High |
| 3 | Behavioral memory layer (`useBehavior()` hook) | Medium | Medium |
| 4 | Window-triggered chat prompt on HomePage | Medium | High |
| 5 | Tomorrow primer + carry-over intent | Large | High |

**Recommended starting point:** #1 + #2 (morning window only).
This is the smallest visible change that demonstrates the shift from "tracker you visit" to "companion that meets you where you are."

---

## Key Design Rules

- **One question at a time.** Never ask two things in the same message.
- **Tap-first.** Whenever possible, offer 2–3 tap options instead of requiring typing.
- **Exit cleanly.** Every window ends with the bot going quiet. No lingering.
- **Never punish.** Missing a day gets a gentle re-entry, not a guilt trip.
- **Acknowledge, don't just record.** Every log should get a one-line human response.
- **Personalize the summary.** The evening summary should feel like it was written for this specific user, not generated from a template.

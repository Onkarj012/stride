# AI Configuration

## OpenRouter Model

| Property | Value |
|----------|-------|
| **Provider** | OpenRouter (https://openrouter.ai) |
| **Model ID** | `openai/gpt-4o-mini` |
| **Tag** | `openai/gpt-4o-mini` |
| **Context Window** | 128K tokens |
| **Max Output Tokens** | 500–800 (varies by endpoint) |

## Where It Is Set

The model is **hardcoded** in the backend AI router:

**File:** `backend/src/routes/ai.ts`  
**Function:** `callAI()` (around line 41)

```ts
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function callAI(messages: AIMessage[], maxTokens = 500): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  // ...
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    }),
  });
  // ...
}
```

## Environment Variables

| Variable | File | Description |
|----------|------|-------------|
| `OPENROUTER_API_KEY` | `backend/.env.local` | API key for OpenRouter |
| `PORT` | `backend/.env.local` | Backend port (default: 3210) |

## AI Coaches

| Coach ID | Name | Domain | System Prompt |
|----------|------|--------|---------------|
| `overall` | StrideCoach | General fitness & nutrition | Holistic coach with meal/workout logging |
| `workout` | IronCoach | Strength & conditioning | Training, programming, performance |
| `diet` | MacroCoach | Nutrition & meal planning | Macros, meal timing, precision nutrition |
| `recovery` | RestCoach | Recovery & sleep | Sleep, injury prevention, longevity |
| `mindset` | MindCoach | Motivation & habits | Consistency, mental performance |

### Coach Routing
- **Frontend:** Toggle buttons in the chat header (`Dashboard.tsx`). Sends `coachType` with every message.
- **Backend:** `GET /api/ai/coaches` returns the list. `POST /api/ai/chat` accepts `coachType`; `getCoach(coachType)` selects the config, falling back to `overall`.

### System Prompt Behavior
- **Yes, the system prompt changes per coach.** Each coach has a distinct `systemPrompt` defined in `backend/src/coaches.ts`.
- All coaches share a common `BASE_RULES` snippet (address user by name, reference actual data, use markdown).

### Chat History
- **Yes, previous chat history is sent to the LLM.**
- Up to **40 messages** from the current `sessionId` are loaded from SQLite (`chat_messages` table).
- History is prepended to the messages array before the new user message, giving the LLM full conversational context.

### Additional Context
The final system prompt also includes:
- User profile data (goals, macros, targets)
- Today's meals & workouts
- 7-day calorie trend
- Direct logging capability instructions (`⟦LOG_MEAL⟧` / `⟦LOG_WORKOUT⟧` markers)

## Usage Across Features

The shared `callAI()` function powers:
- Chat coaching (`/api/ai/chat`)
- Meal parsing (`/api/ai/parse-meal`)
- Workout parsing (`/api/ai/parse-workout`)
- Meal estimation (`/api/ai/estimate-meal`)
- Daily insights (`/api/ai/insights`)
- Weekly summaries (`/api/ai/weekly-summary`)
- Workout suggestions (`/api/ai/workout-suggestion`)
- Profile macro calculation (`/api/ai/calculate-macros`)

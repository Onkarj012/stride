/**
 * agents.ts — Agentic orchestration skeleton (Phase 5)
 *
 * Each agent is a pure async function that receives a shared context object and
 * returns a partial result. homepageInput wires them together.
 *
 * Current state: stubs for DietAgent, WorkoutAgent, SleepAgent, CoachAgent.
 * MemoryAgent is fully implemented — it extracts user-stated facts and aliases
 * from messages and silently patches food_memory / workout_memory.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { callAI } from "./ai_utils";

// ─── Shared context passed to every agent ────────────────────────────────────

export interface AgentContext {
  userId: string;
  message: string;
  today: string;
  /** Existing food memory entries for this user */
  knownFoods: { name: string; normalizedName?: string }[];
  /** Existing workout memory entries */
  knownWorkouts: { name: string }[];
}

// ─── MemoryAgent — extract facts and aliases, patch memory silently ───────────

/**
 * Lightweight LLM call to extract any explicit user-stated corrections or
 * aliases from the message. Examples:
 *   "my paneer bhurji has 350 kcal" → patch food_memory for paneer bhurji
 *   "I call it 'home dal' but it's the same as my dal tadka" → add alias
 *
 * Returns an array of patches to apply. Empty array = no facts extracted.
 */
export interface MemoryFact {
  kind: "food_alias" | "workout_alias" | "food_correction";
  name: string;           // canonical name to update
  alias?: string;         // for alias facts
  kcal?: number;          // for food_correction
  protein?: number;
  carbs?: number;
  fat?: number;
}

export async function runMemoryAgent(
  ctx: any,
  agentCtx: AgentContext,
  callAI: (messages: any[], maxTokens?: number, model?: string, apiKey?: string) => Promise<string>,
  model?: string,
  apiKey?: string,
): Promise<void> {
  // Only run if message looks like it contains a personal fact or correction
  const hasFact = /\b(my |I call it|same as|is the same|has about|contains around|usually has|i make it with)\b/i.test(agentCtx.message);
  if (!hasFact) return;

  const knownFoodNames = agentCtx.knownFoods.map((f) => f.name).slice(0, 20).join(", ");

  const prompt = `You extract user-stated personal food/workout facts from messages.

KNOWN FOODS: ${knownFoodNames || "none yet"}

MESSAGE: "${agentCtx.message}"

If the user states a personal fact about a food (e.g. "my paneer bhurji has 350 kcal" or "I call X 'Y'"), extract it.
Return ONLY a JSON array of facts, or [] if nothing to extract.
Each fact: {"kind":"food_alias"|"food_correction","name":"<food name>","alias":"<alias if kind=food_alias>","kcal":<number if known>,"protein":<number if known>,"carbs":<number if known>,"fat":<number if known>}
Numbers optional. Return [] if nothing applies.`;

  try {
    const raw = await callAI([{ role: "user", content: prompt }], 200, model, apiKey);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    const facts: MemoryFact[] = JSON.parse(match[0]);
    for (const fact of facts) {
      if (!fact.name) continue;
      if (fact.kind === "food_correction" && fact.kcal != null) {
        // Patch existing food_memory entry if it exists
        await ctx.runMutation(internal.food_memory.recordFromMeal, {
          userId: agentCtx.userId,
          name: fact.name,
          kcal: fact.kcal,
          protein: fact.protein ?? 0,
          carbs: fact.carbs ?? 0,
          fat: fact.fat ?? 0,
          date: agentCtx.today,
          source: "corrected",
        }).catch(() => {});
      }
      // food_alias and workout_alias: stored as future extension
      // (alias patching requires exposing a patchAlias mutation — out of scope for skeleton)
    }
  } catch { /* ignore — MemoryAgent is fire-and-forget */ }
}

// ─── Domain agent stubs ───────────────────────────────────────────────────────

/** Routes a meal description through the nutrition engine. Stub — currently delegates to homepageInput's existing parseMealDescription path. */
export interface DietAgentInput {
  description: string;
  date: string;
  userId: string;
}
export interface DietAgentResult {
  handled: false; // stub: not yet fully implemented
}
export async function runDietAgent(_ctx: any, _input: DietAgentInput): Promise<DietAgentResult> {
  // TODO Phase 5 full: run parseMealDescription, apply food_memory match, return draft
  return { handled: false };
}

/** Routes a workout description through the calorie engine. Stub. */
export interface WorkoutAgentInput {
  description: string;
  date: string;
  userId: string;
}
export interface WorkoutAgentResult {
  handled: false;
}
export async function runWorkoutAgent(_ctx: any, _input: WorkoutAgentInput): Promise<WorkoutAgentResult> {
  // TODO Phase 5 full: run parseWorkoutDescription, apply workout_memory, return draft
  return { handled: false };
}

/** Interprets a sleep log and returns recovery tone adjustment. Stub. */
export interface SleepAgentInput {
  hours: number;
  quality: string;
  date: string;
}
export interface SleepAgentResult {
  recoveryMode: boolean;
  toneNote: string;
}
export function runSleepAgent(input: SleepAgentInput): SleepAgentResult {
  const recoveryMode = input.hours < 6.5 || input.quality === "poor";
  const toneNote = recoveryMode
    ? `User slept ${input.hours}h (${input.quality}). Prioritise rest, simplify goals.`
    : "";
  return { recoveryMode, toneNote };
}

/** Assembles the final coaching reply from domain agent outputs. Stub — currently returns null to fall through to existing chat path. */
export interface CoachAgentInput {
  userId: string;
  message: string;
  dietResult?: DietAgentResult;
  workoutResult?: WorkoutAgentResult;
  sleepResult?: SleepAgentResult;
}
export function runCoachAgent(_input: CoachAgentInput): null {
  // TODO Phase 5 full: synthesise a short daily brief from all domain results
  return null;
}

// ─── Convex action: runMemoryAgentAction ─────────────────────────────────────
// Exposed as an internal action so homepageInput can fire-and-forget it.

export const runMemoryAgentAction = internalAction({
  args: {
    userId: v.string(),
    message: v.string(),
    today: v.string(),
    model: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, { userId, message, today, model, apiKey }) => {
    const [knownFoods, knownWorkouts] = await Promise.all([
      ctx.runQuery(internal.food_memory.getTopForContext, { userId, limit: 20 }),
      ctx.runQuery(internal.workout_memory.getTopForContext, { userId, limit: 10 }),
    ]);

    await runMemoryAgent(
      ctx,
      { userId, message, today, knownFoods: knownFoods as any[], knownWorkouts: knownWorkouts as any[] },
      callAI,
      model,
      apiKey,
    );
  },
});

/**
 * agents.ts — MemoryAgent
 *
 * MemoryAgent extracts user-stated food/ingredient facts and aliases from
 * messages and can propose food/ingredient memory updates. Automatic writes are
 * gated for beta; it runs
 * fire-and-forget from homepageInput via runMemoryAgentAction.
 */

import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { logBackgroundFailure } from "./observability";
import { callAI } from "./ai/llm";
// user_ingredients module is accessed via internal.user_ingredients (Convex codegen)

// Beta keeps extracted memory suggestions out of domain state until explicit
// confirmation is available. See plans/005-beta-release.md P1.
export const MEMORY_AUTO_PERSIST = false;

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
  callAI: (ctx: ActionCtx, userId: string, messages: any[], maxTokens?: number, model?: string, apiKey?: string) => Promise<string>,
  model?: string,
  apiKey?: string,
): Promise<void> {
  const hasFact = /\b(my |homemade|home.?made|I make|I prepare|I call it|same as|is the same|has about|contains around|usually has|i make it with|per 100g|per serving|grams? of protein|grams? of fat|grams? fat|grams? protein)\b/i.test(agentCtx.message);
  if (!hasFact) return;

  const knownFoodNames = agentCtx.knownFoods.map((f) => f.name).slice(0, 20).join(", ");

  const prompt = `Extract personal food/ingredient facts from the user's message.

KNOWN FOODS: ${knownFoodNames || "none yet"}
MESSAGE: "${agentCtx.message}"

Extract TWO kinds of facts:

1. Meal-level corrections: user states total macros for a meal they eat.
   {"kind":"meal_fact","name":"<meal name>","kcal":<number>,"protein":<number>,"carbs":<number>,"fat":<number>}

2. Ingredient-level facts: user describes an ingredient they make or use regularly, with per-100g or per-serving nutrition info, or just notes about how it's made.
   {"kind":"ingredient_fact","name":"<ingredient name>","per100g":{"kcal":<number|null>,"protein":<number|null>,"carbs":<number|null>,"fat":<number|null>},"notes":"<any relevant notes about how it's made or its properties>"}

Examples:
- "my homemade paneer has 18g protein per 100g and about 260 kcal"
  → [{"kind":"ingredient_fact","name":"homemade paneer","per100g":{"kcal":260,"protein":18,"carbs":2,"fat":20},"notes":"homemade paneer"}]
- "I made paneer at home with full fat milk, no whey removed"
  → [{"kind":"ingredient_fact","name":"homemade paneer","per100g":{"kcal":null,"protein":null,"carbs":null,"fat":null},"notes":"full fat milk, no whey removed — likely higher fat than store bought"}]
- "my chicken tikka usually has around 200 kcal per serving"
  → [{"kind":"meal_fact","name":"chicken tikka","kcal":200,"protein":null,"carbs":null,"fat":null}]

Return ONLY a JSON array, or [] if nothing applies.`;

  try {
    const raw = await callAI(ctx, agentCtx.userId, [{ role: "user", content: prompt }], 300, model, apiKey);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    const facts = JSON.parse(match[0]) as Array<{
      kind: "meal_fact" | "ingredient_fact";
      name: string;
      kcal?: number | null;
      protein?: number | null;
      carbs?: number | null;
      fat?: number | null;
      per100g?: { kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null };
      notes?: string;
    }>;

    if (!MEMORY_AUTO_PERSIST) return;

    for (const fact of facts) {
      if (!fact.name) continue;

      if (fact.kind === "ingredient_fact") {
        const p = fact.per100g ?? {};
        await ctx.runMutation(internal.user_ingredients.upsertIngredient, {
          userId: agentCtx.userId,
          displayName: fact.name,
          caloriesPer100g: p.kcal ?? undefined,
          proteinPer100g: p.protein ?? undefined,
          carbsPer100g: p.carbs ?? undefined,
          fatPer100g: p.fat ?? undefined,
          notes: fact.notes ?? undefined,
          date: agentCtx.today,
        }).catch((error: unknown) => logBackgroundFailure("ingredient_memory_write_failed", agentCtx.userId, error));
      }

      if (fact.kind === "meal_fact" && fact.kcal != null && fact.protein != null && fact.carbs != null && fact.fat != null) {
        await ctx.runMutation(internal.food_memory.recordFromMeal, {
          userId: agentCtx.userId,
          name: fact.name,
          kcal: fact.kcal,
          protein: fact.protein,
          carbs: fact.carbs,
          fat: fact.fat,
          date: agentCtx.today,
          source: "corrected",
        }).catch((error: unknown) => logBackgroundFailure("food_memory_agent_write_failed", agentCtx.userId, error));
      }
    }
  } catch (error) {
    logBackgroundFailure("memory_agent_failed", agentCtx.userId, error);
  }
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

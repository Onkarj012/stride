import { addDays, rankCandidates, type MealSlot } from "@stride/core";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type ActionCtx } from "../_generated/server";
import { MAX_DAY_ENTRIES } from "../day_totals";
import { isVisibleFood } from "../foods_db";
import { foodSourceValidator, mealSlotValidator } from "../ledger_validators";
import { resolveLocalDay } from "../time_zone";
import { lookupBarcodeFood } from "./barcode";
import { callOpenRouter, isRecord, PIPELINE_MODEL, type ChatMessage, type JsonValue, type ToolDefinition } from "./openrouter";
import { searchVisibleFoods, userFoodsOf, type Pick, type UnresolvedItem } from "./resolve";

/** Most model calls in one tool loop. The loop also stops when the model makes no tool call. */
export const MAX_TOOL_ITERATIONS = 4;
const MAX_TOOL_FOODS = 10;
const MAX_RECENT_DAYS = 7;
const RESOLVE_MAX_TOKENS = 600;

/** Food ids the model has seen in tool results this loop. Only these may be chosen, so it cannot invent ids. */
export type SeenFoods = Map<string, Id<"foods">>;

/** Builds a function tool definition. */
function tool(name: string, description: string, properties: { [key: string]: JsonValue }, required: string[]): ToolDefinition {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", additionalProperties: false, properties, required } },
  };
}

/** D14 lookup tools. They return database rows; the model only ever picks ids from them. */
export const LOOKUP_TOOLS: ToolDefinition[] = [
  tool("search_food", "Search the food database by name. Returns food ids and names.", { query: { type: "string" } }, ["query"]),
  tool(
    "lookup_barcode",
    "Look up a packaged food by its barcode digits (Open Food Facts).",
    { barcode: { type: "string" } },
    ["barcode"],
  ),
  tool(
    "get_portion_weights",
    "Gram weights of the household measures recorded for one food.",
    { food_id: { type: "string" } },
    ["food_id"],
  ),
  tool("get_user_foods", "The user's own saved foods.", {}, []),
  tool("recent_entries", "Foods the user logged in the last few days.", { days: { type: "number" } }, ["days"]),
];

const CHOOSE_FOOD_TOOL = tool(
  "choose_food",
  "Choose the food for one unresolved item. food_id must come from a tool result or the item's candidates.",
  { item_index: { type: "number" }, food_id: { type: "string" } },
  ["item_index", "food_id"],
);

const RESOLVE_PROMPT = [
  "Some foods in a meal log did not match the food database. Find the right database food for each.",
  "Use the tools to search. Call choose_food once per item you are sure about. Skip items you cannot place;",
  "the user will be asked. Never make up a food id. Never state calories or nutrients.",
].join(" ");

/** Parses a tool call's JSON arguments, or an empty object when malformed. */
export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Records foods a tool returned so the model may choose them. */
function remember(seen: SeenFoods, ids: readonly Id<"foods">[]): void {
  for (const id of ids) seen.set(id, id);
}

/** Ranked food search for a tool call. */
export const toolSearchFoods = internalQuery({
  args: { userId: v.string(), query: v.string() },
  returns: v.array(v.object({ food_id: v.id("foods"), name: v.string(), source: foodSourceValidator })),
  handler: async (ctx, { userId, query }) => {
    const rows = await searchVisibleFoods(ctx, userId, query.slice(0, 120));
    return rankCandidates(query, rows)
      .slice(0, MAX_TOOL_FOODS)
      .map((r) => ({ food_id: r.candidate._id, name: r.candidate.name, source: r.candidate.source }));
  },
});

/** The user's personal foods for a tool call. */
export const toolUserFoods = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.object({ food_id: v.id("foods"), name: v.string() })),
  handler: async (ctx, { userId }) =>
    (await userFoodsOf(ctx, userId)).slice(0, 50).map((food) => ({ food_id: food._id, name: food.name })),
});

/** Portion weights of one visible food, or null when the id is not a food the user can see. */
export const toolPortionWeights = internalQuery({
  args: { userId: v.string(), foodId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ name: v.string(), portions: v.array(v.object({ measure: v.string(), description: v.string(), grams: v.number() })) }),
  ),
  handler: async (ctx, { userId, foodId }) => {
    const id = ctx.db.normalizeId("foods", foodId);
    const food = id === null ? null : await ctx.db.get("foods", id);
    if (food === null || !isVisibleFood(food, userId)) return null;
    const rows = await ctx.db
      .query("food_portions")
      .withIndex("by_foodId_and_description", (q) => q.eq("foodId", food._id))
      .take(20);
    return { name: food.name, portions: rows.map((r) => ({ measure: r.measure, description: r.description, grams: r.gramsPerMeasure })) };
  },
});

/** Live entries from the last few local days, newest day first. */
export const toolRecentEntries = internalQuery({
  args: { userId: v.string(), days: v.number() },
  returns: v.array(
    v.object({
      entry_id: v.id("entries"),
      food_id: v.id("foods"),
      name: v.string(),
      grams: v.number(),
      date: v.string(),
      slot: mealSlotValidator,
    }),
  ),
  handler: async (ctx, { userId, days }) => {
    const span = Math.min(MAX_RECENT_DAYS, Math.max(1, Math.floor(Number.isFinite(days) ? days : 1)));
    const today = (await resolveLocalDay(ctx, userId, Date.now())).localDate;
    const out: { entry_id: Id<"entries">; food_id: Id<"foods">; name: string; grams: number; date: string; slot: MealSlot }[] = [];
    for (let back = 0; back < span; back++) {
      const date = addDays(today, -back);
      const rows = await ctx.db
        .query("entries")
        .withIndex("by_userId_and_localDate_and_status", (q) =>
          q.eq("userId", userId).eq("localDate", date).eq("status", "live"),
        )
        .take(MAX_DAY_ENTRIES);
      for (const row of rows) {
        out.push({ entry_id: row._id, food_id: row.foodId, name: row.foodName, grams: row.grams, date, slot: row.slot });
      }
    }
    return out.slice(0, 60);
  },
});

/**
 * Runs one D14 lookup tool and returns its JSON result, or undefined when `name` is not a lookup tool.
 * Food ids in the result are added to `seen`.
 */
export async function runLookupTool(
  ctx: ActionCtx,
  userId: string,
  name: string,
  args: Record<string, unknown>,
  seen: SeenFoods,
): Promise<JsonValue | undefined> {
  try {
    switch (name) {
      case "search_food": {
        if (typeof args.query !== "string") return { error: "query must be a string" };
        const rows = await ctx.runQuery(internal.pipeline.tools.toolSearchFoods, { userId, query: args.query });
        remember(seen, rows.map((r) => r.food_id));
        return rows;
      }
      case "lookup_barcode": {
        if (typeof args.barcode !== "string") return { error: "barcode must be a string" };
        const food = await lookupBarcodeFood(ctx, args.barcode);
        if (food === null) return { error: "No usable product for this barcode" };
        remember(seen, [food.foodId]);
        return { food_id: food.foodId, name: food.name, serving_grams: food.servingGrams };
      }
      case "get_portion_weights": {
        if (typeof args.food_id !== "string") return { error: "food_id must be a string" };
        return (await ctx.runQuery(internal.pipeline.tools.toolPortionWeights, { userId, foodId: args.food_id })) ?? {
          error: "Unknown food_id",
        };
      }
      case "get_user_foods": {
        const rows = await ctx.runQuery(internal.pipeline.tools.toolUserFoods, { userId });
        remember(seen, rows.map((r) => r.food_id));
        return rows;
      }
      case "recent_entries": {
        const days = typeof args.days === "number" ? args.days : 3;
        const rows = await ctx.runQuery(internal.pipeline.tools.toolRecentEntries, { userId, days });
        remember(seen, rows.map((r) => r.food_id));
        return rows;
      }
      default:
        return undefined;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Applies a `choose_food` call when the item is open and the id was seen; returns the tool result. */
function choose(
  args: Record<string, unknown>,
  open: ReadonlySet<number>,
  seen: SeenFoods,
  picks: Map<number, Id<"foods">>,
): JsonValue {
  const index = args.item_index;
  const foodId = typeof args.food_id === "string" ? seen.get(args.food_id) : undefined;
  if (typeof index !== "number" || !open.has(index)) return { ok: false, error: "item_index is not an unresolved item" };
  if (foodId === undefined) return { ok: false, error: "food_id was not returned by a tool or listed as a candidate" };
  picks.set(index, foodId);
  return { ok: true };
}

/**
 * D14 second pass for items the matcher could not place. A bounded loop of luna calls with lookup tools;
 * the model picks food ids, never numbers. Returns the picks; the commit mutation re-checks and gates them.
 */
export async function runToolPass(ctx: ActionCtx, userId: string, unresolved: readonly UnresolvedItem[]): Promise<Pick[]> {
  if (unresolved.length === 0) return [];
  const seen: SeenFoods = new Map();
  remember(seen, unresolved.flatMap((u) => u.candidates.map((c) => c.foodId)));
  const open = new Set(unresolved.map((u) => u.index));
  const picks = new Map<number, Id<"foods">>();
  const items = unresolved.map((u) => ({
    item_index: u.index,
    food: u.food,
    quantity: u.quantity,
    unit: u.unit,
    candidates: u.candidates.map((c) => ({ food_id: c.foodId, name: c.name })),
  }));
  const messages: ChatMessage[] = [
    { role: "system", content: RESOLVE_PROMPT },
    { role: "user", content: JSON.stringify({ unresolved_items: items }) },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS && picks.size < open.size; i++) {
    const reply = await callOpenRouter(ctx, userId, {
      model: PIPELINE_MODEL,
      maxTokens: RESOLVE_MAX_TOKENS,
      messages,
      tools: [...LOOKUP_TOOLS, CHOOSE_FOOD_TOOL],
    });
    if (reply.toolCalls.length === 0) break;
    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const args = parseToolArgs(call.function.arguments);
      const result = call.function.name === "choose_food"
        ? choose(args, open, seen, picks)
        : (await runLookupTool(ctx, userId, call.function.name, args, seen)) ?? { error: `Unknown tool ${call.function.name}` };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return [...picks].map(([index, foodId]) => ({ index, foodId }));
}

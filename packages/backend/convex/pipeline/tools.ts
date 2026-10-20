import {
  addDays,
  HOUSEHOLD_VESSELS,
  MASS_UNITS_G,
  normalizeUnit,
  PIECE_UNIT,
  rankCandidates,
  type MealSlot,
  unitNamesFood,
  VOLUME_UNITS_ML,
} from "@stride/core";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx } from "../_generated/server";
import { MAX_DAY_ENTRIES } from "../day_totals";
import { isVisibleFood } from "../foods_db";
import { foodSourceValidator, mealSlotValidator } from "../ledger_validators";
import { resolveLocalDay } from "../time_zone";
import { assertLedgerWritable } from "../users";
import { lookupBarcodeFood } from "./barcode";
import { callOpenRouter, isRecord, PIPELINE_MODEL, type ChatMessage, type JsonValue, type ToolDefinition } from "./openrouter";
import { searchVisibleFoods, userFoodsOf, type Pick, type UnresolvedItem } from "./resolve";

/** Most model calls in one tool loop. The loop also stops when the model makes no tool call. */
export const MAX_TOOL_ITERATIONS = 4;
const MAX_TOOL_FOODS = 10;
const MAX_RECENT_DAYS = 7;
/** Most portion rows read for one estimated food. An estimate has a handful, one per unit it was saved with. */
const MAX_ESTIMATE_PORTIONS = 50;
const RESOLVE_MAX_TOKENS = 600;
/** Ceiling for the tool pass budget. Each open item can need its own estimate_food call, so the budget grows per item. */
const RESOLVE_MAX_TOKENS_CAP = 4000;

/** Output budget for one tool-pass call, scaled to the items still open. */
function resolveMaxTokens(openItems: number): number {
  return Math.min(RESOLVE_MAX_TOKENS_CAP, RESOLVE_MAX_TOKENS + 200 * openItems);
}

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

const ESTIMATE_FOOD_TOOL = tool(
  "estimate_food",
  "Estimate a food the database does not have in this form. grams and nutrients are for the whole stated amount of the item.",
  {
    item_index: { type: "number" },
    name: { type: "string" },
    grams: { type: "number" },
    kcal: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    assumptions: { type: "string" },
  },
  ["item_index", "name", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "assumptions"],
);

const RESOLVE_PROMPT = [
  "Some foods in a meal log did not match the food database. Find the right food for each item.",
  "Use the tools to search. Call choose_food only when a database row is the same dish in the same form",
  "(cooked vs raw, prepared drink vs powder or mix, plain vs flavoured). Otherwise call estimate_food with the",
  "typical Indian home or cafe version, for the whole stated amount of the item.",
  "Household sizes: katori 150 ml, bowl 250 ml, glass 250 ml, teacup (home chai or coffee cup) 110 ml, tbsp 15 ml, tsp 5 ml, spoon = tsp.",
  "A cafe drink with no size is a regular Indian cafe size. Give assumptions in at most 12 words.",
  "Skip items you cannot place; the user will be asked. Never make up a food id.",
].join(" ");

/** Vessel sizes in ml that an estimate's unit must match: the household vessels, plus cup and teacup. */
const ESTIMATE_VESSEL_ML: Readonly<Partial<Record<string, number>>> = {
  ...Object.fromEntries(Object.entries(HOUSEHOLD_VESSELS).map(([unit, vessel]) => [unit, vessel.ml])),
  cup: 240,
};

/** Dedupe key for an estimate's name. Unicode-safe, so Devanagari names stay distinct. */
export function estimateKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A table's number for a key, or undefined. Own properties only, so "constructor" is not a unit. */
function ownNumber(table: Readonly<Partial<Record<string, number>>>, key: string): number | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The fields of an `estimate_food` call. Numbers are for the whole stated amount of the item. */
export interface Estimate {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  assumptions: string;
}

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
    return { error: err instanceof ConvexError && typeof err.data?.message === "string" ? err.data.message : err instanceof Error ? err.message : String(err) };
  }
}

/** Applies a `choose_food` call when the item is open and the id was seen; returns the tool result. */
function choose(
  args: Record<string, unknown>,
  open: ReadonlyMap<number, UnresolvedItem>,
  seen: SeenFoods,
  picks: Map<number, Id<"foods">>,
): JsonValue {
  const index = args.item_index;
  const foodId = typeof args.food_id === "string" ? seen.get(args.food_id) : undefined;
  if (typeof index !== "number" || !open.has(index) || picks.has(index)) {
    return { ok: false, error: "item_index is not an unresolved item" };
  }
  if (foodId === undefined) return { ok: false, error: "food_id was not returned by a tool or listed as a candidate" };
  picks.set(index, foodId);
  return { ok: true };
}

/** Reads an `estimate_food` call's fields, or null when one is missing or has the wrong type. */
function parseEstimate(args: Record<string, unknown>): Estimate | null {
  const { name, grams, kcal, protein_g, carbs_g, fat_g, assumptions } = args;
  if (typeof name !== "string" || typeof assumptions !== "string") return null;
  if (typeof grams !== "number" || typeof kcal !== "number") return null;
  if (typeof protein_g !== "number" || typeof carbs_g !== "number" || typeof fat_g !== "number") return null;
  return { name: name.trim(), grams, kcal, protein: protein_g, carbs: carbs_g, fat: fat_g, assumptions: assumptions.trim() };
}

/** Why an estimate is refused, or null when it passes. Numbers are for the whole stated amount of `quantity` × `unit`. */
export function estimateProblem(e: Estimate, quantity: number, unit: string | null): string | null {
  if (![e.grams, e.kcal, e.protein, e.carbs, e.fat].every(Number.isFinite)) return "numbers must be finite";
  if (estimateKey(e.name) === "") return "name is empty";
  if (!(quantity > 0)) return "quantity must be above 0";
  if (!(e.grams > 0 && e.grams <= 2000)) return "grams must be above 0 and at most 2000";
  if (e.kcal < 0 || e.protein < 0 || e.carbs < 0 || e.fat < 0) return "nutrients cannot be negative";
  if (e.protein + e.carbs + e.fat > e.grams) return "protein, carbs and fat cannot weigh more than the grams";
  if ((e.kcal / e.grams) * 100 > 900) return "kcal per 100 g is above 900";
  const fromMacros = 4 * e.protein + 4 * e.carbs + 9 * e.fat;
  if (Math.abs(fromMacros - e.kcal) > 0.2 * Math.max(e.kcal, 50)) return "protein, carbs and fat do not add up to kcal";
  const name = normalizeUnit(unit);
  // A stated mass or volume is an explicit amount, so the grams must agree with it.
  const massG = ownNumber(MASS_UNITS_G, name);
  if (massG !== undefined && Math.abs(e.grams - quantity * massG) > 0.05 * quantity * massG) {
    return `grams do not match ${quantity} ${unit}`;
  }
  const volumeMl = ownNumber(VOLUME_UNITS_ML, name);
  if (volumeMl !== undefined) {
    // Light foods such as dry oats weigh about 0.3 g/ml, so the floor only rejects near-empty portions.
    const gramsPerMl = e.grams / (quantity * volumeMl);
    if (gramsPerMl < 0.05 || gramsPerMl > 1.5) return `grams do not match ${quantity} ${unit} of this food`;
  }
  const vesselMl = ownNumber(ESTIMATE_VESSEL_ML, name);
  if (vesselMl !== undefined) {
    const gramsPerUnit = e.grams / quantity;
    if (gramsPerUnit < 0.05 * vesselMl || gramsPerUnit > 1.6 * vesselMl) {
      return `grams do not fit one ${unit} (about ${vesselMl} ml)`;
    }
  }
  return null;
}

/** Saves an AI estimate as the user's private food, with one portion row for the item's unit. Returns the food id. */
export const saveEstimate = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    quantity: v.number(),
    unit: v.union(v.string(), v.null()),
    grams: v.number(),
    kcal: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    assumptions: v.string(),
    chatId: v.optional(v.id("chats")),
  },
  returns: v.id("foods"),
  handler: async (ctx, a) => {
    await assertLedgerWritable(ctx, a.userId);
    if (a.chatId !== undefined && (await ctx.db.get("chats", a.chatId))?.userId !== a.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Chat not found" });
    }
    // Identity is the name plus the saved values, so a different estimate of the same name gets its own row.
    const measure = a.unit === null || unitNamesFood(a.unit, a.name) ? PIECE_UNIT : normalizeUnit(a.unit);
    // Nutrients are stored per 100 g, like every other food.
    const per100 = (amount: number): number => (amount / a.grams) * 100;
    const identity = [
      Math.round(per100(a.kcal)),
      Math.round(per100(a.protein) * 10) / 10,
      Math.round(per100(a.carbs) * 10) / 10,
      Math.round(per100(a.fat) * 10) / 10,
      Math.round((a.grams / a.quantity) * 100) / 100,
    ];
    const sourceId = `${a.userId}:ai:${estimateKey(a.name)}:${identity.join(":")}`;
    // An identical estimate is one food, found by its exact sourceId. A repeat keeps the stored nutrients and note.
    const same = await ctx.db
      .query("foods")
      .withIndex("by_source_and_sourceId", (q) => q.eq("source", "ai_estimate").eq("sourceId", sourceId))
      .first();
    const foodId = same !== null && same.ownerUserId === a.userId ? same._id : await ctx.db.insert("foods", {
      name: a.name,
      aliases: [],
      searchText: a.name,
      per100g: {
        kcal: per100(a.kcal),
        protein: per100(a.protein),
        carbs: per100(a.carbs),
        fat: per100(a.fat),
        fiber: null,
        sugar: null,
        sodiumMg: null,
      },
      source: "ai_estimate",
      sourceId,
      verified: false,
      ownerUserId: a.userId,
      note: a.assumptions,
    });
    // A bare count or a unit that names the food is stored as "piece", so a later bare count finds it. The stated word stays as the description.
    // One row per measure: a reused food keeps the row it already has, so its counts never conflict.
    const rows = await ctx.db
      .query("food_portions")
      .withIndex("by_foodId_and_description", (q) => q.eq("foodId", foodId))
      .take(MAX_ESTIMATE_PORTIONS);
    if (!rows.some((row) => row.measure === measure)) {
      await ctx.db.insert("food_portions", {
        foodId,
        source: "ai_estimate",
        measure,
        description: normalizeUnit(a.unit),
        gramsPerMeasure: a.grams / a.quantity,
      });
    }
    return foodId;
  },
});

/** Applies an `estimate_food` call: checks the numbers, saves the estimate for the item, and picks it. Returns the tool result. */
async function estimate(
  ctx: ActionCtx,
  userId: string,
  args: Record<string, unknown>,
  open: ReadonlyMap<number, UnresolvedItem>,
  picks: Map<number, Id<"foods">>,
  chatId: Id<"chats"> | undefined,
): Promise<JsonValue> {
  const index = args.item_index;
  const item = typeof index === "number" && !picks.has(index) ? open.get(index) : undefined;
  if (typeof index !== "number" || item === undefined) return { ok: false, error: "item_index is not an unresolved item" };
  const parsed = parseEstimate(args);
  if (parsed === null) return { ok: false, error: "name, grams, kcal, protein_g, carbs_g, fat_g and assumptions are required" };
  const problem = estimateProblem(parsed, item.quantity, item.unit);
  if (problem !== null) return { ok: false, error: problem };
  const foodId: Id<"foods"> = await ctx.runMutation(internal.pipeline.tools.saveEstimate, {
    userId,
    quantity: item.quantity,
    unit: item.unit,
    ...parsed,
    ...(chatId === undefined ? {} : { chatId }),
  });
  picks.set(index, foodId);
  return { ok: true };
}

/**
 * D14 second pass for items the matcher could not place. A bounded loop of luna calls with lookup tools;
 * the model picks food ids, never numbers. Returns the picks; the commit mutation re-checks and gates them.
 */
export async function runToolPass(
  ctx: ActionCtx,
  userId: string,
  unresolved: readonly UnresolvedItem[],
  chatId?: Id<"chats">,
): Promise<Pick[]> {
  if (unresolved.length === 0) return [];
  const seen: SeenFoods = new Map();
  remember(seen, unresolved.flatMap((u) => u.candidates.map((c) => c.foodId)));
  const open = new Map(unresolved.map((u): [number, UnresolvedItem] => [u.index, u]));
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
      maxTokens: resolveMaxTokens(open.size - picks.size),
      messages,
      tools: [...LOOKUP_TOOLS, CHOOSE_FOOD_TOOL, ESTIMATE_FOOD_TOOL],
    });
    if (reply.toolCalls.length === 0) break;
    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const args = parseToolArgs(call.function.arguments);
      const name = call.function.name;
      const result = name === "choose_food"
        ? choose(args, open, seen, picks)
        : name === "estimate_food"
          ? await estimate(ctx, userId, args, open, picks, chatId)
          : (await runLookupTool(ctx, userId, name, args, seen)) ?? { error: `Unknown tool ${name}` };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return [...picks].map(([index, foodId]) => ({ index, foodId }));
}

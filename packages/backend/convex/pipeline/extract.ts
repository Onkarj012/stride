import type { MealSlot } from "@stride/core";
import { v, type Infer } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import { mealSlotValidator } from "../ledger_validators";
import { callOpenRouter, isRecord, PHOTO_MODEL, PIPELINE_MODEL, type ContentPart, type JsonValue } from "./openrouter";

/** Most items one log may hold. Matches the extraction schema's `maxItems`. */
export const MAX_EXTRACTED_ITEMS = 20;
const MAX_FOOD_CHARS = 120;
const EXTRACTION_MAX_TOKENS = 1_200;

/**
 * One extracted item (D10): what the user named and how much, never grams or nutrients.
 * `portionScale` is the eaten fraction of a stated recipe amount; `cookingOil` marks an oil or ghee the user named.
 */
export const extractedItemValidator = v.object({
  food: v.string(),
  quantity: v.number(),
  unit: v.union(v.string(), v.null()),
  slot: v.union(mealSlotValidator, v.null()),
  date: v.union(v.string(), v.null()),
  fromPhoto: v.boolean(),
  portionScale: v.union(v.number(), v.null()),
  cookingOil: v.boolean(),
  confidence: v.number(),
});
export type ExtractedItem = Infer<typeof extractedItemValidator>;

/** Item fields as a JSON schema. Shared by extraction and the chat `add_entry` tool so both feed one pipeline. */
export const ITEM_JSON_SCHEMA: { [key: string]: JsonValue } = {
  type: "object",
  additionalProperties: false,
  required: ["food", "quantity", "unit", "slot", "date", "fromPhoto", "portionScale", "cookingOil", "confidence"],
  properties: {
    food: { type: "string", description: "Food as the user named it, singular, no amount. e.g. 'roti', 'dal tadka'." },
    quantity: { type: "number", description: "Amount the user stated. 1 when they gave none." },
    unit: {
      type: ["string", "null"],
      description: "Unit as stated: g, ml, cup, katori, bowl, piece, tbsp, slice... null for a bare count like '2 rotis'.",
    },
    slot: { type: ["string", "null"], enum: ["breakfast", "lunch", "snack", "dinner", null] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD only when the user names another day. Else null." },
    fromPhoto: { type: "boolean", description: "True only for items seen in an attached photo." },
    portionScale: {
      type: ["number", "null"],
      description: "Fraction eaten of a whole recipe amount, e.g. 0.25 for 'a quarter of a 1 kg biryani'. Else null.",
    },
    cookingOil: { type: "boolean", description: "True for oil, ghee or butter the user said was used in cooking." },
    confidence: { type: "number", description: "0-1, how sure you are of this food and amount." },
  },
};

/** D13 structured output: `{items: [...]}`. OpenAI strict mode needs an object at the root. */
export const EXTRACTION_RESPONSE_FORMAT: { [key: string]: JsonValue } = {
  type: "json_schema",
  json_schema: {
    name: "food_log",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: { items: { type: "array", maxItems: MAX_EXTRACTED_ITEMS, items: ITEM_JSON_SCHEMA } },
    },
  },
};

/** Rules every extraction and chat turn follows. The model parses; the server finds grams and nutrients. */
export const PARSE_RULES = [
  "Split the input into separate foods. Use the user's words for each food.",
  "Never output grams you inferred, calories, protein, carbs or fat. Only the amount and unit the user said.",
  "If the user gives no amount, use quantity 1 and unit null.",
  "For part of a recipe ('a quarter of the 1 kg biryani') give the whole recipe amount and set portionScale.",
  "Only list cooking oil, ghee or butter when the user names it. Never add oil they did not mention.",
  "Leave slot and date null unless the user says them. Today and the current slot are given below.",
].join("\n");

/** What the extractor reads: text, and an image URL for photo logs. */
export interface ExtractionInput {
  text: string;
  imageUrl?: string;
  today: string;
  slot: MealSlot;
}

/** Builds the system prompt for one extraction call. */
function systemPrompt(input: ExtractionInput): string {
  return [
    "You extract foods from a meal log for a nutrition tracker.",
    PARSE_RULES,
    `Today is ${input.today}. The current meal slot is ${input.slot}.`,
    input.imageUrl === undefined ? "" : "A photo is attached. Mark foods seen in it with fromPhoto true.",
  ].join("\n");
}

/** Runs the D13 extraction call: luna for text, `PHOTO_MODEL` when an image is attached. */
export async function extractItems(ctx: ActionCtx, userId: string, input: ExtractionInput): Promise<ExtractedItem[]> {
  const userContent: string | ContentPart[] = input.imageUrl === undefined
    ? input.text
    : [
        { type: "text", text: input.text === "" ? "Log the food in this photo." : input.text },
        { type: "image_url", image_url: { url: input.imageUrl } },
      ];
  const reply = await callOpenRouter(ctx, userId, {
    model: input.imageUrl === undefined ? PIPELINE_MODEL : PHOTO_MODEL,
    maxTokens: EXTRACTION_MAX_TOKENS,
    responseFormat: EXTRACTION_RESPONSE_FORMAT,
    messages: [
      { role: "system", content: systemPrompt(input) },
      { role: "user", content: userContent },
    ],
  });
  if (reply.content === null) throw new Error("Extraction returned no content");
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.content);
  } catch {
    throw new Error("Extraction did not return JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) throw new Error("Extraction JSON has no items array");
  return parsed.items.slice(0, MAX_EXTRACTED_ITEMS).flatMap((raw) => {
    const item = parseItem(raw);
    return item === null ? [] : [item];
  });
}

const SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

/** True when a value is one of the four meal slots. */
function isSlot(value: unknown): value is MealSlot {
  return SLOTS.some((slot) => slot === value);
}

/**
 * Validates one item from the model or a chat tool call. Unknown fields (including any nutrient numbers) are
 * dropped. Returns null when there is no food name; a bad amount is kept so the resolver can ask about it.
 */
export function parseItem(raw: unknown): ExtractedItem | null {
  if (!isRecord(raw) || typeof raw.food !== "string") return null;
  const food = raw.food.trim().slice(0, MAX_FOOD_CHARS);
  if (food === "") return null;
  const quantity = typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : 1;
  const unit = typeof raw.unit === "string" && raw.unit.trim() !== "" ? raw.unit.trim().slice(0, 40) : null;
  const scale = raw.portionScale ?? raw.portion_scale;
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0;
  return {
    food,
    quantity,
    unit,
    slot: isSlot(raw.slot) ? raw.slot : null,
    date: typeof raw.date === "string" ? raw.date : null,
    fromPhoto: raw.fromPhoto === true,
    portionScale: typeof scale === "number" && Number.isFinite(scale) ? scale : null,
    cookingOil: raw.cookingOil === true || raw.cooking_oil === true,
    confidence,
  };
}

import {
  canonicalTokens,
  clampFlags,
  daysBetween,
  evaluateGate,
  expandSynonyms,
  isLocalDate,
  normalizeText,
  rankCandidates,
  resolvePortion,
  scaleNutrients,
  selectExactMatch,
  selectMatch,
  type GateItem,
  type MatchSelection,
  type MealSlot,
  type PortionResult,
  type RankedCandidate,
  type UserMeasure,
} from "@stride/core";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { insertEntries, MAX_BATCH, type NewEntry } from "../entries";
import { isVisibleFood, MAX_USER_FOODS, searchVisibleFoodRows } from "../foods_db";
import { inputKindValidator, matchSourceValidator } from "../ledger_validators";
import { resolveLocalDay } from "../time_zone";
import { assertLedgerWritable } from "../users";
import { extractedItemValidator, type ExtractedItem } from "./extract";

/** A confirmed food memory is the user's own choice, so it scores as an exact match. */
export const MEMORY_MATCH_SCORE = 1;
/** Score for a food the tool pass picked. Below the 0.85 gate on purpose: model picks always ask first. */
export const TOOL_PICK_SCORE = 0.8;
/** How far back an extracted date may go. Later dates are refused. */
export const MAX_PAST_DAYS = 30;
/** How long the client shows the undo toast after an auto-commit (D7). */
export const UNDO_WINDOW_MS = 10_000;

const MAX_SEARCH_ROWS = 25;
const MAX_SEARCH_TERMS = 16;
const MAX_CARD_CANDIDATES = 5;
const MAX_PORTION_ROWS = 50;
const MAX_USER_MEASURES = 50;
const MAX_LINKS_PER_KEY = 10;

export type InputKind = Infer<typeof inputKindValidator>;
type MatchSource = Infer<typeof matchSourceValidator>;
type Ctx = QueryCtx | MutationCtx;

/** A food the tool pass chose for one item, by index into the extracted items. */
export const pickValidator = v.object({ index: v.number(), foodId: v.id("foods") });
export type Pick = Infer<typeof pickValidator>;

/** Why an item cannot auto-commit: the core gate reasons plus the pipeline's own date and scale checks. */
export type ItemReason =
  | "unmatched"
  | "low_match"
  | "unresolved_portion"
  | "low_confidence"
  | "clamp_flag"
  | "invalid_date"
  | "invalid_portion_scale"
  | "ai_estimate"
  | "photo_amount"
  | "sugar_double_count"
  | "sugar_separate";

/** The matcher's answer for one item text. */
interface Match {
  food: Doc<"foods"> | null;
  score: number | null;
  source: MatchSource | null;
  candidates: Doc<"foods">[];
}

/** One item after matching, portion resolution and gating. */
export interface ResolvedItem {
  item: ExtractedItem;
  food: Doc<"foods"> | null;
  score: number | null;
  matchSource: MatchSource | null;
  candidates: Doc<"foods">[];
  portion: PortionResult;
  localDate: string | null;
  fromPhoto: boolean;
  confidence: number;
  reasons: ItemReason[];
  flags: string[];
}

/** One line of a log result card. Numbers come from `foods` × grams and are unrounded; the app rounds for display only. */
export const logLineValidator = v.object({
  text: v.string(),
  foodName: v.union(v.string(), v.null()),
  grams: v.union(v.number(), v.null()),
  kcal: v.union(v.number(), v.null()),
  reasons: v.array(v.string()),
  estimated: v.boolean(),
});
export type LogLine = Infer<typeof logLineValidator>;

/** What a log produced: committed entries with an undo window, a draft that asks, or nothing to log. */
export const logResultValidator = v.union(
  v.object({
    kind: v.literal("committed"),
    submissionId: v.string(),
    entryIds: v.array(v.id("entries")),
    undoUntil: v.number(),
    lines: v.array(logLineValidator),
  }),
  v.object({ kind: v.literal("draft"), submissionId: v.string(), draftId: v.id("drafts"), lines: v.array(logLineValidator) }),
  v.object({ kind: v.literal("empty"), submissionId: v.string(), lines: v.array(logLineValidator) }),
);
export type LogResult = Infer<typeof logResultValidator>;

/** Food memory key for an item text: canonical tokens, so "Rotis" and "chapati" share one memory. */
export function linkKey(text: string): string {
  return canonicalTokens(text).join(" ");
}

/** The newest active memory for a key whose food the user can still see, or null. Rejected and deleted rows never count. */
export async function activeLinkFood(ctx: Ctx, userId: string, key: string): Promise<Doc<"foods"> | null> {
  if (key === "") return null;
  const links = await ctx.db
    .query("food_links")
    .withIndex("by_userId_and_status_and_key", (q) => q.eq("userId", userId).eq("status", "active").eq("key", key))
    .take(MAX_LINKS_PER_KEY);
  const active = links.sort((a, b) => b.updatedAt - a.updatedAt);
  for (const link of active) {
    const food = await ctx.db.get("foods", link.foodId);
    if (food !== null && isVisibleFood(food, userId)) return food;
  }
  return null;
}

/** The caller's saved foods, bounded. AI estimates are not saved foods, so they are not listed. */
export async function userFoodsOf(ctx: Ctx, userId: string): Promise<Doc<"foods">[]> {
  return await ctx.db
    .query("foods")
    .withIndex("by_ownerUserId_and_source", (q) => q.eq("ownerUserId", userId).eq("source", "user"))
    .take(MAX_USER_FOODS);
}

/** Full-text search over the foods the user may see, with every synonym spelling of the text. */
export async function searchVisibleFoods(ctx: Ctx, userId: string, text: string): Promise<Doc<"foods">[]> {
  const terms = [...new Set(expandSynonyms(text).flatMap((variant) => variant.split(" ")))]
    .filter((term) => term !== "")
    .slice(0, MAX_SEARCH_TERMS);
  if (terms.length === 0) return [];
  return await searchVisibleFoodRows(ctx, userId, terms.join(" "), MAX_SEARCH_ROWS);
}

/** Foods a draft card offers when the match was ambiguous or missing: best scores first. */
function cardCandidates(
  selection: MatchSelection<Doc<"foods">>,
  ranked: RankedCandidate<Doc<"foods">>[],
): Doc<"foods">[] {
  const pool = selection.status === "ambiguous" ? selection.ranked : ranked.filter((r) => r.score > 0);
  return pool.slice(0, MAX_CARD_CANDIDATES).map((r) => r.candidate);
}

/** D5 matcher: user foods, then food memory, then the `foods` search index. First confident tier wins. */
async function matchFood(ctx: Ctx, userId: string, text: string, userFoods: Doc<"foods">[]): Promise<Match> {
  const userRanked = rankCandidates(text, userFoods);
  const userPick = selectMatch(userRanked);
  if (userPick.status === "matched") {
    return { food: userPick.candidate, score: userPick.score, source: "user_food", candidates: [] };
  }

  const remembered = await activeLinkFood(ctx, userId, linkKey(text));
  if (remembered !== null) return { food: remembered, score: MEMORY_MATCH_SCORE, source: "memory", candidates: [] };

  const ranked = rankCandidates(text, await searchVisibleFoods(ctx, userId, text));
  const pick = selectExactMatch(text, ranked);
  if (pick.status === "matched") return { food: pick.candidate, score: pick.score, source: "db", candidates: [] };
  const candidates = [...cardCandidates(userPick, userRanked), ...cardCandidates(pick, ranked)];
  const unique = candidates.filter((food, i) => candidates.findIndex((other) => other._id === food._id) === i);
  return { food: null, score: null, source: null, candidates: unique.slice(0, MAX_CARD_CANDIDATES) };
}

/** The user's own measures (my katori, my roti) in core form. */
export async function userMeasuresOf(ctx: Ctx, userId: string): Promise<UserMeasure[]> {
  const rows = await ctx.db
    .query("user_measures")
    .withIndex("by_userId_and_measure", (q) => q.eq("userId", userId))
    .take(MAX_USER_MEASURES);
  return rows.flatMap((row): UserMeasure[] => {
    if (row.grams !== undefined && row.grams > 0) return [{ measure: row.measure, grams: row.grams }];
    if (row.ml !== undefined && row.ml > 0) return [{ measure: row.measure, ml: row.ml }];
    return [];
  });
}

/** A food's `food_portions` rows, bounded. */
export async function portionsOf(ctx: Ctx, foodId: Id<"foods">): Promise<Doc<"food_portions">[]> {
  return ctx.db
    .query("food_portions")
    .withIndex("by_foodId_and_description", (q) => q.eq("foodId", foodId))
    .take(MAX_PORTION_ROWS);
}

/**
 * Grams for a quantity and unit of one food, from already-loaded portion rows, in the core resolver's order.
 * An AI estimate skips the seed piece weights, so its own rows decide its grams.
 */
export function resolveWithPortions(
  food: Doc<"foods">,
  portions: readonly Doc<"food_portions">[],
  quantity: number,
  unit: string | null,
  userMeasures: UserMeasure[],
): PortionResult {
  return resolvePortion({ quantity, unit }, {
    foodName: food.name,
    portions,
    userMeasures,
    skipSeedPieceWeights: food.source === "ai_estimate",
  });
}

/** Grams for a quantity and unit of one food, from its portions, the user's measures and the density tables. */
export async function resolveFoodPortion(
  ctx: Ctx,
  food: Doc<"foods">,
  quantity: number,
  unit: string | null,
  userMeasures: UserMeasure[],
): Promise<PortionResult> {
  return resolveWithPortions(food, await portionsOf(ctx, food._id), quantity, unit, userMeasures);
}

/** True for a usable recipe fraction: above 0 and at most the whole recipe. */
export function validScale(scale: number): boolean {
  return Number.isFinite(scale) && scale > 0 && scale <= 1;
}

const BEVERAGE_TERMS = [
  "chai", "tea", "coffee", "cappuccino", "latte", "lassi", "milkshake", "shake", "juice", "cola", "soda",
  "cold drink", "nimbu pani", "sharbat", "frappe", "smoothie",
];
const SUGAR_ITEMS = new Set(
  ["sugar", "white sugar", "brown sugar", "shakkar", "cheeni", "jaggery", "gur", "honey", "sweetener"].map(normalizeText),
);
/** Phrases that rule out a sweet drink: no added sugar, or a solid food that has a drink word. Whole phrases only. */
const NOT_SWEET_PHRASES = [
  "sugar free", "no sugar", "no added sugar", "without sugar", "without added sugar", "zero sugar", "unsweetened", "diet",
  "biscuit", "cookie", "cookies", "cake", "ice cream", "kulfi", "candy", "toffee", "bar", "powder", "granules", "mix",
];

/** True when a name has one of the phrases as whole words, so "tea" matches "Tea, black" but not "steak". */
function namesPhrase(names: readonly string[], phrases: readonly string[]): boolean {
  return names.some((name) => {
    const padded = ` ${normalizeText(name)} `;
    return phrases.some((phrase) => padded.includes(` ${normalizeText(phrase)} `));
  });
}

/** A sweet drink: a beverage name with sugar in the DB row, and no "sugar free", "unsweetened" or "diet" in the name. */
function isSweetDrink(item: SugarCandidate): boolean {
  const names = [item.text, ...(item.foodName === null ? [] : [item.foodName])];
  return item.sugarPer100g !== null && item.sugarPer100g > 0 && namesPhrase(names, BEVERAGE_TERMS) && !namesPhrase(names, NOT_SWEET_PHRASES);
}

/** A standalone sweetener: a sugar word as the whole typed item or the matched food's first segment, and the matched food has sugar (or is unmatched). */
function isStandaloneSugar(item: SugarCandidate): boolean {
  const segment = item.foodName?.split(",")[0] ?? "";
  const named = SUGAR_ITEMS.has(normalizeText(item.text)) || SUGAR_ITEMS.has(normalizeText(segment));
  return named && (item.foodName === null || (item.sugarPer100g ?? 0) > 0);
}

/** One item's typed text, its matched food name (null when unmatched), and the sugar per 100 g of its matched food. */
export interface SugarCandidate {
  text: string;
  foodName: string | null;
  sugarPer100g: number | null;
}

/**
 * Sweet drinks and standalone sugar items in one input, when both exist. Empty lists mean no possible double count.
 */
export function sugarOverlap(items: readonly SugarCandidate[]): { drinks: number[]; sugars: number[] } {
  const drinks = items.flatMap((item, i) => (isSweetDrink(item) ? [i] : []));
  const sugars = items.flatMap((item, i) => (isStandaloneSugar(item) ? [i] : []));
  return drinks.length > 0 && sugars.length > 0 ? { drinks, sugars } : { drinks: [], sugars: [] };
}

/** Matches, resolves and gates every item. Runs in a query for the preview and again in the commit mutation. */
export async function resolveItems(
  ctx: Ctx,
  userId: string,
  inputKind: InputKind,
  items: readonly ExtractedItem[],
  picks: readonly Pick[],
  today: string,
): Promise<{ resolved: ResolvedItem[]; commit: boolean }> {
  const userFoods = await userFoodsOf(ctx, userId);
  const userMeasures = await userMeasuresOf(ctx, userId);
  const resolved: ResolvedItem[] = [];
  const gateItems: GateItem[] = [];

  for (const [index, item] of items.entries()) {
    const pick = picks.find((p) => p.index === index);
    const picked = pick === undefined ? null : await ctx.db.get("foods", pick.foodId);
    const match: Match = picked !== null && isVisibleFood(picked, userId)
      ? { food: picked, score: TOOL_PICK_SCORE, source: "tool", candidates: [] }
      : await matchFood(ctx, userId, item.food, userFoods);

    const reasons: ItemReason[] = [];
    const flags: string[] = [];
    let portion: PortionResult = { status: "unresolved", reason: "invalid_quantity" };
    if (match.food !== null && item.quantity !== null) {
      portion = await resolveFoodPortion(ctx, match.food, item.quantity, item.unit, userMeasures);
      if (item.portionScale !== null) {
        if (!validScale(item.portionScale)) reasons.push("invalid_portion_scale");
        else if (portion.status === "resolved") {
          portion = { ...portion, grams: portion.grams * item.portionScale };
          flags.push("portion_scale");
        }
      }
    }

    let localDate: string | null = null;
    if (item.date !== null) {
      const ago = isLocalDate(item.date) ? daysBetween(item.date, today) : -1;
      if (ago >= 0 && ago <= MAX_PAST_DAYS) localDate = item.date;
      else reasons.push("invalid_date");
    }

    const fromPhoto = inputKind === "photo" && item.fromPhoto;
    // An amount the model read from the image always waits for the user's review, bare counts included.
    if (fromPhoto && item.amountFromImage) reasons.push("photo_amount");
    // An AI estimate stays on the draft the first time (tool pick), then auto-commits from memory with the flag.
    const aiEstimate = match.food?.source === "ai_estimate";
    if (aiEstimate && match.source === "tool") reasons.push("ai_estimate");
    if (fromPhoto) flags.push("photo");
    if (fromPhoto || aiEstimate) flags.push("estimated");
    if (item.cookingOil) flags.push("cooking_oil");
    const clamp = match.food !== null && portion.status === "resolved"
      ? clampFlags(portion.grams, scaleNutrients(match.food.per100g, portion.grams))
      : [];
    flags.push(...clamp);
    gateItems.push({
      source: fromPhoto ? "photo" : inputKind === "voice" ? "voice" : "text",
      extractionConfidence: item.confidence,
      matchScore: match.food === null ? null : match.score,
      portion,
      flags: clamp,
    });
    resolved.push({
      item,
      food: match.food,
      score: match.score,
      matchSource: match.source,
      candidates: match.candidates,
      portion,
      localDate,
      fromPhoto,
      confidence: 0,
      reasons,
      flags,
    });
  }

  const gate = evaluateGate(gateItems);
  resolved.forEach((r, i) => {
    const gated = gate.items[i];
    if (gated === undefined) return;
    r.confidence = gated.confidence;
    r.reasons = [...gated.reasons, ...r.reasons];
  });
  const overlap = sugarOverlap(
    resolved.map((r) => ({
      text: r.item.food,
      foodName: r.food?.name ?? null,
      sugarPer100g: r.food?.per100g.sugar ?? null,
    })),
  );
  resolved.forEach((r, i) => {
    if (overlap.drinks.includes(i)) r.reasons.push("sugar_double_count");
    if (overlap.sugars.includes(i)) r.reasons.push("sugar_separate");
  });
  const commit = gate.decision === "commit" && resolved.every((r) => r.reasons.length === 0);
  return { resolved, commit };
}

/** Today's local date and slot for a user, from the D15 resolver. */
async function todayOf(ctx: Ctx, userId: string): Promise<{ localDate: string; slot: MealSlot }> {
  const day = await resolveLocalDay(ctx, userId, Date.now());
  return { localDate: day.localDate, slot: day.slot };
}

/** Card lines for committed entries. */
async function entryLines(ctx: Ctx, ids: readonly Id<"entries">[]): Promise<LogLine[]> {
  const lines: LogLine[] = [];
  for (const id of ids) {
    const row = await ctx.db.get("entries", id);
    if (row === null) continue;
    lines.push({
      text: row.foodName,
      foodName: row.foodName,
      grams: row.grams,
      kcal: row.nutrients.kcal,
      reasons: [],
      estimated: row.flags.includes("estimated"),
    });
  }
  return lines;
}

/** Card lines for a draft, with kcal recomputed from `foods` × grams. */
export async function draftLines(ctx: Ctx, draft: Doc<"drafts">): Promise<LogLine[]> {
  const lines: LogLine[] = [];
  for (const item of draft.items) {
    const food = item.foodId === undefined ? null : await ctx.db.get("foods", item.foodId);
    lines.push({
      text: item.text,
      foodName: food?.name ?? null,
      grams: item.grams ?? null,
      kcal: food !== null && item.grams !== undefined ? scaleNutrients(food.per100g, item.grams).kcal : null,
      reasons: item.reasons ?? [],
      estimated: item.fromPhoto === true || food?.source === "ai_estimate",
    });
  }
  return lines;
}

/** Result for entries already added under a submission, or null when there are none. */
export async function committedResult(ctx: Ctx, userId: string, submissionId: string): Promise<LogResult | null> {
  const rows = await ctx.db
    .query("entries")
    .withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", submissionId))
    .take(MAX_BATCH);
  const added = rows.filter((row) => row.op === "add");
  const first = added[0];
  if (first === undefined) return null;
  const entryIds = added.map((row) => row._id);
  return {
    kind: "committed",
    submissionId,
    entryIds,
    undoUntil: first._creationTime + UNDO_WINDOW_MS,
    lines: await entryLines(ctx, entryIds),
  };
}

/** The stored result of an earlier log with this submission id, or null on first use. */
async function existingLog(ctx: Ctx, userId: string, submissionId: string): Promise<LogResult | null> {
  const draft = await ctx.db
    .query("drafts")
    .withIndex("by_userId_and_submissionId", (q) => q.eq("userId", userId).eq("submissionId", submissionId))
    .first();
  if (draft !== null && draft.status !== "committed") {
    return { kind: "draft", submissionId, draftId: draft._id, lines: await draftLines(ctx, draft) };
  }
  return await committedResult(ctx, userId, submissionId);
}

/** Maps the matcher tier to the ledger's entry source. */
export function entrySource(source: MatchSource | undefined | null): NewEntry["source"] {
  if (source === "memory") return "memory";
  if (source === "tool") return "ai";
  return "db";
}

/** Earlier result for a submission id, so a retried log never calls the model again. */
export const findLog = internalQuery({
  args: { userId: v.string(), submissionId: v.string() },
  returns: v.union(logResultValidator, v.null()),
  handler: async (ctx, { userId, submissionId }) => await existingLog(ctx, userId, submissionId),
});

/** Today's date and slot for the extraction prompt. Throws when the user has no time zone yet. */
export const logContext = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    localDate: v.string(),
    slot: v.union(v.literal("breakfast"), v.literal("lunch"), v.literal("snack"), v.literal("dinner")),
  }),
  handler: async (ctx, { userId }) => await todayOf(ctx, userId),
});

/** One item the matcher could not place, with the foods a second pass may choose from. */
export const unresolvedItemValidator = v.object({
  index: v.number(),
  food: v.string(),
  quantity: v.union(v.number(), v.null()),
  unit: v.union(v.string(), v.null()),
  candidates: v.array(v.object({ foodId: v.id("foods"), name: v.string() })),
});
export type UnresolvedItem = Infer<typeof unresolvedItemValidator>;

/** Dry run of the matcher: which items have no food yet. Writes nothing. */
export const previewLog = internalQuery({
  args: { userId: v.string(), inputKind: inputKindValidator, items: v.array(extractedItemValidator) },
  returns: v.array(unresolvedItemValidator),
  handler: async (ctx, { userId, inputKind, items }) => {
    const today = await todayOf(ctx, userId);
    const { resolved } = await resolveItems(ctx, userId, inputKind, items, [], today.localDate);
    return resolved.flatMap((r, index): UnresolvedItem[] =>
      r.food !== null
        ? []
        : [{
            index,
            food: r.item.food,
            quantity: r.item.quantity,
            unit: r.item.unit,
            candidates: r.candidates.map((food) => ({ foodId: food._id, name: food.name })),
          }],
    );
  },
});

/**
 * D7 gate and commit, in one transaction: every item passes → entries (createdBy "ai") with an undo window;
 * otherwise one `drafts` row that asks. Nutrients are computed by `insertEntries` from `foods` × grams.
 * Same submission id twice returns the first result.
 */
export const commitLog = internalMutation({
  args: {
    userId: v.string(),
    submissionId: v.string(),
    inputKind: inputKindValidator,
    items: v.array(extractedItemValidator),
    picks: v.array(pickValidator),
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
  },
  returns: logResultValidator,
  handler: async (ctx, args): Promise<LogResult> => {
    const { userId, submissionId, inputKind, items, picks } = args;
    await assertLedgerWritable(ctx, userId);
    const existing = await existingLog(ctx, userId, submissionId);
    if (existing !== null) return existing;
    // A chat turn can outlive its chat (deleted, or cleared with the account). Its late writes must not reappear.
    if (args.chatId !== undefined && (await ctx.db.get("chats", args.chatId))?.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Chat not found" });
    if (args.messageId !== undefined && (await ctx.db.get("messages", args.messageId))?.userId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Message not found" });
    }
    if (items.length === 0) return { kind: "empty", submissionId, lines: [] };
    const links = {
      ...(args.chatId === undefined ? {} : { chatId: args.chatId }),
      ...(args.messageId === undefined ? {} : { messageId: args.messageId }),
    };

    const today = await todayOf(ctx, userId);
    const { resolved, commit } = await resolveItems(ctx, userId, inputKind, items, picks, today.localDate);
    if (commit) {
      const entries: NewEntry[] = resolved.flatMap((r): NewEntry[] =>
        r.food === null || r.portion.status !== "resolved"
          ? []
          : [{
              foodId: r.food._id,
              grams: r.portion.grams,
              source: entrySource(r.matchSource),
              confidence: r.confidence,
              flags: r.flags,
              ...(r.item.slot === null ? {} : { slot: r.item.slot }),
              ...(r.localDate === null ? {} : { localDate: r.localDate }),
            }],
      );
      await insertEntries(ctx, userId, submissionId, entries, { createdBy: "ai", ...links });
      const result = await committedResult(ctx, userId, submissionId);
      if (result === null) throw new Error("Committed entries are missing");
      return result;
    }

    const draftId = await ctx.db.insert("drafts", {
      userId,
      submissionId,
      status: "pending",
      inputKind,
      createdAt: Date.now(),
      ...links,
      items: resolved.map((r) => ({
        text: r.item.food,
        ...(r.item.quantity === null ? {} : { quantity: r.item.quantity }),
        ...(r.item.unit === null ? {} : { unit: r.item.unit }),
        // Defaults are fixed now, so a later confirm cannot move the meal to the confirm-time day or slot.
        slot: r.item.slot ?? today.slot,
        ...(r.item.date !== null && r.localDate === null
          ? { requestedDate: r.item.date }
          : { localDate: r.localDate ?? today.localDate }),
        ...(r.food === null ? { unresolved: "no_food" } : { foodId: r.food._id }),
        ...(r.portion.status === "resolved"
          ? { grams: r.portion.grams }
          : r.food === null ? {} : { unresolved: r.portion.reason }),
        ...(r.score === null ? {} : { score: r.score }),
        ...(r.item.portionScale === null ? {} : { portionScale: r.item.portionScale }),
        ...(r.matchSource === null ? {} : { matchSource: r.matchSource }),
        cookingOil: r.item.cookingOil,
        fromPhoto: r.fromPhoto,
        confidence: r.confidence,
        reasons: r.reasons,
        // A matched estimate is offered again in the picker, since search does not show estimates.
        candidateIds: [
          ...r.candidates.map((food) => food._id),
          ...(r.food !== null && r.food.source === "ai_estimate" && !r.candidates.some((food) => food._id === r.food?._id)
            ? [r.food._id]
            : []),
        ],
      })),
    });
    const draft = await ctx.db.get("drafts", draftId);
    if (draft === null) throw new Error("Draft is missing");
    return { kind: "draft", submissionId, draftId, lines: await draftLines(ctx, draft) };
  },
});

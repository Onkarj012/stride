import { daysBetween, isLocalDate, roundNutrients, scaleNutrients } from "@stride/core";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { insertEntries, type NewEntry } from "../entries";
import { isVisibleFood } from "../foods_db";
import { inputKindValidator, mealSlotValidator, nutrientsValidator } from "../ledger_validators";
import { requireUserId, resolveLocalDay } from "../time_zone";
import { assertLedgerWritable } from "../users";
import {
  committedResult,
  draftLines,
  entrySource,
  linkKey,
  logResultValidator,
  MAX_PAST_DAYS,
  resolveFoodPortion,
  userMeasuresOf,
  validScale,
  type LogResult,
} from "./resolve";

const MAX_PENDING_DRAFTS = 20;
const MAX_LINKS_LISTED = 100;

/** One user change to a draft item. Corrections are food choices and amounts; nutrients are always recomputed. */
const correctionValidator = v.object({
  index: v.number(),
  remove: v.optional(v.boolean()),
  foodId: v.optional(v.id("foods")),
  grams: v.optional(v.number()),
  /** A kcal figure typed into the card. Converted to grams of the chosen food, so the stored kcal matches it. */
  kcal: v.optional(v.number()),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
  /** YYYY-MM-DD within the last `MAX_PAST_DAYS` days. Required when the extracted date was refused. */
  localDate: v.optional(v.string()),
});

/** Draft card item: the extracted text, the chosen food, grams and a preview computed from `foods` × grams. */
const draftItemViewValidator = v.object({
  text: v.string(),
  quantity: v.union(v.number(), v.null()),
  unit: v.union(v.string(), v.null()),
  slot: v.union(mealSlotValidator, v.null()),
  localDate: v.union(v.string(), v.null()),
  requestedDate: v.union(v.string(), v.null()),
  food: v.union(v.object({ _id: v.id("foods"), name: v.string() }), v.null()),
  grams: v.union(v.number(), v.null()),
  preview: v.union(nutrientsValidator, v.null()),
  unresolved: v.union(v.string(), v.null()),
  reasons: v.array(v.string()),
  estimated: v.boolean(),
  cookingOil: v.boolean(),
  candidates: v.array(v.object({ _id: v.id("foods"), name: v.string() })),
});

const draftViewValidator = v.object({
  _id: v.id("drafts"),
  submissionId: v.string(),
  status: v.union(v.literal("pending"), v.literal("committed"), v.literal("discarded"), v.literal("expired")),
  inputKind: v.union(inputKindValidator, v.null()),
  createdAt: v.number(),
  items: v.array(draftItemViewValidator),
});

/** Loads one of the caller's drafts or throws. */
async function ownDraft(ctx: MutationCtx, userId: string, draftId: Id<"drafts">): Promise<Doc<"drafts">> {
  const draft = await ctx.db.get("drafts", draftId);
  if (draft === null || draft.userId !== userId) throw new Error("Draft not found");
  return draft;
}

/** Loads a food the user may log, or throws with the item number for the card. */
async function requireVisibleFood(ctx: MutationCtx, userId: string, foodId: Id<"foods">, n: number): Promise<Doc<"foods">> {
  const food = await ctx.db.get("foods", foodId);
  if (food === null || !isVisibleFood(food, userId)) throw new Error(`Item ${n}: unknown food`);
  return food;
}

/** Remembers that this text means this food. Older memories for the text that point elsewhere become rejected. */
async function rememberLink(ctx: MutationCtx, userId: string, text: string, foodId: Id<"foods">): Promise<void> {
  const key = linkKey(text);
  if (key === "") return;
  // Only active rows are read, so old rejected and deleted rows never crowd a newer choice out of the window.
  const rows = await ctx.db
    .query("food_links")
    .withIndex("by_userId_and_status_and_key", (q) => q.eq("userId", userId).eq("status", "active").eq("key", key))
    .take(10);
  const now = Date.now();
  for (const row of rows) {
    if (row.foodId !== foodId) await ctx.db.patch("food_links", row._id, { status: "rejected", updatedAt: now });
  }
  const same = rows.find((row) => row.foodId === foodId);
  if (same !== undefined) await ctx.db.patch("food_links", same._id, { status: "active", uses: same.uses + 1, updatedAt: now });
  else await ctx.db.insert("food_links", { userId, key, foodId, status: "active", uses: 1, updatedAt: now });
}

/** One draft for its card, with preview nutrients computed from `foods` × grams and rounded once. */
export const getDraft = query({
  args: { draftId: v.id("drafts") },
  returns: v.union(draftViewValidator, v.null()),
  handler: async (ctx, { draftId }) => {
    const userId = await requireUserId(ctx);
    const draft = await ctx.db.get("drafts", draftId);
    if (draft === null || draft.userId !== userId) return null;
    const items: Infer<typeof draftItemViewValidator>[] = [];
    for (const item of draft.items) {
      const food = item.foodId === undefined ? null : await ctx.db.get("foods", item.foodId);
      const candidates: { _id: Id<"foods">; name: string }[] = [];
      for (const id of item.candidateIds ?? []) {
        const candidate = await ctx.db.get("foods", id);
        if (candidate !== null && isVisibleFood(candidate, userId)) candidates.push({ _id: candidate._id, name: candidate.name });
      }
      items.push({
        text: item.text,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        slot: item.slot ?? null,
        localDate: item.localDate ?? null,
        requestedDate: item.requestedDate ?? null,
        food: food === null ? null : { _id: food._id, name: food.name },
        grams: item.grams ?? null,
        preview: food !== null && item.grams !== undefined ? roundNutrients(scaleNutrients(food.per100g, item.grams)) : null,
        unresolved: item.unresolved ?? null,
        reasons: item.reasons ?? [],
        estimated: item.fromPhoto === true,
        cookingOil: item.cookingOil === true,
        candidates,
      });
    }
    return {
      _id: draft._id,
      submissionId: draft.submissionId,
      status: draft.status,
      inputKind: draft.inputKind ?? null,
      createdAt: draft.createdAt,
      items,
    };
  },
});

/** The caller's drafts still waiting for an answer, newest first. */
export const listPendingDrafts = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("drafts"), createdAt: v.number(), itemCount: v.number() })),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("drafts")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "pending"))
      .order("desc")
      .take(MAX_PENDING_DRAFTS);
    return rows.map((row) => ({ _id: row._id, createdAt: row.createdAt, itemCount: row.items.length }));
  },
});

/**
 * Commits a draft with the user's corrections. Every kept item needs a food and an amount; an unresolved item is
 * never logged as 0 kcal (HANDOFF #4), it must be fixed or removed. The confirmed text-to-food choices become
 * food memory. Confirming twice returns the same entries.
 */
export const confirmDraft = mutation({
  args: { draftId: v.id("drafts"), corrections: v.optional(v.array(correctionValidator)) },
  returns: logResultValidator,
  handler: async (ctx, { draftId, corrections }): Promise<LogResult> => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const draft = await ownDraft(ctx, userId, draftId);
    if (draft.status === "committed") {
      const done = await committedResult(ctx, userId, draft.submissionId);
      if (done !== null) return done;
    }
    if (draft.status !== "pending") throw new Error(`Draft is ${draft.status}`);

    const userMeasures = await userMeasuresOf(ctx, userId);
    const today = (await resolveLocalDay(ctx, userId, Date.now())).localDate;
    const entries: NewEntry[] = [];
    const links: { text: string; foodId: Id<"foods"> }[] = [];
    for (const [index, item] of draft.items.entries()) {
      const n = index + 1;
      const fix = (corrections ?? []).find((c) => c.index === index);
      if (fix?.remove === true) continue;
      const foodId = fix?.foodId ?? item.foodId;
      if (foodId === undefined) throw new Error(`Item ${n} ("${item.text}") needs a food. Pick one or remove it.`);
      const food = await requireVisibleFood(ctx, userId, foodId, n);
      const foodChanged = foodId !== item.foodId;
      // An out-of-range fraction was refused at extraction, so it never scales the grams here either.
      const scale = item.portionScale !== undefined && validScale(item.portionScale) ? item.portionScale : undefined;

      let grams: number | undefined;
      if (fix?.grams !== undefined) grams = fix.grams;
      else if (fix?.kcal !== undefined) {
        if (!(food.per100g.kcal > 0)) throw new Error(`Item ${n}: ${food.name} has no kcal, so set grams instead`);
        grams = (fix.kcal / food.per100g.kcal) * 100;
      } else if (fix?.quantity !== undefined || fix?.unit !== undefined || (foodChanged && item.quantity !== undefined)) {
        const quantity = fix?.quantity ?? item.quantity ?? 1;
        const portion = await resolveFoodPortion(ctx, food, quantity, fix?.unit ?? item.unit ?? null, userMeasures);
        if (portion.status !== "resolved") throw new Error(`Item ${n}: cannot turn that amount into grams. Enter grams.`);
        grams = fix?.quantity === undefined && scale !== undefined ? portion.grams * scale : portion.grams;
      } else grams = item.grams;
      if (grams === undefined) throw new Error(`Item ${n} ("${item.text}") needs an amount.`);

      let localDate = item.localDate;
      if (fix?.localDate !== undefined) {
        const ago = isLocalDate(fix.localDate) ? daysBetween(fix.localDate, today) : -1;
        if (ago < 0 || ago > MAX_PAST_DAYS) throw new Error(`Item ${n}: pick a date within the last ${MAX_PAST_DAYS} days.`);
        localDate = fix.localDate;
      } else if (item.requestedDate !== undefined) {
        throw new Error(`Item ${n} ("${item.text}"): ${item.requestedDate} cannot be logged. Pick a date or remove it.`);
      }

      const corrected = fix !== undefined;
      entries.push({
        foodId,
        grams,
        source: corrected && fix.foodId !== undefined ? "db" : entrySource(item.matchSource),
        confidence: corrected ? 1 : item.confidence ?? 1,
        flags: [
          ...(item.fromPhoto === true ? ["estimated"] : []),
          ...(item.cookingOil === true ? ["cooking_oil"] : []),
          ...(scale !== undefined && !corrected ? ["portion_scale"] : []),
          ...(corrected ? ["user_corrected"] : []),
        ],
        ...(item.slot === undefined ? {} : { slot: item.slot }),
        ...(localDate === undefined ? {} : { localDate }),
      });
      links.push({ text: item.text, foodId });
    }
    if (entries.length === 0) throw new Error("Nothing left to log. Discard the draft instead.");

    await insertEntries(ctx, userId, draft.submissionId, entries, {
      createdBy: "user",
      ...(draft.chatId === undefined ? {} : { chatId: draft.chatId }),
      ...(draft.messageId === undefined ? {} : { messageId: draft.messageId }),
    });
    for (const link of links) await rememberLink(ctx, userId, link.text, link.foodId);
    await ctx.db.patch("drafts", draft._id, { status: "committed", resolvedAt: Date.now() });
    const result = await committedResult(ctx, userId, draft.submissionId);
    if (result === null) throw new Error("Confirmed entries are missing");
    return result;
  },
});

/** Drops a pending draft without logging anything. */
export const discardDraft = mutation({
  args: { draftId: v.id("drafts") },
  returns: v.null(),
  handler: async (ctx, { draftId }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const draft = await ownDraft(ctx, userId, draftId);
    if (draft.status === "discarded") return null;
    if (draft.status !== "pending") throw new Error(`Draft is ${draft.status}`);
    await ctx.db.patch("drafts", draft._id, { status: "discarded", resolvedAt: Date.now() });
    return null;
  },
});

/** The caller's active food memories: text they confirmed for a food. */
export const listFoodLinks = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("food_links"), key: v.string(), foodId: v.id("foods"), uses: v.number() })),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("food_links")
      .withIndex("by_userId_and_status_and_key", (q) => q.eq("userId", userId).eq("status", "active"))
      .take(MAX_LINKS_LISTED);
    return rows.map((row) => ({ _id: row._id, key: row.key, foodId: row.foodId, uses: row.uses }));
  },
});

/** Deletes a food memory. The matcher never reads deleted memories again (HANDOFF #7). */
export const forgetFoodLink = mutation({
  args: { linkId: v.id("food_links") },
  returns: v.null(),
  handler: async (ctx, { linkId }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const link = await ctx.db.get("food_links", linkId);
    if (link === null || link.userId !== userId) throw new Error("Memory not found");
    await ctx.db.patch("food_links", link._id, { status: "deleted", updatedAt: Date.now() });
    return null;
  },
});

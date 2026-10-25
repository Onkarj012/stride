import { hasAtwaterMismatch, normalizeText } from "@stride/core";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  exerciseRecordValidator,
  foodPortionRecordValidator,
  foodRecordValidator,
  foodSourceValidator,
  nutrientsValidator,
} from "./ledger_validators";
import { requireUserId } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Most rows one import call may upsert. The load script sends 200. */
export const MAX_IMPORT_BATCH = 500;
/** Most results `searchFoods` returns. */
export const MAX_SEARCH_RESULTS = 25;
/** Most personal foods one user may keep. Keeps every per-user read bounded. */
export const MAX_USER_FOODS = 200;

/** True when a user may see and log this food: shared records, or personal records they own. */
export function isVisibleFood(food: Pick<Doc<"foods">, "ownerUserId">, userId: string): boolean {
  return food.ownerUserId === undefined || food.ownerUserId === userId;
}

/** Search hits a user may see: their own foods, then shared ones. Searched apart so other users' foods never fill the window. */
export async function searchVisibleFoodRows(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  text: string,
  limit: number,
): Promise<Doc<"foods">[]> {
  // Only saved foods: AI estimates share the owner, and must not fill this window.
  const own = await ctx.db
    .query("foods")
    .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("ownerUserId", userId).eq("source", "user"))
    .take(limit);
  const shared = await ctx.db
    .query("foods")
    .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("ownerUserId", undefined))
    .take(limit);
  return [...own, ...shared];
}

const upsertCounts = v.object({ inserted: v.number(), updated: v.number(), unchanged: v.number() });

/** Throws when an import batch is larger than `MAX_IMPORT_BATCH`. */
function checkBatch(length: number): void {
  if (length > MAX_IMPORT_BATCH) throw new Error(`Import batches hold at most ${MAX_IMPORT_BATCH} rows, got ${length}`);
}

/** A copy of a plain value with object keys sorted, so stored and incoming rows compare regardless of key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, canonical(inner)]),
    );
  }
  return value;
}

/** True when two plain values hold the same fields and values. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Inserts or updates `foods` rows keyed on source + sourceId. Rerunning the same batch changes nothing. */
export const upsertFoods = internalMutation({
  args: { foods: v.array(foodRecordValidator) },
  returns: upsertCounts,
  handler: async (ctx, { foods }) => {
    checkBatch(foods.length);
    const counts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const food of foods) {
      const row = { ...food, searchText: [food.name, ...food.aliases].join(" ") };
      const existing = await ctx.db
        .query("foods")
        .withIndex("by_source_and_sourceId", (q) => q.eq("source", food.source).eq("sourceId", food.sourceId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("foods", row);
        counts.inserted++;
      } else {
        const { _id, _creationTime, ...stored } = existing;
        if (same(stored, row)) {
          counts.unchanged++;
        } else {
          await ctx.db.replace("foods", _id, row);
          counts.updated++;
        }
      }
    }
    return counts;
  },
});

/** Inserts or updates `food_portions` keyed on food + description. Portions whose food is not imported yet are skipped. */
export const upsertFoodPortions = internalMutation({
  args: { portions: v.array(foodPortionRecordValidator) },
  returns: v.object({ inserted: v.number(), updated: v.number(), unchanged: v.number(), missingFood: v.number() }),
  handler: async (ctx, { portions }) => {
    checkBatch(portions.length);
    const counts = { inserted: 0, updated: 0, unchanged: 0, missingFood: 0 };
    for (const portion of portions) {
      const food = await ctx.db
        .query("foods")
        .withIndex("by_source_and_sourceId", (q) => q.eq("source", portion.source).eq("sourceId", portion.sourceId))
        .unique();
      if (food === null) {
        counts.missingFood++;
        continue;
      }
      const row = {
        foodId: food._id,
        source: portion.source,
        measure: portion.measure,
        description: portion.description,
        gramsPerMeasure: portion.gramsPerMeasure,
      };
      const existing = await ctx.db
        .query("food_portions")
        .withIndex("by_foodId_and_description", (q) => q.eq("foodId", food._id).eq("description", portion.description))
        .unique();
      if (existing === null) {
        await ctx.db.insert("food_portions", row);
        counts.inserted++;
      } else if (existing.measure === row.measure && existing.gramsPerMeasure === row.gramsPerMeasure) {
        counts.unchanged++;
      } else {
        await ctx.db.replace("food_portions", existing._id, row);
        counts.updated++;
      }
    }
    return counts;
  },
});

/** Deletes the `food_portions` rows matching each listed food + description. Used to prune portions the importer now rejects. */
export const deleteFoodPortions = internalMutation({
  args: { portions: v.array(foodPortionRecordValidator) },
  returns: v.object({ deleted: v.number(), absent: v.number(), missingFood: v.number() }),
  handler: async (ctx, { portions }) => {
    checkBatch(portions.length);
    const counts = { deleted: 0, absent: 0, missingFood: 0 };
    for (const portion of portions) {
      const food = await ctx.db
        .query("foods")
        .withIndex("by_source_and_sourceId", (q) => q.eq("source", portion.source).eq("sourceId", portion.sourceId))
        .unique();
      if (food === null) {
        counts.missingFood++;
        continue;
      }
      const existing = await ctx.db
        .query("food_portions")
        .withIndex("by_foodId_and_description", (q) => q.eq("foodId", food._id).eq("description", portion.description))
        .unique();
      if (existing === null) {
        counts.absent++;
      } else {
        await ctx.db.delete("food_portions", existing._id);
        counts.deleted++;
      }
    }
    return counts;
  },
});

/** Inserts or updates `exercises` keyed on sourceId. Rerunning the same batch changes nothing. */
export const upsertExercises = internalMutation({
  args: { exercises: v.array(exerciseRecordValidator) },
  returns: upsertCounts,
  handler: async (ctx, { exercises }) => {
    checkBatch(exercises.length);
    const counts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const exercise of exercises) {
      const existing = await ctx.db
        .query("exercises")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", exercise.sourceId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("exercises", exercise);
        counts.inserted++;
      } else {
        const { _id, _creationTime, ...stored } = existing;
        if (same(stored, exercise)) {
          counts.unchanged++;
        } else {
          await ctx.db.replace("exercises", _id, exercise);
          counts.updated++;
        }
      }
    }
    return counts;
  },
});

/** Full-text food search over names and aliases, best match first. For the slice 4 matcher and pickers. */
export const searchFoods = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("foods"),
      name: v.string(),
      aliases: v.array(v.string()),
      source: foodSourceValidator,
      verified: v.boolean(),
      per100g: nutrientsValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const text = args.query.trim();
    if (text === "") return [];
    const requested = args.limit !== undefined && Number.isFinite(args.limit) ? Math.floor(args.limit) : 10;
    const limit = Math.min(Math.max(requested, 1), MAX_SEARCH_RESULTS);
    const rows = await searchVisibleFoodRows(ctx, userId, text, limit);
    return rows
      .slice(0, limit)
      .map((row) => ({
        _id: row._id,
        name: row.name,
        aliases: row.aliases,
        source: row.source,
        verified: row.verified,
        per100g: row.per100g,
      }));
  },
});

const userFoodValidator = v.object({
  _id: v.id("foods"),
  name: v.string(),
  aliases: v.array(v.string()),
  per100g: nutrientsValidator,
});

const labelProvenanceValidator = v.object({
  storageId: v.id("_storage"),
  basis: v.union(v.literal("per_100g"), v.literal("per_100ml"), v.literal("per_serving")),
  servingAmount: v.union(v.number(), v.null()),
  servingUnit: v.union(v.literal("g"), v.literal("ml"), v.null()),
  densityGramsPer100ml: v.union(v.number(), v.null()),
});

/** Creates or updates a personal food after its caller has validated the source values. */
export async function saveUserFoodRow(
  ctx: MutationCtx,
  userId: string,
  name: string,
  aliases: string[],
  per100g: Doc<"foods">["per100g"],
  labelProvenance?: Infer<typeof labelProvenanceValidator>,
): Promise<Id<"foods">> {
  const key = normalizeText(name);
  if (key === "" || name.length > 120) throw new ConvexError({ code: "INVALID_FOOD", message: "Food name must be 1-120 characters" });
  const cleanAliases = aliases.map((a) => a.trim()).filter((a) => a !== "").slice(0, 10);
  const numbers = [per100g.kcal, per100g.protein, per100g.carbs, per100g.fat, per100g.fiber, per100g.sugar, per100g.sodiumMg];
  if (numbers.some((n) => n !== null && (!Number.isFinite(n) || n < 0))) throw new ConvexError({ code: "INVALID_FOOD", message: "Nutrients must be finite and not negative" });
  if (per100g.protein + per100g.carbs + per100g.fat > 100) throw new ConvexError({ code: "INVALID_FOOD", message: "Macros cannot exceed 100 g per 100 g" });
  if (labelProvenance !== undefined) {
    const upload = await ctx.db.query("uploads").withIndex("by_storageId", (q) => q.eq("storageId", labelProvenance.storageId)).unique();
    if (upload === null || upload.userId !== userId || (await ctx.db.system.get("_storage", labelProvenance.storageId)) === null) {
      throw new ConvexError({ code: "UPLOAD_NOT_FOUND", message: "Label photo not found. Take it again." });
    }
  }
  const row: Omit<Doc<"foods">, "_id" | "_creationTime"> = {
    name: name.trim(),
    aliases: cleanAliases,
    searchText: [name.trim(), ...cleanAliases].join(" "),
    per100g,
    source: "user",
    sourceId: `${userId}:${key}`,
    verified: labelProvenance === undefined && !hasAtwaterMismatch(per100g),
    ownerUserId: userId,
    ...(labelProvenance === undefined ? {} : { note: "Nutrition label photo reviewed by user; values are not independently verified." }),
    ...(labelProvenance === undefined ? {} : { labelProvenance: { ...labelProvenance, capturedAt: Date.now() } }),
  };
  const existing = await ctx.db
    .query("foods")
    .withIndex("by_source_and_sourceId", (q) => q.eq("source", "user").eq("sourceId", row.sourceId))
    .unique();
  if (existing !== null) {
    await ctx.db.replace("foods", existing._id, row);
    return existing._id;
  }
  const owned = await ctx.db
    .query("foods")
    .withIndex("by_ownerUserId_and_source", (q) => q.eq("ownerUserId", userId).eq("source", "user"))
    .take(MAX_USER_FOODS);
  if (owned.length >= MAX_USER_FOODS) throw new ConvexError({ code: "FOOD_LIMIT", message: `You can keep at most ${MAX_USER_FOODS} personal foods` });
  return await ctx.db.insert("foods", row);
}

/** Saves a personal food (e.g. homemade paneer) with user-stated per-100 g values. Same name again updates it. */
export const createUserFood = mutation({
  args: { name: v.string(), aliases: v.optional(v.array(v.string())), per100g: nutrientsValidator, labelProvenance: v.optional(labelProvenanceValidator) },
  returns: v.id("foods"),
  handler: async (ctx, { name, aliases, per100g, labelProvenance }): Promise<Id<"foods">> => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    return await saveUserFoodRow(ctx, userId, name, aliases ?? [], per100g, labelProvenance);
  },
});

/** The caller's personal foods, at most `MAX_USER_FOODS`. */
export const listUserFoods = query({
  args: {},
  returns: v.array(userFoodValidator),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("foods")
      .withIndex("by_ownerUserId_and_source", (q) => q.eq("ownerUserId", userId).eq("source", "user"))
      .take(MAX_USER_FOODS);
    return rows.map((row) => ({ _id: row._id, name: row.name, aliases: row.aliases, per100g: row.per100g }));
  },
});

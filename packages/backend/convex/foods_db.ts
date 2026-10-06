import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import {
  exerciseRecordValidator,
  foodPortionRecordValidator,
  foodRecordValidator,
  foodSourceValidator,
  nutrientsValidator,
} from "./ledger_validators";
import { requireUserId } from "./time_zone";

/** Most rows one import call may upsert. The load script sends 200. */
export const MAX_IMPORT_BATCH = 500;
/** Most results `searchFoods` returns. */
export const MAX_SEARCH_RESULTS = 25;

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
    await requireUserId(ctx);
    const text = args.query.trim();
    if (text === "") return [];
    const requested = args.limit !== undefined && Number.isFinite(args.limit) ? Math.floor(args.limit) : 10;
    const limit = Math.min(Math.max(requested, 1), MAX_SEARCH_RESULTS);
    const rows = await ctx.db
      .query("foods")
      .withSearchIndex("search_text", (q) => q.search("searchText", text))
      .take(limit);
    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      aliases: row.aliases,
      source: row.source,
      verified: row.verified,
      per100g: row.per100g,
    }));
  },
});

import type { ExerciseRecord } from "@stride/core";
import { normalizeExerciseName } from "@stride/core";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { exerciseRecordValidator } from "./ledger_validators";
import { requireUserId } from "./time_zone";

const MAX_SEARCH_RESULTS = 30;
const MAX_IMPORT_BATCH = 100;
const exerciseValidator = v.object({
  ...exerciseRecordValidator.fields,
  _id: v.id("exercises"),
  _creationTime: v.number(),
  ownerId: v.optional(v.string()),
});

/** Trims a required catalog field and rejects missing or oversized text. */
function catalogText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new Error(`${field} must be 1-${maxLength} characters`);
  }
  return trimmed;
}

/** Trims an optional catalog field while preserving unknown values as null. */
function optionalText(value: string | null, field: string): string | null {
  return value === null ? null : catalogText(value, field, 80);
}

/** Validates a bounded muscle list and removes repeated muscle names. */
function muscles(values: string[], field: string, required: boolean): string[] {
  if (values.length > 16 || (required && values.length === 0)) {
    throw new Error(`${field} must contain ${required ? "1" : "0"}-16 muscles`);
  }
  return [...new Set(values.map((value) => catalogText(value, field, 80)))];
}

/** Validates and trims a core import record without accepting image fields. */
function importRecord(exercise: ExerciseRecord): ExerciseRecord {
  return {
    sourceId: catalogText(exercise.sourceId, "sourceId", 200),
    name: catalogText(exercise.name, "name", 200),
    category: catalogText(exercise.category, "category", 80),
    equipment: optionalText(exercise.equipment, "equipment"),
    mechanic: optionalText(exercise.mechanic, "mechanic"),
    level: optionalText(exercise.level, "level"),
    primaryMuscles: muscles(exercise.primaryMuscles, "primaryMuscles", true),
    secondaryMuscles: muscles(exercise.secondaryMuscles, "secondaryMuscles", false),
  };
}

/** Omits private matching metadata from an exercise returned to clients. */
function exerciseView(row: Doc<"exercises">) {
  const { normalizedName: _normalizedName, ...view } = row;
  return view;
}

/** Searches the shared exercise library, or browses a bounded page when search text is empty. */
export const search = query({
  args: { query: v.string(), category: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.array(exerciseValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const text = args.query.trim();
    if (text.length > 200) throw new ConvexError({ code: "INVALID_TEXT", message: "query must be at most 200 characters" });
    const category = args.category === undefined ? undefined : catalogText(args.category, "category", 80);
    const limit = args.limit ?? MAX_SEARCH_RESULTS;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULTS) {
      throw new Error(`limit must be an integer within 1-${MAX_SEARCH_RESULTS}`);
    }
    if (text === "") {
      const rows = await ctx.db
        .query("exercises")
        .withIndex("by_category_and_name", (q) => category === undefined ? q : q.eq("category", category))
        .take(limit + 1);
      const own = await ctx.db.query("exercises").withIndex("by_ownerId_and_name", (q) => q.eq("ownerId", userId)).take(limit);
      return [...rows.filter((row) => row.ownerId === undefined), ...own.filter((row) => category === undefined || row.category === category)].slice(0, limit).map(exerciseView);
    }
    const catalog = await ctx.db
      .query("exercises")
      .withSearchIndex("search_name", (q) => {
        const searchQuery = q.search("name", text);
        return category === undefined ? searchQuery : searchQuery.eq("category", category);
      })
      .take(limit + 1);
    const own = await ctx.db.query("exercises").withSearchIndex("search_name", (q) => {
      const searchQuery = q.search("name", text).eq("ownerId", userId);
      return category === undefined ? searchQuery : searchQuery.eq("category", category);
    }).take(limit);
    const normalized = normalizeExerciseName(text);
    return [...catalog.filter((row) => row.ownerId === undefined), ...own.filter((row) => normalizeExerciseName(row.name).includes(normalized))].slice(0, limit).map(exerciseView);
  },
});

/** Returns a shared library exercise by its table ID, or null when it no longer exists. */
export const get = query({
  args: { exerciseId: v.id("exercises") },
  returns: v.union(exerciseValidator, v.null()),
  handler: async (ctx, { exerciseId }) => {
    const userId = await requireUserId(ctx);
    const exercise = await ctx.db.get("exercises", exerciseId);
    return exercise === null || (exercise.ownerId !== undefined && exercise.ownerId !== userId) ? null : exerciseView(exercise);
  },
});

/** Finds or creates one personal exercise with a stable normalized identity. */
export const createPersonal = mutation({
  args: { name: v.string(), kind: v.union(v.literal("strength"), v.literal("cardio")) },
  returns: v.id("exercises"),
  handler: async (ctx, { name, kind }) => {
    const userId = await requireUserId(ctx);
    const cleaned = catalogText(name, "name", 200);
    const normalized = normalizeExerciseName(cleaned);
    if (normalized === "") throw new ConvexError({ code: "INVALID_TEXT", message: "name must contain letters or numbers" });
    const prior = await ctx.db.query("exercises").withIndex("by_ownerId_and_normalizedName", (q) => q.eq("ownerId", userId).eq("normalizedName", normalized)).unique();
    if (prior !== null) {
      if (prior.category !== kind) throw new ConvexError({ code: "EXERCISE_KIND_CONFLICT", message: "This name is already saved for another exercise type." });
      return prior._id;
    }
    return await ctx.db.insert("exercises", {
      ownerId: userId, normalizedName: normalized, sourceId: `personal:${userId}:${normalized}`, name: cleaned,
      category: kind, equipment: null, mechanic: null, level: null, primaryMuscles: [], secondaryMuscles: [],
    });
  },
});

/** Validates a batched core import and upserts its rows by sourceId using the existing importer. */
export const upsertBatch = internalMutation({
  args: { exercises: v.array(exerciseRecordValidator) },
  returns: v.object({ inserted: v.number(), updated: v.number(), unchanged: v.number() }),
  handler: async (ctx, { exercises }): Promise<{ inserted: number; updated: number; unchanged: number }> => {
    if (exercises.length < 1 || exercises.length > MAX_IMPORT_BATCH) {
      throw new Error(`Import batches must contain 1-${MAX_IMPORT_BATCH} exercises`);
    }
    return ctx.runMutation(internal.foods_db.upsertExercises, { exercises: exercises.map(importRecord) });
  },
});

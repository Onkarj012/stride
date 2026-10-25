import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { normalizeText } from "@stride/core";
import { searchVisibleFoodRows } from "./foods_db";
import { insertEntries } from "./entries";
import type { NewEntry } from "./entries";
import { requireFoodShortcuts } from "./food_shortcuts";
import { requireUserId } from "./time_zone";
import { assertLedgerWritable } from "./users";

const MAX_USUAL_MEALS = 30;
const MAX_USUAL_MEAL_ITEMS = 20;

/** Searches shared and caller-owned foods, including explicit estimated foods the caller may preserve. */
export const searchFoods = query({
  args: { query: v.string() },
  returns: v.array(v.object({
    _id: v.id("foods"),
    name: v.string(),
    source: v.union(v.literal("fdc"), v.literal("ifct"), v.literal("cofid"), v.literal("stride"), v.literal("off"), v.literal("user"), v.literal("ai_estimate")),
    per100g: v.object({ kcal: v.number(), protein: v.number(), carbs: v.number(), fat: v.number(), fiber: v.union(v.number(), v.null()), sugar: v.union(v.number(), v.null()), sodiumMg: v.union(v.number(), v.null()) }),
  })),
  handler: async (ctx, { query: requested }) => {
    const userId = await requireUserId(ctx);
    await requireFoodShortcuts(ctx, userId);
    const text = normalizeText(requested);
    if (text.length < 2) return [];
    const [visible, estimates] = await Promise.all([
      searchVisibleFoodRows(ctx, userId, text, 12),
      ctx.db.query("foods").withSearchIndex("search_text", (q) => q.search("searchText", text).eq("ownerUserId", userId).eq("source", "ai_estimate")).take(12),
    ]);
    return [...estimates, ...visible].slice(0, 12).map((food) => ({ _id: food._id, name: food.name, source: food.source, per100g: food.per100g }));
  },
});

/** The saved meals the caller may see, with current food names and an unavailable marker for deleted foods. */
export const list = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("usual_meals"),
    name: v.string(),
    items: v.array(v.object({
      _id: v.id("usual_meal_items"),
      foodId: v.id("foods"),
      foodName: v.string(),
      grams: v.number(),
      available: v.boolean(),
      estimated: v.boolean(),
    })),
  })),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await requireFoodShortcuts(ctx, userId);
    const meals = await ctx.db.query("usual_meals").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_USUAL_MEALS);
    return await Promise.all(meals.map(async (meal) => {
      const items = await ctx.db.query("usual_meal_items").withIndex("by_usualMealId", (q) => q.eq("usualMealId", meal._id)).take(MAX_USUAL_MEAL_ITEMS);
      const rows = await Promise.all(items.map(async (item) => {
        const food = await ctx.db.get("foods", item.foodId);
        return { _id: item._id, foodId: item.foodId, foodName: food?.name ?? item.foodName, grams: item.grams, available: food !== null && (food.ownerUserId === undefined || food.ownerUserId === userId), estimated: food?.source === "ai_estimate" };
      }));
      return { _id: meal._id, name: meal.name, items: rows };
    }));
  },
});

/** Saves or replaces one caller-owned template with fixed gram amounts. */
export const save = mutation({
  args: {
    mealId: v.optional(v.id("usual_meals")),
    name: v.string(),
    items: v.array(v.object({ foodId: v.id("foods"), grams: v.number() })),
  },
  returns: v.id("usual_meals"),
  handler: async (ctx, { mealId, name, items }) => {
    const userId = await requireUserId(ctx);
    await requireFoodShortcuts(ctx, userId);
    await assertLedgerWritable(ctx, userId);
    const cleanName = name.trim();
    if (cleanName.length < 1 || cleanName.length > 60) throw new ConvexError({ code: "INVALID_USUAL_MEAL", message: "Meal name must be 1-60 characters" });
    if (items.length < 1 || items.length > MAX_USUAL_MEAL_ITEMS) throw new ConvexError({ code: "INVALID_USUAL_MEAL", message: `Choose 1-${MAX_USUAL_MEAL_ITEMS} foods` });
    for (const item of items) {
      if (!Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) throw new ConvexError({ code: "INVALID_USUAL_MEAL", message: "Each amount must be between 1 and 5000 grams" });
      const food = await ctx.db.get("foods", item.foodId);
      if (food === null || (food.ownerUserId !== undefined && food.ownerUserId !== userId)) throw new ConvexError({ code: "NOT_FOUND", message: "A selected food is no longer available" });
    }
    let meal: Doc<"usual_meals"> | null = mealId === undefined ? null : await ctx.db.get("usual_meals", mealId);
    if (mealId !== undefined && (meal === null || meal.userId !== userId)) throw new ConvexError({ code: "NOT_FOUND", message: "Usual meal not found" });
    if (meal === null) {
      const existing = await ctx.db.query("usual_meals").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_USUAL_MEALS);
      if (existing.length >= MAX_USUAL_MEALS) throw new ConvexError({ code: "USUAL_MEAL_LIMIT", message: `You can save at most ${MAX_USUAL_MEALS} usual meals` });
      const id = await ctx.db.insert("usual_meals", { userId, name: cleanName });
      meal = await ctx.db.get("usual_meals", id);
    } else {
      await ctx.db.patch("usual_meals", meal._id, { name: cleanName });
    }
    if (meal === null) throw new Error("Saved meal disappeared");
    const oldItems = await ctx.db.query("usual_meal_items").withIndex("by_usualMealId", (q) => q.eq("usualMealId", meal._id)).take(MAX_USUAL_MEAL_ITEMS);
    await Promise.all(oldItems.map((item) => ctx.db.delete(item._id)));
    for (const item of items) {
      const food = await ctx.db.get("foods", item.foodId);
      if (food === null) throw new ConvexError({ code: "NOT_FOUND", message: "A selected food is no longer available" });
      await ctx.db.insert("usual_meal_items", { userId, usualMealId: meal._id, foodId: item.foodId, foodName: food.name, grams: item.grams });
    }
    return meal._id;
  },
});

/** Deletes one caller-owned template and its bounded component rows. */
export const remove = mutation({
  args: { mealId: v.id("usual_meals") },
  returns: v.null(),
  handler: async (ctx, { mealId }) => {
    const userId = await requireUserId(ctx);
    await requireFoodShortcuts(ctx, userId);
    await assertLedgerWritable(ctx, userId);
    const meal = await ctx.db.get("usual_meals", mealId);
    if (meal === null || meal.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Usual meal not found" });
    const items = await ctx.db.query("usual_meal_items").withIndex("by_usualMealId", (q) => q.eq("usualMealId", mealId)).take(MAX_USUAL_MEAL_ITEMS);
    await Promise.all(items.map((item) => ctx.db.delete(item._id)));
    await ctx.db.delete(mealId);
    return null;
  },
});

/** Logs current food values from a saved template through the ordinary revision ledger. */
export const log = mutation({
  args: { mealId: v.id("usual_meals"), submissionId: v.string(), slot: v.optional(v.union(v.literal("breakfast"), v.literal("lunch"), v.literal("snack"), v.literal("dinner"))) },
  returns: v.array(v.id("entries")),
  handler: async (ctx, { mealId, submissionId, slot }) => {
    const userId = await requireUserId(ctx);
    await requireFoodShortcuts(ctx, userId);
    const meal = await ctx.db.get("usual_meals", mealId);
    if (meal === null || meal.userId !== userId) throw new ConvexError({ code: "NOT_FOUND", message: "Usual meal not found" });
    const items = await ctx.db.query("usual_meal_items").withIndex("by_usualMealId", (q) => q.eq("usualMealId", mealId)).take(MAX_USUAL_MEAL_ITEMS);
    if (items.length === 0) throw new ConvexError({ code: "INVALID_USUAL_MEAL", message: "This usual meal has no foods" });
    const entries: NewEntry[] = items.map((item) => ({
      foodId: item.foodId,
      grams: item.grams,
      source: "db",
      flags: [],
      ...(slot === undefined ? {} : { slot }),
    }));
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const food: Doc<"foods"> | null = item === undefined ? null : await ctx.db.get("foods", item.foodId);
      if (food === null || (food.ownerUserId !== undefined && food.ownerUserId !== userId)) throw new ConvexError({ code: "MISSING_USUAL_MEAL_FOOD", message: `${item?.foodName ?? "A food"} is no longer available. Edit this usual meal first.` });
      const entry = entries[index];
      if (entry !== undefined && food.source === "ai_estimate") {
        entry.source = "ai";
        entry.flags = ["estimated"];
      }
    }
    await assertLedgerWritable(ctx, userId);
    return await insertEntries(ctx, userId, submissionId, entries, { createdBy: "user" });
  },
});

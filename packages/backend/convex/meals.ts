import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { recordBehaviorRow } from "./behavior";
import {
  assertValidDateStr,
  buildIdempotencyKey,
  isSimilarMeal,
  mealContentHash,
  minutesBetweenTimes,
  normalizeLogSource,
  timeWindowKey,
  validateMealWrite,
} from "./validation";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

async function findExistingMealByIdempotencyKey(ctx: any, userId: string, date: string, idempotencyKey: string) {
  return ctx.db
    .query("meals")
    .withIndex("by_user_date_and_idempotency_key", (q: any) =>
      q.eq("userId", userId).eq("date", date).eq("idempotencyKey", idempotencyKey),
    )
    .first();
}

/**
 * Resolve a date/time pair without mixing a client-supplied local date with
 * server UTC time. When both are missing, derive both from the same instant.
 * When only the date is supplied, keep the time on that date's frame.
 */
function resolveTargetDateTime(args: { date?: string; time?: string }): { date: string; time: string } {
  const { date, time } = args;
  if (date !== undefined && time !== undefined) {
    return { date, time };
  }
  if (date !== undefined) {
    return { date, time: time ?? "00:00" };
  }
  const now = new Date();
  return {
    date: now.toISOString().split("T")[0],
    time: time ?? now.toISOString().slice(11, 16),
  };
}

async function assertNoNearDuplicateMeal(ctx: any, userId: string, date: string, meal: any, time: string) {
  const meals = await ctx.db
    .query("meals")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .collect();
  const duplicate = meals.find((existing: any) => {
    const minutes = minutesBetweenTimes(existing.time, time);
    return minutes != null && minutes <= 10 && isSimilarMeal(meal, existing);
  });
  if (duplicate) {
    throw new ConvexError({
      code: "NEAR_DUPLICATE",
      message: "Looks like you already logged this — log anyway?",
      mealId: duplicate._id,
    });
  }
}

export const getMeals = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .order("asc")
      .collect();
  },
});

export const addMeal = mutation({
  args: {
    name: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    time: v.string(),
    date: v.optional(v.string()),
    aiSuggestion: v.optional(v.string()),
    mealType: v.optional(v.string()),
    components: v.optional(v.string()),
    confidence: v.optional(v.number()),
    nutritionSource: v.optional(v.string()),
    nutritionVerified: v.optional(v.boolean()),
    foodMemoryId: v.optional(v.id("food_memory")),
    structuredItems: v.optional(v.string()),
    ingredientBreakdown: v.optional(v.string()),
    logSource: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const date = args.date ?? new Date().toISOString().split("T")[0];
    const validated = validateMealWrite(args);
    const logSource = normalizeLogSource(args.logSource, "manual");
    const idempotencyKey = buildIdempotencyKey({
      userId,
      date,
      source: logSource,
      contentHash: mealContentHash(validated),
      timeWindow: timeWindowKey(validated.time),
    });
    const existing = await findExistingMealByIdempotencyKey(ctx, userId, date, idempotencyKey);
    if (existing) return existing._id;
    if (!args.allowDuplicate) {
      await assertNoNearDuplicateMeal(ctx, userId, date, validated, validated.time);
    }
    const id = await ctx.db.insert("meals", {
      userId,
      date,
      name: validated.name,
      calories: validated.calories,
      protein: validated.protein,
      carbs: validated.carbs,
      fat: validated.fat,
      time: validated.time,
      aiSuggestion: args.aiSuggestion,
      mealType: args.mealType ?? "unspecified",
      components: args.components,
      confidence: validated.confidence,
      nutritionSource: validated.nutritionSource,
      nutritionVerified: args.nutritionVerified,
      foodMemoryId: args.foodMemoryId,
      structuredItems: args.structuredItems,
      ingredientBreakdown: args.ingredientBreakdown,
      logSource,
      idempotencyKey,
    });
    await recordBehaviorRow(ctx, userId, "log", "meal", undefined, date);
    // Learn from this meal (fire-and-forget; don't block the mutation)
    ctx.scheduler.runAfter(0, internal.food_memory.recordFromMeal, {
      userId,
      name: validated.name,
      kcal: validated.calories,
      protein: validated.protein,
      carbs: validated.carbs,
      fat: validated.fat,
      components: args.components,
      date,
      source: "learned",
    }).catch(() => {});
    return id;
  },
});

export const updateMeal = mutation({
  args: {
    id: v.id("meals"),
    name: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    time: v.string(),
    mealType: v.optional(v.string()),
    aiSuggestion: v.optional(v.union(v.string(), v.null())),
    components: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, ...fields }) => {
    const validated = validateMealWrite({
      name: fields.name,
      calories: fields.calories,
      protein: fields.protein,
      carbs: fields.carbs,
      fat: fields.fat,
      time: fields.time,
      confidence: 1,
      nutritionSource: "user_corrected",
    });
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal || meal.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, {
      name: validated.name,
      calories: validated.calories,
      protein: validated.protein,
      carbs: validated.carbs,
      fat: validated.fat,
      time: validated.time,
      confidence: validated.confidence,
      nutritionSource: validated.nutritionSource,
      mealType: fields.mealType ?? "unspecified",
      aiSuggestion: fields.aiSuggestion ?? undefined,
      components: fields.components ?? undefined,
    });
    // Feed correction back to diet memory
    const today = new Date().toISOString().split("T")[0];
    if (meal.foodMemoryId) {
      ctx.scheduler.runAfter(0, internal.food_memory.updateFromCorrection, {
        foodMemoryId: meal.foodMemoryId,
        kcal: fields.calories,
        protein: fields.protein,
        carbs: fields.carbs,
        fat: fields.fat,
        date: meal.date ?? today,
      }).catch(() => {});
    } else {
      // Meal not memory-linked: still learn the corrected values by name
      ctx.scheduler.runAfter(0, internal.food_memory.recordFromMeal, {
        userId,
        name: validated.name,
        kcal: validated.calories,
        protein: validated.protein,
        carbs: validated.carbs,
        fat: validated.fat,
        components: fields.components ?? meal.components ?? undefined,
        date: meal.date ?? today,
        source: "corrected",
      }).catch(() => {});
    }
  },
});

export const deleteMeal = mutation({
  args: { id: v.id("meals") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal || meal.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

/**
 * Re-log an existing meal as today (or a specified date).
 *
 * Used by the History page's "log again" button so a user can repeat a
 * common breakfast/lunch with a single tap instead of asking the agent.
 * All nutrition fields are preserved as-is.
 */
export const relogMeal = mutation({
  args: {
    id: v.id("meals"),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { id, date, time }) => {
    const userId = await requireUserId(ctx);
    const src = await ctx.db.get(id);
    if (!src || src.userId !== userId) throw new Error("Not found");
    const { date: targetDate, time: targetTime } = resolveTargetDateTime({
      date: date !== undefined ? assertValidDateStr(date) : undefined,
      time,
    });
    const validated = validateMealWrite({
      name: src.name,
      calories: src.calories,
      protein: src.protein,
      carbs: src.carbs,
      fat: src.fat,
      time: targetTime,
      confidence: src.confidence,
      nutritionSource: src.nutritionSource,
    });
    const logSource = normalizeLogSource("relog", "relog");
    const idempotencyKey = buildIdempotencyKey({
      userId,
      date: targetDate,
      source: logSource,
      contentHash: mealContentHash(validated),
      timeWindow: timeWindowKey(targetTime),
    });
    const existing = await findExistingMealByIdempotencyKey(ctx, userId, targetDate, idempotencyKey);
    if (existing) return existing._id;
    return ctx.db.insert("meals", {
      userId,
      date: targetDate,
      name: validated.name,
      calories: validated.calories,
      protein: validated.protein,
      carbs: validated.carbs,
      fat: validated.fat,
      time: validated.time,
      aiSuggestion: src.aiSuggestion,
      mealType: src.mealType ?? "unspecified",
      components: src.components,
      confidence: validated.confidence,
      nutritionSource: validated.nutritionSource,
      nutritionVerified: src.nutritionVerified,
      structuredItems: src.structuredItems,
      ingredientBreakdown: src.ingredientBreakdown,
      logSource,
      idempotencyKey,
    });
  },
});

// ─── Internal (called by AI action) ──────────────────────────────────────────

export const getMealsForContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) =>
    ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect(),
});

export const getRecentCalories = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .collect();
    const byDate = new Map<string, number>();
    for (const m of meals) {
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.calories);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7)
      .map(([date, cals]) => ({ date, cals: Math.round(cals) }));
  },
});

export const addMealFromAI = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    time: v.string(),
    date: v.string(),
    aiSuggestion: v.optional(v.string()),
    mealType: v.optional(v.string()),
    components: v.optional(v.string()),
    confidence: v.optional(v.number()),
    nutritionSource: v.optional(v.string()),
    nutritionVerified: v.optional(v.boolean()),
    structuredItems: v.optional(v.string()),
    ingredientBreakdown: v.optional(v.string()),
    foodMemoryId: v.optional(v.id("food_memory")),
    logSource: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const validated = validateMealWrite(args);
    const logSource = normalizeLogSource(args.logSource, "ai");
    const idempotencyKey = buildIdempotencyKey({
      userId: args.userId,
      date: args.date,
      source: logSource,
      contentHash: mealContentHash(validated),
      timeWindow: timeWindowKey(validated.time),
    });
    const existing = await findExistingMealByIdempotencyKey(ctx, args.userId, args.date, idempotencyKey);
    if (existing) return existing._id;
    if (!args.allowDuplicate) {
      await assertNoNearDuplicateMeal(ctx, args.userId, args.date, validated, validated.time);
    }
    const id = await ctx.db.insert("meals", {
      userId: args.userId,
      date: args.date,
      name: validated.name,
      calories: validated.calories,
      protein: validated.protein,
      carbs: validated.carbs,
      fat: validated.fat,
      time: validated.time,
      aiSuggestion: args.aiSuggestion,
      mealType: args.mealType ?? "unspecified",
      components: args.components,
      confidence: validated.confidence,
      nutritionSource: validated.nutritionSource,
      nutritionVerified: args.nutritionVerified,
      structuredItems: args.structuredItems,
      ingredientBreakdown: args.ingredientBreakdown,
      foodMemoryId: args.foodMemoryId,
      logSource,
      idempotencyKey,
    });
    // Learn from AI-logged meal too (fire-and-forget)
    if (!args.foodMemoryId) {
      ctx.scheduler.runAfter(0, internal.food_memory.recordFromMeal, {
        userId: args.userId,
        name: validated.name,
        kcal: validated.calories,
        protein: validated.protein,
        carbs: validated.carbs,
        fat: validated.fat,
        components: args.components,
        date: args.date,
        source: "learned",
      }).catch(() => {});
    }
    return id;
  },
});

export const getMealsByDateRange = internalQuery({
  args: { userId: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { userId, startDate, endDate }) => {
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .filter((q) => q.lte(q.field("date"), endDate))
      .collect();
    return meals;
  },
});

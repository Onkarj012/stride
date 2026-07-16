import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { recordBehaviorRow } from "./behavior";
import { recordActivityForUser } from "./gamification";
import { recomputeForAction } from "./derived_state";
import { recordFoodMemoryRow } from "./food_memory";
import { deriveGroupKey, deriveMemberKey } from "./actions_idempotency";
import { findBestMatch } from "./food_memory_match";
import {
  buildDirectMealDraft,
  buildMealDraft,
  mealPayloadFromDraft,
  type MealDraft,
} from "./nutrition_draft";
import {
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

function usableFoodMemories(rows: any[]) {
  return rows.filter((row) => !row.undoneAt && !row.deletedAt && row.approvalStatus !== "pending" && row.approvalStatus !== "rejected");
}

async function findExistingMealByIdempotencyKey(ctx: any, userId: string, date: string, idempotencyKey: string) {
  const rows = await ctx.db
    .query("meals")
    .withIndex("by_user_date_and_idempotency_key", (q: any) =>
      q.eq("userId", userId).eq("date", date).eq("idempotencyKey", idempotencyKey),
    )
    .collect();
  return rows.find((row: any) => !row.undoneAt) ?? null;
}

async function assertNoNearDuplicateMeal(ctx: any, userId: string, date: string, meal: any, time: string) {
  const meals = (await ctx.db
    .query("meals")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .collect()).filter((meal: any) => !meal.undoneAt);
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

export async function writeMealDomain(
  ctx: any,
  args: any,
  options: { emitBehavior?: boolean; emitGamification?: boolean; recomputeDerived?: boolean; sourceActionId?: string } = {},
) {
  const canonical = args.draft?.kind === "meal"
    ? mealPayloadFromDraft({
      ...(args.draft as MealDraft),
      date: args.date ?? (args.draft as MealDraft).date,
      time: args.time ?? (args.draft as MealDraft).time,
    }, args)
    : args;
  const validated = validateMealWrite(canonical);
  const date = canonical.date ?? new Date().toISOString().split("T")[0];
  const logSource = normalizeLogSource(canonical.logSource, "manual");
  const idempotencyKey = buildIdempotencyKey({
    userId: canonical.userId,
    date,
    source: logSource,
    contentHash: mealContentHash(validated),
    timeWindow: timeWindowKey(validated.time),
  });
  const existing = await findExistingMealByIdempotencyKey(ctx, canonical.userId, date, idempotencyKey);
  if (existing) return existing._id;
  if (!canonical.allowDuplicate) {
    await assertNoNearDuplicateMeal(ctx, canonical.userId, date, validated, validated.time);
  }
  const id = await ctx.db.insert("meals", {
    userId: canonical.userId,
    date,
    name: validated.name,
    calories: validated.calories,
    protein: validated.protein,
    carbs: validated.carbs,
    fat: validated.fat,
    time: validated.time,
    aiSuggestion: canonical.aiSuggestion,
    mealType: canonical.mealType ?? "unspecified",
    components: canonical.components,
    confidence: validated.confidence,
    nutritionSource: validated.nutritionSource,
    nutritionVerified: canonical.nutritionVerified,
    foodMemoryId: canonical.foodMemoryId,
    structuredItems: canonical.structuredItems,
    ingredientBreakdown: canonical.ingredientBreakdown,
    reportedCalories: canonical.reportedCalories,
    estimatedCalories: canonical.estimatedCalories,
    calorieSource: canonical.calorieSource,
    ingredientBreakdownInvalidated: canonical.ingredientBreakdownInvalidated,
    logSource,
    idempotencyKey,
  });
  if (options.emitBehavior) await recordBehaviorRow(ctx, canonical.userId, "log", "meal", undefined, date);
  if (options.emitGamification && date === new Date().toISOString().split("T")[0]) {
    await recordActivityForUser(ctx, canonical.userId, { type: "meal", date });
  }
  if (!canonical.foodMemoryId) {
    await recordFoodMemoryRow(ctx, {
      userId: canonical.userId,
      name: validated.name,
      kcal: validated.calories,
      protein: validated.protein,
      carbs: validated.carbs,
      fat: validated.fat,
      components: canonical.components,
      date,
      source: "learned",
      sourceActionId: options.sourceActionId,
    }).catch(() => {});
  }
  if (options.recomputeDerived !== false) {
    await recomputeForAction(ctx, { userId: canonical.userId, actionType: "meal", date });
  }
  return id;
}

export const getMeals = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .order("asc")
      .collect();
    return meals.filter((meal) => !meal.undoneAt);
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
    reportedCalories: v.optional(v.number()),
    estimatedCalories: v.optional(v.number()),
    calorieSource: v.optional(v.union(v.literal("reported"), v.literal("estimated"))),
    ingredientBreakdownInvalidated: v.optional(v.boolean()),
    logSource: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = await requireUserId(ctx);
    const date = args.date ?? new Date().toISOString().split("T")[0];
    const memories = usableFoodMemories(await ctx.db.query("food_memory").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect());
    const draft = buildDirectMealDraft({ ...args, date, time: args.time, memoryMatch: findBestMatch(args.name, memories as any[]) ?? undefined });
    const payload = mealPayloadFromDraft(draft, { ...args, userId, date });
    const rawInput = JSON.stringify({ source: args.logSource ?? "manual", date, time: args.time, draft });
    const groupKey = deriveGroupKey({ userId, sourceSurface: "direct_ui", rawInput });
    const provenance = draft.nutritionSource === "database" ? "database_match" : draft.nutritionSource === "ai_estimate" ? "ai_estimated" : "user_reported";
    return ctx.runMutation((internal as any).actions_writer.writeMealAction, {
      group: { userId, groupIdempotencyKey: groupKey, sourceSurface: "direct_ui", rawInput },
      member: {
        memberIdempotencyKey: deriveMemberKey({ groupKey, actionType: "meal", payloadFingerprint: JSON.stringify(payload), ordinal: 0 }),
        payload,
        provenance,
        confidence: draft.confidence,
        validation: { status: draft.unresolved.length > 0 ? "warning" : "valid", messages: draft.unresolved.map((name) => `Ambiguous food: ${name}`) },
        reversible: true,
        resolvedDate: date,
        resolvedTime: args.time,
      },
    });
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
    const correctedDraft = buildMealDraft({
      name: validated.name,
      date: meal.date,
      time: validated.time,
      mealType: fields.mealType ?? "unspecified",
      ingredients: [{
        foodText: validated.name,
        quantity: 1,
        unit: "serving",
        nutrition: { kcal: validated.calories, protein: validated.protein, carbs: validated.carbs, fat: validated.fat },
        source: "user_reported",
        confidence: 1,
      }],
      reportedCalories: validated.calories,
      calorieSource: "reported",
      detailInvalidated: true,
    });
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
      reportedCalories: correctedDraft.reportedCalories,
      estimatedCalories: meal.estimatedCalories,
      calorieSource: "reported",
      ingredientBreakdownInvalidated: true,
    });
    // Feed correction back to diet memory
    const today = new Date().toISOString().split("T")[0];
    if (meal.foodMemoryId) {
      ctx.scheduler.runAfter(0, internal.food_memory.updateFromCorrection, {
        foodMemoryId: meal.foodMemoryId,
        name: validated.name,
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
    await recomputeForAction(ctx, { userId, actionType: "meal", date: meal.date });
  },
});

export const setMealCalorieSource = mutation({
  args: {
    id: v.id("meals"),
    source: v.union(v.literal("reported"), v.literal("estimated")),
  },
  handler: async (ctx, { id, source }) => {
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal || meal.userId !== userId) throw new Error("Not found");
    const value = source === "reported" ? meal.reportedCalories : meal.estimatedCalories;
    if (value == null) throw new Error(`Meal has no ${source} calorie value`);
    await ctx.db.patch(id, { calories: value, calorieSource: source });
    await recomputeForAction(ctx, { userId, actionType: "meal", date: meal.date });
    return { id, calories: value, calorieSource: source };
  },
});

export const deleteMeal = mutation({
  args: { id: v.id("meals") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal || meal.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
    await recomputeForAction(ctx, { userId, actionType: "meal", date: meal.date });
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
  handler: async (ctx, { id, date, time }): Promise<any> => {
    const userId = await requireUserId(ctx);
    const src = await ctx.db.get(id);
    if (!src || src.userId !== userId) throw new Error("Not found");
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const targetTime = time ?? new Date().toISOString().slice(11, 16);
    const memories = usableFoodMemories(await ctx.db.query("food_memory").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect());
    const draft = buildDirectMealDraft({
      name: src.name,
      calories: src.calories,
      protein: src.protein,
      carbs: src.carbs,
      fat: src.fat,
      time: targetTime,
      date: targetDate,
      mealType: src.mealType,
      nutritionSource: src.nutritionSource,
      reportedCalories: src.reportedCalories,
      estimatedCalories: src.estimatedCalories,
      calorieSource: src.calorieSource === "reported" || src.calorieSource === "estimated" ? src.calorieSource : undefined,
      ingredientBreakdown: src.ingredientBreakdown,
      foodMemoryId: src.foodMemoryId,
      memoryMatch: findBestMatch(src.name, memories as any[]) ?? undefined,
    });
    const payload = mealPayloadFromDraft(draft, {
      aiSuggestion: src.aiSuggestion,
      components: src.components,
      nutritionVerified: src.nutritionVerified,
      logSource: "relog",
      allowDuplicate: true,
    });
    const logSource = normalizeLogSource("relog", "relog");
    const idempotencyKey = buildIdempotencyKey({
      userId,
      date: targetDate,
      source: logSource,
      contentHash: mealContentHash(draft),
      timeWindow: timeWindowKey(targetTime),
    });
    const existing = await findExistingMealByIdempotencyKey(ctx, userId, targetDate, idempotencyKey);
    if (existing) return existing._id;
    const rawInput = JSON.stringify({ source: "relog", sourceMealId: id, date: targetDate, time: targetTime });
    const groupKey = deriveGroupKey({ userId, sourceSurface: "direct_ui", rawInput });
    return ctx.runMutation((internal as any).actions_writer.writeMealAction, {
      group: { userId, groupIdempotencyKey: groupKey, sourceSurface: "direct_ui", rawInput },
      member: {
        memberIdempotencyKey: deriveMemberKey({ groupKey, actionType: "meal", payloadFingerprint: idempotencyKey, ordinal: 0 }),
        payload: { ...payload, userId, date: targetDate, logSource },
        provenance: draft.nutritionSource === "database" ? "database_match" : "user_reported",
        confidence: draft.confidence,
        validation: { status: "valid", messages: [] },
        reversible: true,
        resolvedDate: targetDate,
        resolvedTime: targetTime,
      },
    });
  },
});

// ─── Internal (called by AI action) ──────────────────────────────────────────

export const getMealsForContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) =>
    (await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).filter((meal) => !meal.undoneAt),
});

export const getRecentCalories = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const meals = (await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .collect()).filter((meal) => !meal.undoneAt);
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
    reportedCalories: v.optional(v.number()),
    estimatedCalories: v.optional(v.number()),
    calorieSource: v.optional(v.union(v.literal("reported"), v.literal("estimated"))),
    ingredientBreakdownInvalidated: v.optional(v.boolean()),
    foodMemoryId: v.optional(v.id("food_memory")),
    logSource: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const draft = buildDirectMealDraft(args);
    return writeMealDomain(ctx, mealPayloadFromDraft(draft, args), { emitBehavior: false, emitGamification: false });
  },
});

export const getMealsByDateRange = internalQuery({
  args: { userId: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { userId, startDate, endDate }) => {
    const meals = (await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .collect()).filter((meal) => meal.date <= endDate && !meal.undoneAt);
    return meals;
  },
});

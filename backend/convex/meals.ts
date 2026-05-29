import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
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
  },
  handler: async (ctx, args) => {
    if (args.calories < 0 || args.protein < 0 || args.carbs < 0 || args.fat < 0) {
      throw new Error("Calories and macros must be non-negative");
    }
    const userId = await requireUserId(ctx);
    const date = args.date ?? new Date().toISOString().split("T")[0];
    return ctx.db.insert("meals", {
      userId,
      date,
      name: args.name,
      calories: args.calories,
      protein: args.protein,
      carbs: args.carbs,
      fat: args.fat,
      time: args.time,
      aiSuggestion: args.aiSuggestion,
      mealType: args.mealType ?? "unspecified",
      components: args.components,
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
    if (fields.calories < 0 || fields.protein < 0 || fields.carbs < 0 || fields.fat < 0) {
      throw new Error("Calories and macros must be non-negative");
    }
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal || meal.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, {
      name: fields.name,
      calories: fields.calories,
      protein: fields.protein,
      carbs: fields.carbs,
      fat: fields.fat,
      time: fields.time,
      mealType: fields.mealType ?? "unspecified",
      aiSuggestion: fields.aiSuggestion ?? undefined,
      components: fields.components ?? undefined,
    });
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
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const targetTime = time ?? new Date().toISOString().slice(11, 16);
    return ctx.db.insert("meals", {
      userId,
      date: targetDate,
      name: src.name,
      calories: src.calories,
      protein: src.protein,
      carbs: src.carbs,
      fat: src.fat,
      time: targetTime,
      aiSuggestion: src.aiSuggestion,
      mealType: src.mealType ?? "unspecified",
      components: src.components,
      confidence: src.confidence,
      nutritionSource: src.nutritionSource,
      structuredItems: src.structuredItems,
      ingredientBreakdown: src.ingredientBreakdown,
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
    structuredItems: v.optional(v.string()),
    ingredientBreakdown: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("meals", {
      userId: args.userId,
      date: args.date,
      name: args.name,
      calories: args.calories,
      protein: args.protein,
      carbs: args.carbs,
      fat: args.fat,
      time: args.time,
      aiSuggestion: args.aiSuggestion,
      mealType: args.mealType ?? "unspecified",
      components: args.components,
      confidence: args.confidence,
      nutritionSource: args.nutritionSource,
      structuredItems: args.structuredItems,
      ingredientBreakdown: args.ingredientBreakdown,
    });
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

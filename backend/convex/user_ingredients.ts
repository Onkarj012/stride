import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export const upsertIngredient = internalMutation({
  args: {
    userId: v.string(),
    displayName: v.string(),
    caloriesPer100g: v.optional(v.number()),
    proteinPer100g: v.optional(v.number()),
    carbsPer100g: v.optional(v.number()),
    fatPer100g: v.optional(v.number()),
    notes: v.optional(v.string()),
    date: v.string(),
  },
  handler: async (ctx, { userId, displayName, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, notes, date }) => {
    const normalizedName = normalize(displayName);
    if (!normalizedName) return;

    const existing = await ctx.db
      .query("user_ingredients")
      .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("normalizedName", normalizedName))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        caloriesPer100g: caloriesPer100g ?? existing.caloriesPer100g,
        proteinPer100g: proteinPer100g ?? existing.proteinPer100g,
        carbsPer100g: carbsPer100g ?? existing.carbsPer100g,
        fatPer100g: fatPer100g ?? existing.fatPer100g,
        notes: notes ?? existing.notes,
        source: "corrected",
        lastUpdated: date,
      });
    } else {
      await ctx.db.insert("user_ingredients", {
        userId, normalizedName, displayName,
        caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g,
        notes, source: "user_stated", lastUpdated: date,
      });
    }
  },
});

export const getForContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("user_ingredients")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      name: r.displayName,
      caloriesPer100g: r.caloriesPer100g,
      proteinPer100g: r.proteinPer100g,
      carbsPer100g: r.carbsPer100g,
      fatPer100g: r.fatPer100g,
      notes: r.notes,
    }));
  },
});

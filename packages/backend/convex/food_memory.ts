import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizeName, AUTO_APPLY_MIN_LOGGED } from "./food_memory_match";

// ─── Public query: count known (promoted) memories for the current user ──────

export const getKnownCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const rows = await ctx.db
      .query("food_memory")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    return rows.filter((r) => r.timesLogged >= AUTO_APPLY_MIN_LOGGED).length;
  },
});

// ─── Public query: top memories for the current user (for context hint UI) ───

export const getTopMemoriesPublic = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("food_memory")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    return rows
      .filter((r) => r.timesLogged >= AUTO_APPLY_MIN_LOGGED)
      .sort((a, b) => b.timesLogged - a.timesLogged || b.lastUsedDate.localeCompare(a.lastUsedDate))
      .slice(0, 6)
      .map((r) => ({ name: r.displayName, kcal: Math.round(r.kcal), timesLogged: r.timesLogged }));
  },
});

// ─── Internal query: fetch all memory entries for a user ────────────────────

export const getForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("food_memory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
});

// ─── Internal query: top N entries for context injection ────────────────────

export const getTopForContext = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit = 10 }) => {
    const rows = await ctx.db
      .query("food_memory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .sort((a, b) => b.timesLogged - a.timesLogged || b.lastUsedDate.localeCompare(a.lastUsedDate))
      .slice(0, limit)
      .map((r) => ({
        name: r.displayName,
        kcal: Math.round(r.kcal),
        protein: Math.round(r.protein),
        carbs: Math.round(r.carbs),
        fat: Math.round(r.fat),
        timesLogged: r.timesLogged,
        components: r.components,
      }));
  },
});

// ─── Internal mutation: learn or update from a logged meal ──────────────────

export const recordFromMeal = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    kcal: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    components: v.optional(v.string()),
    date: v.string(),
    source: v.optional(v.string()), // "learned" | "corrected"
  },
  handler: async (ctx, { userId, name, kcal, protein, carbs, fat, components, date, source = "learned" }) => {
    const normalized = normalizeName(name);
    if (!normalized) return null;

    const existing = await ctx.db
      .query("food_memory")
      .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("normalizedName", normalized))
      .first();

    if (!existing) {
      return ctx.db.insert("food_memory", {
        userId,
        normalizedName: normalized,
        displayName: name,
        aliases: [],
        kcal,
        protein,
        carbs,
        fat,
        components,
        timesLogged: 1,
        source,
        lastUsedDate: date,
      });
    }

    // Running smoothed average (weight recent corrections more)
    const w = source === "corrected" ? 0.5 : 0.2; // correction = 50%, new log = 20%
    const smooth = (old: number, next: number) => Math.round((old * (1 - w) + next * w) * 10) / 10;

    // Add as alias if display name differs
    const aliases = existing.aliases.includes(name) || existing.displayName === name
      ? existing.aliases
      : [...existing.aliases, name].slice(-5); // keep last 5 aliases

    await ctx.db.patch(existing._id, {
      kcal: smooth(existing.kcal, kcal),
      protein: smooth(existing.protein, protein),
      carbs: smooth(existing.carbs, carbs),
      fat: smooth(existing.fat, fat),
      components: components ?? existing.components,
      timesLogged: existing.timesLogged + 1,
      source: source === "corrected" ? "corrected" : existing.source,
      lastUsedDate: date,
      aliases,
    });
    return existing._id;
  },
});

// ─── Internal mutation: update from a user correction ───────────────────────

export const updateFromCorrection = internalMutation({
  args: {
    foodMemoryId: v.id("food_memory"),
    kcal: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    date: v.string(),
  },
  handler: async (ctx, { foodMemoryId, kcal, protein, carbs, fat, date }) => {
    const existing = await ctx.db.get(foodMemoryId);
    if (!existing) return;
    const w = 0.5;
    const smooth = (old: number, next: number) => Math.round((old * (1 - w) + next * w) * 10) / 10;
    await ctx.db.patch(foodMemoryId, {
      kcal: smooth(existing.kcal, kcal),
      protein: smooth(existing.protein, protein),
      carbs: smooth(existing.carbs, carbs),
      fat: smooth(existing.fat, fat),
      source: "corrected",
      lastUsedDate: date,
    });
  },
});

export { AUTO_APPLY_MIN_LOGGED };

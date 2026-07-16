import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
    return rows.filter((r) => !r.undoneAt && !r.deletedAt && r.approvalStatus !== "pending" && r.approvalStatus !== "rejected" && r.timesLogged >= AUTO_APPLY_MIN_LOGGED).length;
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
      .filter((r) => !r.undoneAt && !r.deletedAt && r.approvalStatus !== "pending" && r.approvalStatus !== "rejected" && r.timesLogged >= AUTO_APPLY_MIN_LOGGED)
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
      .filter((r) => !r.undoneAt && !r.deletedAt && r.approvalStatus !== "pending" && r.approvalStatus !== "rejected")
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

export async function recordFoodMemoryRow(ctx: any, args: {
  userId: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  components?: string;
  date: string;
  source?: string;
  sourceActionId?: string;
}) {
  const { userId, name, kcal, protein, carbs, fat, components, date, source = "learned", sourceActionId } = args;
    const normalized = normalizeName(name);
    if (!normalized) return null;

    const existing = await ctx.db
      .query("food_memory")
      .withIndex("by_user_name", (q: any) => q.eq("userId", userId).eq("normalizedName", normalized))
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
        memoryType: "inferred",
        approvalStatus: source === "corrected" ? "approved" : "pending",
        provenance: source,
        sourceActionIds: sourceActionId ? [sourceActionId] : [],
      });
    }

    // Running smoothed average (weight recent corrections more)
    const w = source === "corrected" ? 0.5 : 0.2; // correction = 50%, new log = 20%
    const smooth = (old: number, next: number) => Math.round((old * (1 - w) + next * w) * 10) / 10;

    // Add as alias if display name differs
    const aliases = existing.aliases.includes(name) || existing.displayName === name
      ? existing.aliases
      : [...existing.aliases, name].slice(-5); // keep last 5 aliases
    const newTimesLogged = existing.timesLogged + 1;
    const autoPromote = existing.approvalStatus === "pending" && source !== "corrected" && newTimesLogged >= AUTO_APPLY_MIN_LOGGED;

    await ctx.db.patch(existing._id, {
      kcal: smooth(existing.kcal, kcal),
      protein: smooth(existing.protein, protein),
      carbs: smooth(existing.carbs, carbs),
      fat: smooth(existing.fat, fat),
      components: components ?? existing.components,
      timesLogged: newTimesLogged,
      source: source === "corrected" ? "corrected" : existing.source,
      lastUsedDate: date,
      aliases,
      memoryType: existing.memoryType ?? "inferred",
      approvalStatus: source === "corrected"
        ? "approved"
        : autoPromote
          ? "approved"
          : (existing.approvalStatus ?? "pending"),
      provenance: source,
      sourceActionIds: sourceActionId && !(existing.sourceActionIds ?? []).includes(sourceActionId)
        ? [...(existing.sourceActionIds ?? []), sourceActionId]
        : existing.sourceActionIds,
    });
    return existing._id;
}

export const recordFromMeal = internalMutation({
  args: {
    userId: v.string(), name: v.string(), kcal: v.number(), protein: v.number(), carbs: v.number(), fat: v.number(),
    components: v.optional(v.string()), date: v.string(), source: v.optional(v.string()), sourceActionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => recordFoodMemoryRow(ctx, args),
});

// ─── Internal mutation: update from a user correction ───────────────────────

export const updateFromCorrection = internalMutation({
  args: {
    foodMemoryId: v.id("food_memory"),
    kcal: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    name: v.optional(v.string()),
    date: v.string(),
  },
  handler: async (ctx, { foodMemoryId, kcal, protein, carbs, fat, name, date }) => {
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
      aliases: name && !existing.aliases.includes(name) && existing.displayName !== name
        ? [...existing.aliases, name].slice(-5)
        : existing.aliases,
      approvalStatus: "approved",
      memoryType: existing.memoryType ?? "inferred",
      provenance: "user_corrected",
    });
  },
});

export const getPendingForAction = internalQuery({
  args: { userId: v.string(), sourceActionId: v.string() },
  handler: async (ctx, { userId, sourceActionId }) => (await ctx.db.query("food_memory").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
    .filter((row) => row.approvalStatus === "pending" && (row.sourceActionIds ?? []).includes(sourceActionId))
    .map((row) => ({ memoryId: row._id, kind: "food" as const, label: row.displayName })),
});

export const getPendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return (await ctx.db.query("food_memory").withIndex("by_user", (q) => q.eq("userId", identity.subject)).collect())
      .filter((row) => row.approvalStatus === "pending" && !row.undoneAt && !row.deletedAt);
  },
});

export const approveMemory = mutation({
  args: { id: v.id("food_memory") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== identity.subject) throw new Error("Not found");
    await ctx.db.patch(id, { approvalStatus: "approved" });
    return id;
  },
});

export const rejectMemory = mutation({
  args: { id: v.id("food_memory") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== identity.subject) throw new Error("Not found");
    await ctx.db.patch(id, { approvalStatus: "rejected" });
    return id;
  },
});

export const undoMemory = mutation({
  args: { id: v.id("food_memory") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== identity.subject) throw new Error("Not found");
    await ctx.db.patch(id, { undoneAt: Date.now() });
    return id;
  },
});

export const deleteMemory = mutation({
  args: { id: v.id("food_memory") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== identity.subject) throw new Error("Not found");
    await ctx.db.patch(id, { deletedAt: Date.now() });
    return id;
  },
});

export const createExplicitFact = mutation({
  args: { fact: v.string(), date: v.optional(v.string()), sourceActionId: v.optional(v.string()) },
  handler: async (ctx, { fact, date, sourceActionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const displayName = fact.trim();
    const normalized = normalizeName(displayName);
    if (!normalized) throw new Error("Fact is required");
    const existing = await ctx.db
      .query("food_memory")
      .withIndex("by_user_name", (q) => q.eq("userId", identity.subject).eq("normalizedName", normalized))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        memoryType: "explicit", approvalStatus: "approved", provenance: "user_stated",
        fact: displayName, lastUsedDate: date ?? existing.lastUsedDate,
      });
      return existing._id;
    }
    return ctx.db.insert("food_memory", {
      userId: identity.subject, normalizedName: normalized, displayName, aliases: [],
      kcal: 0, protein: 0, carbs: 0, fat: 0, timesLogged: 1,
      source: "user_stated", lastUsedDate: date ?? new Date().toISOString().slice(0, 10),
      memoryType: "explicit", approvalStatus: "approved", provenance: "user_stated",
      sourceActionIds: sourceActionId ? [sourceActionId] : [], fact: displayName,
    });
  },
});

export { AUTO_APPLY_MIN_LOGGED };

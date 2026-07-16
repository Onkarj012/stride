import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function smooth(old: number, next: number, w = 0.25): number {
  return Math.round((old * (1 - w) + next * w) * 10) / 10;
}

export async function recordWorkoutMemoryRow(ctx: any, args: {
  userId: string;
  name: string;
  exercises?: string;
  durationMin?: number;
  intensity?: string;
  caloriesBurned?: number;
  date: string;
  sourceActionId?: string;
}) {
  const { userId, name, exercises, durationMin, intensity, caloriesBurned, date, sourceActionId } = args;
    const normalized = normalizeName(name);
    if (!normalized) return;

    const existing = await ctx.db
      .query("workout_memory")
      .withIndex("by_user_name", (q: any) => q.eq("userId", userId).eq("normalizedName", normalized))
      .first();

    if (!existing) {
      await ctx.db.insert("workout_memory", {
        userId, normalizedName: normalized, displayName: name,
        aliases: [], exercises, durationMin, intensity,
        caloriesBurned, timesLogged: 1, lastUsedDate: date,
        memoryType: "inferred", approvalStatus: "pending", provenance: "learned",
        sourceActionIds: sourceActionId ? [sourceActionId] : [],
      });
      return;
    }

    const aliases = existing.displayName === name || existing.aliases.includes(name)
      ? existing.aliases
      : [...existing.aliases, name].slice(-5);

    await ctx.db.patch(existing._id, {
      exercises: exercises ?? existing.exercises,
      durationMin: durationMin != null
        ? smooth(existing.durationMin ?? durationMin, durationMin)
        : existing.durationMin,
      intensity: intensity ?? existing.intensity,
      caloriesBurned: caloriesBurned != null
        ? smooth(existing.caloriesBurned ?? caloriesBurned, caloriesBurned)
        : existing.caloriesBurned,
      timesLogged: existing.timesLogged + 1,
      lastUsedDate: date,
      aliases,
      memoryType: existing.memoryType ?? "inferred",
      approvalStatus: existing.approvalStatus ?? "pending",
      provenance: "learned",
      sourceActionIds: sourceActionId && !(existing.sourceActionIds ?? []).includes(sourceActionId)
        ? [...(existing.sourceActionIds ?? []), sourceActionId]
        : existing.sourceActionIds,
    });
}

export const recordFromWorkout = internalMutation({
  args: {
    userId: v.string(), name: v.string(), exercises: v.optional(v.string()), durationMin: v.optional(v.number()),
    intensity: v.optional(v.string()), caloriesBurned: v.optional(v.number()), date: v.string(), sourceActionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => recordWorkoutMemoryRow(ctx, args),
});

export const getTopForContext = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit = 6 }) => {
    const rows = await ctx.db
      .query("workout_memory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((r) => !r.undoneAt && !r.deletedAt && r.approvalStatus !== "pending" && r.approvalStatus !== "rejected")
      .sort((a, b) => b.timesLogged - a.timesLogged || b.lastUsedDate.localeCompare(a.lastUsedDate))
      .slice(0, limit)
      .map((r) => ({
        name: r.displayName,
        durationMin: r.durationMin,
        intensity: r.intensity,
        caloriesBurned: r.caloriesBurned,
        timesLogged: r.timesLogged,
        exercises: r.exercises,
      }));
  },
});

export const getPendingForAction = internalQuery({
  args: { userId: v.string(), sourceActionId: v.string() },
  handler: async (ctx, { userId, sourceActionId }) => (await ctx.db.query("workout_memory").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
    .filter((row) => row.approvalStatus === "pending" && (row.sourceActionIds ?? []).includes(sourceActionId))
    .map((row) => ({ memoryId: row._id, kind: "workout" as const, label: row.displayName })),
});

export const approveMemory = mutation({
  args: { id: v.id("workout_memory") },
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
  args: { id: v.id("workout_memory") },
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
  args: { id: v.id("workout_memory") },
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
  args: { id: v.id("workout_memory") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== identity.subject) throw new Error("Not found");
    await ctx.db.patch(id, { deletedAt: Date.now() });
    return id;
  },
});

export const updateFromCorrection = internalMutation({
  args: {
    userId: v.string(), previousName: v.optional(v.string()), name: v.string(),
    exercises: v.optional(v.string()), durationMin: v.optional(v.number()), intensity: v.optional(v.string()),
    caloriesBurned: v.optional(v.number()), date: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeName(args.name);
    const previousNormalized = args.previousName ? normalizeName(args.previousName) : normalized;
    const rows = await ctx.db.query("workout_memory").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    const existing = rows.find((row) => row.normalizedName === previousNormalized || row.normalizedName === normalized);
    if (!existing) return recordWorkoutMemoryRow(ctx, { ...args, sourceActionId: undefined });
    const aliases = existing.aliases.includes(args.name) || existing.displayName === args.name
      ? existing.aliases
      : [...existing.aliases, args.name].slice(-5);
    await ctx.db.patch(existing._id, {
      aliases, approvalStatus: "approved", provenance: "user_corrected", lastUsedDate: args.date,
      exercises: args.exercises ?? existing.exercises,
      durationMin: args.durationMin != null ? smooth(existing.durationMin ?? args.durationMin, args.durationMin) : existing.durationMin,
      intensity: args.intensity ?? existing.intensity,
      caloriesBurned: args.caloriesBurned != null ? smooth(existing.caloriesBurned ?? args.caloriesBurned, args.caloriesBurned) : existing.caloriesBurned,
    });
    return existing._id;
  },
});

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function smooth(old: number, next: number, w = 0.25): number {
  return Math.round((old * (1 - w) + next * w) * 10) / 10;
}

export const recordFromWorkout = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    exercises: v.optional(v.string()),  // JSON exercise names
    durationMin: v.optional(v.number()),
    intensity: v.optional(v.string()),
    caloriesBurned: v.optional(v.number()),
    date: v.string(),
  },
  handler: async (ctx, { userId, name, exercises, durationMin, intensity, caloriesBurned, date }) => {
    const normalized = normalizeName(name);
    if (!normalized) return;

    const existing = await ctx.db
      .query("workout_memory")
      .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("normalizedName", normalized))
      .first();

    if (!existing) {
      await ctx.db.insert("workout_memory", {
        userId, normalizedName: normalized, displayName: name,
        aliases: [], exercises, durationMin, intensity,
        caloriesBurned, timesLogged: 1, lastUsedDate: date,
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
    });
  },
});

export const getTopForContext = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit = 6 }) => {
    const rows = await ctx.db
      .query("workout_memory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
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

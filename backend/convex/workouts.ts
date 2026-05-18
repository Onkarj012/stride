import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export const getWorkouts = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    return ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
  },
});

export const addWorkout = mutation({
  args: {
    name: v.string(),
    sets: v.string(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.string(),
    date: v.optional(v.string()),
    exercises: v.optional(v.any()),
    rationale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const date = args.date ?? new Date().toISOString().split("T")[0];
    return ctx.db.insert("workouts", {
      userId,
      date,
      name: args.name,
      sets: args.sets,
      reps: args.reps,
      weight: args.weight,
      duration: args.duration,
      intensity: args.intensity || "HIGH",
      exercises: args.exercises,
      rationale: args.rationale,
    });
  },
});

export const updateWorkout = mutation({
  args: {
    id: v.id("workouts"),
    name: v.string(),
    sets: v.string(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.string(),
    exercises: v.optional(v.any()),
    rationale: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await requireUserId(ctx);
    const workout = await ctx.db.get(id);
    if (!workout || workout.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, {
      name: fields.name,
      sets: fields.sets,
      reps: fields.reps,
      weight: fields.weight,
      duration: fields.duration,
      intensity: fields.intensity,
      exercises: fields.exercises,
      rationale: fields.rationale,
    });
  },
});

export const deleteWorkout = mutation({
  args: { id: v.id("workouts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const workout = await ctx.db.get(id);
    if (!workout || workout.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// ─── Internal (called by AI action) ──────────────────────────────────────────

export const getWorkoutsForContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) =>
    ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect(),
});

export const getRecentWorkoutNames = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .order("desc")
      .take(10);
    return workouts.map((w) => w.name);
  },
});

export const addWorkoutFromAI = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    sets: v.string(),
    duration: v.optional(v.string()),
    intensity: v.string(),
    date: v.string(),
    exercises: v.optional(v.any()),
    rationale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("workouts", {
      userId: args.userId,
      date: args.date,
      name: args.name,
      sets: args.sets,
      duration: args.duration,
      intensity: args.intensity || "HIGH",
      exercises: args.exercises,
      rationale: args.rationale,
    });
  },
});

export const getWorkoutsByDateRange = internalQuery({
  args: { userId: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { userId, startDate, endDate }) => {
    return ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .filter((q) => q.lte(q.field("date"), endDate))
      .collect();
  },
});

import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { applyDayAdjustment } from "./goals";
import { internal } from "./_generated/api";
import { deriveGroupKey, deriveMemberKey } from "./actions_idempotency";
import {
  buildIdempotencyKey,
  isSimilarWorkout,
  minutesBetweenTimes,
  normalizeLogSource,
  validateWorkoutWrite,
  workoutTimeWindowKey,
  workoutContentHash,
} from "./validation";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

async function findExistingWorkoutByIdempotencyKey(ctx: any, userId: string, date: string, idempotencyKey: string) {
  return ctx.db
    .query("workouts")
    .withIndex("by_user_date_and_idempotency_key", (q: any) =>
      q.eq("userId", userId).eq("date", date).eq("idempotencyKey", idempotencyKey),
    )
    .first();
}

export async function assertNoNearDuplicateWorkout(
  ctx: any,
  userId: string,
  date: string,
  workout: any,
  timestamp: string,
) {
  const workouts = await ctx.db
    .query("workouts")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .collect();
  const duplicate = workouts.find((existing: any) => {
    const minutes = minutesBetweenTimes(existing.timestamp, timestamp);
    return minutes != null && minutes <= 10 && isSimilarWorkout(workout, existing);
  });
  if (duplicate) {
    throw new ConvexError({
      code: "NEAR_DUPLICATE",
      message: "Looks like you already logged this — log anyway?",
      workoutId: duplicate._id,
    });
  }
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

export const getTotalCaloriesBurned = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
    const total = workouts.reduce((sum, w) => sum + (w.caloriesBurned ?? 0), 0);
    return { total, count: workouts.length };
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
    caloriesBurned: v.optional(v.number()),
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    structuredSets: v.optional(v.string()),
    logSource: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    idempotencyToken: v.optional(v.string()),
    parseError: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const date = args.date ?? new Date().toISOString().split("T")[0];
    const validated = validateWorkoutWrite(args);
    const logSource = normalizeLogSource(args.logSource, "manual");
    const contentHash = workoutContentHash(validated);
    const idempotencyKey = buildIdempotencyKey({
      userId,
      date,
      source: logSource,
      contentHash,
      timeWindow: workoutTimeWindowKey({
        date,
        contentHash,
        timestamp: args.timestamp,
        idempotencyToken: args.idempotencyToken,
      }),
    });
    const existing = await findExistingWorkoutByIdempotencyKey(ctx, userId, date, idempotencyKey);
    if (existing) return existing._id;
    const timestamp = args.timestamp ?? new Date().toISOString().slice(11, 16);
    if (!args.allowDuplicate) {
      await assertNoNearDuplicateWorkout(ctx, userId, date, validated, timestamp);
    }
    const id = await ctx.db.insert("workouts", {
      userId, date,
      name: validated.name, sets: validated.sets, reps: args.reps, weight: args.weight,
      duration: validated.duration, intensity: validated.intensity || "HIGH",
      exercises: args.exercises, rationale: args.rationale,
      caloriesBurned: validated.caloriesBurned,
      calorieConfidence: validated.calorieConfidence,
      calorieRangeLow: validated.calorieRangeLow,
      calorieRangeHigh: validated.calorieRangeHigh,
      calorieEstimateRough: args.calorieEstimateRough,
      calorieBreakdown: args.calorieBreakdown,
      calculationVersion: args.calculationVersion,
      structuredSets: args.structuredSets,
      timestamp,
      logSource,
      idempotencyKey,
    });
    await applyDayAdjustment(ctx, userId, date);
    const durationMin = args.duration ? parseFloat(args.duration) : undefined;
    await ctx.runMutation(internal.workout_memory.recordFromWorkout, {
      userId, name: validated.name, date,
      exercises: Array.isArray(args.exercises) ? JSON.stringify((args.exercises as any[]).map((e: any) => e.name).filter(Boolean)) : undefined,
      durationMin: isNaN(durationMin as number) ? undefined : durationMin,
      intensity: validated.intensity || undefined,
      caloriesBurned: validated.caloriesBurned,
    }).catch(() => {});
    return id;
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
    caloriesBurned: v.optional(v.number()),
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    structuredSets: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const validated = validateWorkoutWrite(fields);
    const userId = await requireUserId(ctx);
    const workout = await ctx.db.get(id);
    if (!workout || workout.userId !== userId) throw new Error("Not found");
    const patch: any = {
      name: validated.name,
      sets: validated.sets,
      reps: fields.reps,
      weight: fields.weight,
      duration: validated.duration,
      intensity: validated.intensity,
      exercises: fields.exercises,
      rationale: fields.rationale,
    };
    if (fields.caloriesBurned !== undefined) patch.caloriesBurned = validated.caloriesBurned;
    if (fields.calorieConfidence !== undefined) patch.calorieConfidence = validated.calorieConfidence;
    if (fields.calorieRangeLow !== undefined) patch.calorieRangeLow = validated.calorieRangeLow;
    if (fields.calorieRangeHigh !== undefined) patch.calorieRangeHigh = validated.calorieRangeHigh;
    if (fields.calorieEstimateRough !== undefined) patch.calorieEstimateRough = fields.calorieEstimateRough;
    if (fields.calorieBreakdown !== undefined) patch.calorieBreakdown = fields.calorieBreakdown;
    if (fields.calculationVersion !== undefined) patch.calculationVersion = fields.calculationVersion;
    if (fields.structuredSets !== undefined) patch.structuredSets = fields.structuredSets;
    await ctx.db.patch(id, patch);
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

/**
 * Re-log an existing workout as today (or a specified date).
 *
 * Mirrors `meals.relogMeal` for the History page's "log again" button.
 */
export const relogWorkout = mutation({
  args: {
    id: v.id("workouts"),
    date: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    idempotencyToken: v.optional(v.string()),
  },
  handler: async (ctx, { id, date, timestamp, idempotencyToken }) => {
    const userId = await requireUserId(ctx);
    const src = await ctx.db.get(id);
    if (!src || src.userId !== userId) throw new Error("Not found");
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const validated = validateWorkoutWrite({
      name: src.name,
      sets: src.sets,
      duration: src.duration,
      intensity: src.intensity,
      caloriesBurned: src.caloriesBurned,
      calorieConfidence: src.calorieConfidence,
      calorieRangeLow: src.calorieRangeLow,
      calorieRangeHigh: src.calorieRangeHigh,
    });
    const logSource = normalizeLogSource("relog", "relog");
    const contentHash = workoutContentHash(validated);
    const idempotencyKey = idempotencyToken?.trim()
      ? deriveMemberKey({
          groupKey: deriveGroupKey({
            userId,
            sourceSurface: "direct_ui",
            rawInput: `${targetDate}|${contentHash}`,
            clientSubmissionId: idempotencyToken,
          }),
          actionType: "workout",
          payloadFingerprint: contentHash,
          ordinal: 0,
        })
      : buildIdempotencyKey({
          userId,
          date: targetDate,
          source: logSource,
          contentHash,
          timeWindow: workoutTimeWindowKey({
            date: targetDate,
            contentHash,
            timestamp,
            idempotencyToken,
          }),
        });
    const existing = await findExistingWorkoutByIdempotencyKey(ctx, userId, targetDate, idempotencyKey);
    if (existing) return existing._id;
    return ctx.db.insert("workouts", {
      userId,
      date: targetDate,
      name: validated.name,
      sets: validated.sets,
      reps: src.reps,
      weight: src.weight,
      duration: validated.duration,
      intensity: validated.intensity,
      exercises: src.exercises,
      rationale: src.rationale,
      caloriesBurned: validated.caloriesBurned,
      calorieConfidence: validated.calorieConfidence,
      calorieRangeLow: validated.calorieRangeLow,
      calorieRangeHigh: validated.calorieRangeHigh,
      calorieEstimateRough: src.calorieEstimateRough,
      calorieBreakdown: src.calorieBreakdown,
      calculationVersion: src.calculationVersion,
      structuredSets: src.structuredSets,
      timestamp: timestamp ?? new Date().toISOString().slice(11, 16),
      logSource,
      idempotencyKey,
    });
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

export const getRecentWorkoutsDetailed = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .order("desc")
      .take(7);
    return workouts.map((w) => ({
      date: w.date,
      name: w.name,
      intensity: w.intensity,
      duration: w.duration,
      exercises: w.exercises,
    }));
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
    caloriesBurned: v.optional(v.number()),
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    structuredSets: v.optional(v.string()),
    logSource: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    idempotencyToken: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const validated = validateWorkoutWrite(args);
    const logSource = normalizeLogSource(args.logSource, "ai");
    const contentHash = workoutContentHash(validated);
    const idempotencyKey = buildIdempotencyKey({
      userId: args.userId,
      date: args.date,
      source: logSource,
      contentHash,
      timeWindow: workoutTimeWindowKey({
        date: args.date,
        contentHash,
        timestamp: args.timestamp,
        idempotencyToken: args.idempotencyToken,
      }),
    });
    const existing = await findExistingWorkoutByIdempotencyKey(ctx, args.userId, args.date, idempotencyKey);
    if (existing) return existing._id;
    const timestamp = args.timestamp ?? new Date().toISOString().slice(11, 16);
    if (!args.allowDuplicate) {
      await assertNoNearDuplicateWorkout(ctx, args.userId, args.date, validated, timestamp);
    }
    const id = await ctx.db.insert("workouts", {
      userId: args.userId, date: args.date,
      name: validated.name, sets: validated.sets, duration: validated.duration,
      intensity: validated.intensity || "HIGH",
      exercises: args.exercises, rationale: args.rationale,
      caloriesBurned: validated.caloriesBurned,
      calorieConfidence: validated.calorieConfidence,
      calorieRangeLow: validated.calorieRangeLow,
      calorieRangeHigh: validated.calorieRangeHigh,
      calorieEstimateRough: args.calorieEstimateRough,
      calorieBreakdown: args.calorieBreakdown,
      calculationVersion: args.calculationVersion,
      structuredSets: args.structuredSets,
      timestamp,
      logSource,
      idempotencyKey,
    });
    const durationMin = args.duration ? parseFloat(args.duration) : undefined;
    await ctx.runMutation(internal.workout_memory.recordFromWorkout, {
      userId: args.userId, name: validated.name, date: args.date,
      exercises: Array.isArray(args.exercises) ? JSON.stringify((args.exercises as any[]).map((e: any) => e.name).filter(Boolean)) : undefined,
      durationMin: isNaN(durationMin as number) ? undefined : durationMin,
      intensity: validated.intensity || undefined,
      caloriesBurned: validated.caloriesBurned,
    }).catch(() => {});
    return id;
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

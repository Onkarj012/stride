import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { deriveGroupKey } from "./actions_idempotency";
import { finalizeActionGroupAfterWrite } from "./actions_group";
import { recordBehaviorRow } from "./behavior";
import { recordActivityForUser } from "./gamification";
import { recomputeForAction } from "./derived_state";
import { buildWorkoutDraft, workoutPayloadFromDraft } from "./workout_draft";
import {
  buildIdempotencyKey,
  isSimilarWorkout,
  minutesBetweenTimes,
  normalizeLogSource,
  validateWorkoutWrite,
  workoutTimeWindowKey,
  workoutContentHash,
} from "./validation";
import { resolveTargetDateTime } from "./time_resolve";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

async function findExistingWorkoutByIdempotencyKey(ctx: any, userId: string, date: string, idempotencyKey: string) {
  const rows = await ctx.db
    .query("workouts")
    .withIndex("by_user_date_and_idempotency_key", (q: any) =>
      q.eq("userId", userId).eq("date", date).eq("idempotencyKey", idempotencyKey),
    )
    .collect();
  return rows.find((row: any) => !row.undoneAt) ?? null;
}

export async function assertNoNearDuplicateWorkout(
  ctx: any,
  userId: string,
  date: string,
  workout: any,
  timestamp: string,
) {
  const workouts = (await ctx.db
    .query("workouts")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .collect()).filter((workout: any) => !workout.undoneAt);
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

export async function writeWorkoutDomain(
  ctx: any,
  args: any,
  options: { emitBehavior?: boolean; emitGamification?: boolean; recomputeDerived?: boolean; sourceActionId?: string } = {},
) {
  const date = args.date ?? new Date().toISOString().split("T")[0];
  const logSource = normalizeLogSource(args.logSource, "manual");
  const profile = await ctx.db
    .query("user_profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
    .first();
  const metabolicProfile = await ctx.db
    .query("user_metabolic_profiles")
    .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
    .first();
  const profileForEstimate = {
    weightKg: profile?.weight,
    age: profile?.age,
    sex: profile?.sex,
    fitnessLevel: metabolicProfile?.fitnessLevel,
    metabolicFactor: metabolicProfile?.metabolicFactor,
  };
  const aiEstimateSource = ["ai", "coach", "home"].includes(logSource);
  const reportedCalories = args.reportedCalories ?? (args.calorieSource === "reported"
    ? args.caloriesBurned
    : args.calorieSource === "estimated" ? undefined
      : !aiEstimateSource && args.caloriesBurned != null ? args.caloriesBurned : undefined);
  const hasWeightForEstimate = typeof profile?.weight === "number" && profile.weight > 0;
  const externalEstimateAllowed = hasWeightForEstimate || logSource === "relog" || args.calorieEstimateProvenance === "non_personalized_met" || args.calorieEstimateProvenance === "broad_unknown_exercise";
  const estimatedCalories = externalEstimateAllowed
    ? args.estimatedCalories ?? (args.calorieSource === "estimated"
      ? args.caloriesBurned
      : aiEstimateSource ? args.caloriesBurned : undefined)
    : undefined;
  const draft = buildWorkoutDraft({
    name: args.name,
    date,
    time: args.timestamp ?? new Date().toISOString().slice(11, 16),
    duration: args.duration,
    durationMin: args.durationMin,
    intensity: args.intensity,
    sets: args.sets,
    exercises: args.exercises ?? args.structuredSets,
    reportedCalories,
    estimatedCalories,
    calorieSource: args.calorieSource === "reported" ? "reported" : estimatedCalories != null ? "estimated" : undefined,
    calorieEstimateProvenance: args.calorieEstimateProvenance,
    calorieConfidence: args.calorieConfidence,
    calorieRangeLow: args.calorieRangeLow,
    calorieRangeHigh: args.calorieRangeHigh,
    calorieEstimateRough: args.calorieEstimateRough,
    calorieBreakdown: args.calorieBreakdown,
    profile: profileForEstimate,
    rawInput: args.rawInput,
    rationale: args.rationale,
  });
  const payload = workoutPayloadFromDraft(draft, { userId: args.userId, logSource: args.logSource });
  const validated = validateWorkoutWrite(payload);
  const contentHash = workoutContentHash(validated);
  const idempotencyKey = buildIdempotencyKey({
    userId: args.userId,
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
  const existing = await findExistingWorkoutByIdempotencyKey(ctx, args.userId, date, idempotencyKey);
  if (existing) return existing._id;
  const timestamp = draft.time;
  if (!args.allowDuplicate) {
    await assertNoNearDuplicateWorkout(ctx, args.userId, date, validated, timestamp);
  }
  const id = await ctx.db.insert("workouts", {
    userId: args.userId,
    date,
    name: draft.name,
    sets: draft.setsSummary,
    reps: args.reps,
    weight: args.weight,
    duration: draft.duration,
    intensity: draft.intensity || "HIGH",
    exercises: draft.exercises,
    rationale: draft.rationale,
    caloriesBurned: validated.caloriesBurned,
    calorieConfidence: validated.calorieConfidence,
    calorieRangeLow: validated.calorieRangeLow,
    calorieRangeHigh: validated.calorieRangeHigh,
    calorieEstimateRough: draft.calorieEstimateRough,
    calorieBreakdown: draft.calorieBreakdown ? JSON.stringify(draft.calorieBreakdown) : undefined,
    calculationVersion: args.calculationVersion ?? (draft.estimatedCalories != null ? 1 : undefined),
    reportedCalories: draft.reportedCalories,
    estimatedCalories: draft.estimatedCalories,
    calorieSource: draft.calorieSource,
    calorieEstimateProvenance: draft.calorieEstimateProvenance,
    structuredSets: JSON.stringify(draft.exercises),
    workoutDraft: JSON.stringify(draft),
    timestamp,
    logSource,
    idempotencyKey,
    sourceActionId: options.sourceActionId,
  });
  if (options.emitBehavior) await recordBehaviorRow(ctx, args.userId, "log", "workout", undefined, date);
  if (options.emitGamification && date === new Date().toISOString().split("T")[0]) {
    await recordActivityForUser(ctx, args.userId, { type: "workout", date });
  }
  const durationMin = draft.durationMin;
  await ctx.runMutation(internal.workout_memory.recordFromWorkout, {
    userId: args.userId,
    name: draft.name,
    date,
    exercises: draft.exercises.length > 0 ? JSON.stringify(draft.exercises.map((exercise) => exercise.normalizedName)) : undefined,
    durationMin: isNaN(durationMin as number) ? undefined : durationMin,
    intensity: validated.intensity || undefined,
    caloriesBurned: validated.caloriesBurned,
    sourceActionId: options.sourceActionId,
  }).catch(() => {});
  if (options.recomputeDerived !== false) {
    await recomputeForAction(ctx, { userId: args.userId, actionType: "workout", date });
  }
  return id;
}

export const getWorkouts = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect();
    return workouts.filter((workout) => !workout.undoneAt);
  },
});

export const getTotalCaloriesBurned = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const workouts = (await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).filter((workout) => !workout.undoneAt);
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
    reportedCalories: v.optional(v.number()),
    estimatedCalories: v.optional(v.number()),
    calorieSource: v.optional(v.union(v.literal("reported"), v.literal("estimated"))),
    calorieEstimateProvenance: v.optional(v.string()),
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    structuredSets: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    rawInput: v.optional(v.string()),
    logSource: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    idempotencyToken: v.optional(v.string()),
    parseError: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const date = args.date ?? new Date().toISOString().split("T")[0];
    return writeWorkoutDomain(ctx, { ...args, userId, date }, { emitBehavior: true, emitGamification: true });
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
    reportedCalories: v.optional(v.number()),
    estimatedCalories: v.optional(v.number()),
    calorieSource: v.optional(v.union(v.literal("reported"), v.literal("estimated"))),
    calorieEstimateProvenance: v.optional(v.string()),
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    structuredSets: v.optional(v.string()),
    workoutDraft: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await requireUserId(ctx);
    const workout = await ctx.db.get(id);
    if (!workout || workout.userId !== userId) throw new Error("Not found");
    const profile = await ctx.db.query("user_profiles").withIndex("by_user", (q: any) => q.eq("userId", userId)).first();
    const metabolicProfile = await ctx.db.query("user_metabolic_profiles").withIndex("by_user", (q: any) => q.eq("userId", userId)).first();
    const calorieWasEdited = fields.caloriesBurned !== undefined || fields.reportedCalories !== undefined || fields.estimatedCalories !== undefined || fields.calorieSource !== undefined;
    const draft = buildWorkoutDraft({
      name: fields.name,
      date: workout.date,
      time: workout.timestamp,
      duration: fields.duration ?? workout.duration,
      intensity: fields.intensity,
      sets: fields.sets,
      exercises: fields.exercises ?? fields.structuredSets ?? workout.exercises ?? workout.structuredSets,
      reportedCalories: fields.reportedCalories ?? (fields.calorieSource === "reported" ? fields.caloriesBurned : fields.calorieSource !== "estimated" && fields.caloriesBurned !== undefined ? fields.caloriesBurned : !calorieWasEdited ? workout.reportedCalories : undefined),
      estimatedCalories: fields.estimatedCalories ?? (!calorieWasEdited ? workout.estimatedCalories : fields.calorieSource === "estimated" ? fields.caloriesBurned : undefined),
      calorieSource: fields.calorieSource ?? (!calorieWasEdited ? workout.calorieSource : fields.caloriesBurned !== undefined ? "reported" : undefined),
      calorieEstimateProvenance: (fields.calorieEstimateProvenance ?? workout.calorieEstimateProvenance) as any,
      calorieConfidence: fields.calorieConfidence ?? workout.calorieConfidence,
      calorieRangeLow: fields.calorieRangeLow ?? workout.calorieRangeLow,
      calorieRangeHigh: fields.calorieRangeHigh ?? workout.calorieRangeHigh,
      calorieEstimateRough: fields.calorieEstimateRough ?? workout.calorieEstimateRough,
      calorieBreakdown: fields.calorieBreakdown ?? workout.calorieBreakdown,
      profile: {
        weightKg: profile?.weight,
        age: profile?.age,
        sex: profile?.sex,
        fitnessLevel: metabolicProfile?.fitnessLevel,
        metabolicFactor: metabolicProfile?.metabolicFactor,
      },
      rationale: fields.rationale ?? workout.rationale,
    });
    const validated = validateWorkoutWrite(workoutPayloadFromDraft(draft));
    const patch: any = {
      name: draft.name,
      sets: draft.setsSummary,
      reps: fields.reps ?? workout.reps,
      weight: fields.weight ?? workout.weight,
      duration: draft.duration,
      intensity: draft.intensity,
      exercises: draft.exercises,
      rationale: draft.rationale,
      structuredSets: JSON.stringify(draft.exercises),
      workoutDraft: JSON.stringify(draft),
    };
    if (calorieWasEdited || workout.caloriesBurned !== undefined) patch.caloriesBurned = calorieWasEdited ? validated.caloriesBurned : workout.caloriesBurned;
    if (calorieWasEdited || workout.reportedCalories !== undefined) patch.reportedCalories = draft.reportedCalories;
    if (calorieWasEdited || workout.estimatedCalories !== undefined) patch.estimatedCalories = draft.estimatedCalories;
    if (calorieWasEdited || workout.calorieSource !== undefined) patch.calorieSource = draft.calorieSource;
    if (fields.calorieConfidence !== undefined || workout.calorieConfidence !== undefined) patch.calorieConfidence = validated.calorieConfidence;
    if (fields.calorieRangeLow !== undefined || workout.calorieRangeLow !== undefined) patch.calorieRangeLow = validated.calorieRangeLow;
    if (fields.calorieRangeHigh !== undefined || workout.calorieRangeHigh !== undefined) patch.calorieRangeHigh = validated.calorieRangeHigh;
    if (fields.calorieEstimateRough !== undefined || workout.calorieEstimateRough !== undefined) patch.calorieEstimateRough = draft.calorieEstimateRough;
    if (fields.calorieEstimateProvenance !== undefined || workout.calorieEstimateProvenance !== undefined) patch.calorieEstimateProvenance = draft.calorieEstimateProvenance;
    if (fields.calorieBreakdown !== undefined || workout.calorieBreakdown !== undefined) patch.calorieBreakdown = draft.calorieBreakdown ? JSON.stringify(draft.calorieBreakdown) : undefined;
    if (fields.calculationVersion !== undefined || workout.calculationVersion !== undefined) patch.calculationVersion = fields.calculationVersion ?? workout.calculationVersion;
    await ctx.db.patch(id, patch);
    ctx.scheduler.runAfter(0, internal.workout_memory.updateFromCorrection, {
      userId,
      previousName: workout.name,
      name: draft.name,
      exercises: draft.exercises.length > 0 ? JSON.stringify(draft.exercises.map((exercise) => exercise.normalizedName)) : undefined,
      durationMin: draft.durationMin,
      intensity: draft.intensity,
      caloriesBurned: validated.caloriesBurned,
      date: workout.date,
    }).catch(() => {});
    await recomputeForAction(ctx, { userId, actionType: "workout", date: workout.date });
  },
});

export const deleteWorkout = mutation({
  args: { id: v.id("workouts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const workout = await ctx.db.get(id);
    if (!workout || workout.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
    await recomputeForAction(ctx, { userId, actionType: "workout", date: workout.date });
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
  handler: async (ctx, { id, date, timestamp, idempotencyToken }): Promise<any> => {
    const userId = await requireUserId(ctx);
    const src = await ctx.db.get(id);
    if (!src || src.userId !== userId) throw new Error("Not found");
    const { date: targetDate, time: targetTime } = resolveTargetDateTime({ date, time: timestamp }, true);
    const rawInput = `relog:${String(src._id)}:${targetDate}`;
    const groupIdempotencyKey = deriveGroupKey({
      userId,
      sourceSurface: "direct_ui",
      rawInput,
      clientSubmissionId: idempotencyToken,
    });
    const resultId = await ctx.runMutation(internal.actions_writer.writeWorkoutAction, {
      group: { userId, groupIdempotencyKey, sourceSurface: "direct_ui", rawInput },
      member: {
        payload: {
          userId,
          date: targetDate,
          name: src.name,
          sets: src.sets,
          reps: src.reps,
          weight: src.weight,
          duration: src.duration,
          intensity: src.intensity,
          exercises: src.exercises ?? src.structuredSets,
          rationale: src.rationale,
          caloriesBurned: src.caloriesBurned,
          reportedCalories: src.reportedCalories,
          estimatedCalories: src.estimatedCalories,
          calorieSource: src.calorieSource,
          calorieEstimateProvenance: src.calorieEstimateProvenance,
          calorieConfidence: src.calorieConfidence,
          calorieRangeLow: src.calorieRangeLow,
          calorieRangeHigh: src.calorieRangeHigh,
          calorieEstimateRough: src.calorieEstimateRough,
          calorieBreakdown: src.calorieBreakdown,
          calculationVersion: src.calculationVersion,
          timestamp: targetTime,
          logSource: "relog",
          idempotencyToken,
          allowDuplicate: true,
        },
        provenance: "user_reported",
        validation: { status: "valid", messages: [] },
        reversible: true,
        resolvedDate: targetDate,
        resolvedTime: targetTime,
      },
    });
    await finalizeActionGroupAfterWrite(ctx, userId, groupIdempotencyKey);
    return resultId;
  },
});

// ─── Internal (called by AI action) ──────────────────────────────────────────

export const getWorkoutsForContext = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, { userId, date }) =>
    (await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .collect()).filter((workout) => !workout.undoneAt),
});

export const getRecentWorkoutNames = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const workouts = (await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .order("desc")
      .collect()).filter((workout) => !workout.undoneAt).slice(0, 10);
    return workouts.map((w) => w.name);
  },
});

export const getRecentWorkoutsDetailed = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const workouts = (await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .order("desc")
      .collect()).filter((workout) => !workout.undoneAt).slice(0, 7);
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
    reportedCalories: v.optional(v.number()),
    estimatedCalories: v.optional(v.number()),
    calorieSource: v.optional(v.union(v.literal("reported"), v.literal("estimated"))),
    calorieEstimateProvenance: v.optional(v.string()),
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    structuredSets: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    rawInput: v.optional(v.string()),
    logSource: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    idempotencyToken: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return writeWorkoutDomain(ctx, args, { emitBehavior: false, emitGamification: false });
  },
});

export const getWorkoutsByDateRange = internalQuery({
  args: { userId: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { userId, startDate, endDate }) => {
    return (await ctx.db
      .query("workouts")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", startDate))
      .collect()).filter((workout) => workout.date <= endDate && !workout.undoneAt);
  },
});

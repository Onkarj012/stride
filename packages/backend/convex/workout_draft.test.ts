import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  buildWorkoutDraft,
  buildWorkoutDraft as buildCanonicalWorkoutDraft,
  QUALITY_THRESHOLD,
  RUNNER_UP_MARGIN,
  selectExerciseCandidate,
  workoutPayloadFromDraft,
} from "./workout_draft";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const date = "2026-07-16";
const candidates = [{ exerciseId: "barbell_back_squat", canonicalName: "Barbell Back Squat", score: 1, metValue: 5, category: "strength" as const }];

function member(payload: any, key: string) {
  return {
    memberIdempotencyKey: key,
    payload,
    provenance: "user_reported" as const,
    validation: { status: "valid" as const, messages: [] },
    reversible: true,
    resolvedDate: date,
    resolvedTime: "08:00",
  };
}

function workoutDraft(overrides: Record<string, unknown> = {}) {
  return buildWorkoutDraft({
    name: "Morning strength",
    date,
    time: "08:00",
    duration: "1h 30m",
    intensity: "HIGH",
    exercises: [{ name: "back squat", candidates, sets: [{ weight: "80", reps: "5", weight_unit: "kg", unilateral: false, rpe: "8" }] }],
    ...overrides,
  });
}

test("direct, parsed, relog-shaped inputs converge on one draft shape", () => {
  const direct = workoutDraft();
  const parsed = buildCanonicalWorkoutDraft({ ...direct, exercises: direct.exercises, duration: "90 min" });
  const relog = buildWorkoutDraft({ ...workoutPayloadFromDraft(direct), date: "2026-07-17", time: "09:00" });
  expect(new Set([direct, parsed, relog].map((draft) => Object.keys(draft).sort().join("|"))).size).toBe(1);
  expect(direct.duration).toBe("90 min");
  expect(relog.exercises[0]).toMatchObject({ normalizedName: "Barbell Back Squat", rawName: "back squat" });
});

test("exercise threshold accepts the boundary and rejects below it", () => {
  expect(selectExerciseCandidate([{ canonicalName: "A", score: QUALITY_THRESHOLD }])?.canonicalName).toBe("A");
  expect(selectExerciseCandidate([
    { canonicalName: "A", score: 0.9 },
    { canonicalName: "B", score: 0.9 - RUNNER_UP_MARGIN },
  ])?.canonicalName).toBe("A");
  expect(selectExerciseCandidate([
    { canonicalName: "A", score: QUALITY_THRESHOLD - 0.01 },
  ])).toBeNull();
});

test("unknown exercise stays explicit and gets a broad labeled estimate", () => {
  const draft = buildWorkoutDraft({
    name: "Odd movement",
    date,
    duration: "30 min",
    intensity: "MEDIUM",
    exercises: [{ name: "dragon crawler", candidates: [{ canonicalName: "Dragon Crawler", score: 0.69, metValue: 7 }], sets: [{ reps: "10" }] }],
    profile: { weightKg: 80, age: 30, sex: "male" },
  });
  expect(draft.exercises[0]).toMatchObject({ normalizationState: "unknown-explicit", rawName: "dragon crawler" });
  expect(draft.unresolved).toEqual(["dragon crawler"]);
  expect(draft.estimatedCalories).toBeGreaterThan(0);
  expect(draft.calorieEstimateProvenance).toBe("broad_unknown_exercise");
});

test("sets and cardio fields remain typed and duration-normalized", () => {
  const draft = buildWorkoutDraft({
    name: "Run and lift", date, duration: "45 min", intensity: "LOW",
    exercises: [
      { name: "back squat", candidates, sets: [{ weight: "80", reps: "5", weight_unit: "kg", unilateral: true, rpe: "8", effort: "hard" }] },
      { name: "treadmill run", candidates: [{ canonicalName: "Run", score: 0.9, metValue: 8, category: "cardio" }], muscle_group: "cardio", sets: [{ duration_min: "20", distance_km: "3.2", incline: "2", pace: "6:15", calories_per_hr: "500" }] },
    ],
  });
  expect(draft.exercises[0]?.sets[0]).toMatchObject({ reps: 5, load: 80, loadUnit: "kg", unilateral: true, rpe: 8, effort: "hard" });
  expect(draft.exercises[1]?.cardio).toMatchObject({ durationMin: 20, distance: 3.2, distanceUnit: "km", incline: 2, caloriesPerHour: 500 });
  expect(draft.duration).toBe("45 min");
});

test("reported and estimated calories remain separate", () => {
  const draft = workoutDraft({ reportedCalories: 450, estimatedCalories: 300, calorieSource: "reported" });
  expect(draft).toMatchObject({ calories: 450, reportedCalories: 450, estimatedCalories: 300, calorieSource: "reported" });
});

test("missing profile produces no demographic-default estimate", () => {
  const draft = workoutDraft({ duration: "30 min", profile: undefined });
  expect(draft.estimatedCalories).toBeUndefined();
  const payload = workoutPayloadFromDraft(draft);
  expect(payload.estimatedCalories).toBeUndefined();
});

test("canonical write, edit, relog, and undo preserve structured detail and adjustment", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "workout-pipeline-user" });
  const plan = await user.mutation(api.profile.upsertPlanFromOnboarding, {
    weightKg: 80, heightCm: 178, age: 28, sex: "male", occupationType: "desk", workHoursPerDay: 8,
    lifestyleActivity: "moderate", weeklyWorkouts: [{ type: "strength", durationMin: 60, sessionsPerWeek: 4 }], goal: "moderate_loss", date,
  });
  const draft = buildWorkoutDraft({ ...workoutDraft(), reportedCalories: plan.plannedEatPerTrainingDay + 250, calorieSource: "reported" });
  const id = await t.mutation((internal as any).actions_writer.writeWorkoutAction, {
    group: { userId: "workout-pipeline-user", groupIdempotencyKey: "workout-group", sourceSurface: "direct_ui", rawInput: "squats" },
    member: member(workoutPayloadFromDraft(draft, { logSource: "test" }), "workout-member"),
  });
  const stored: any = await t.run((ctx) => ctx.db.get(id));
  expect(stored).toMatchObject({ duration: "90 min", reportedCalories: plan.plannedEatPerTrainingDay + 250, calorieSource: "reported" });
  expect(JSON.parse(stored!.structuredSets!)[0]).toMatchObject({ rawName: "back squat", normalizationState: "canonical" });
  const before = JSON.parse(stored!.structuredSets!);
  await user.mutation(api.workouts.updateWorkout, { id, name: "Edited summary", sets: stored!.sets, duration: stored!.duration, intensity: stored!.intensity });
  const edited: any = await t.run((ctx) => ctx.db.get(id));
  expect(JSON.parse(edited!.structuredSets!)).toEqual(before);
  const relogId = await user.mutation(api.workouts.relogWorkout, { id, date: "2026-07-17", idempotencyToken: "relog-1" });
  const relogged: any = await t.run((ctx) => ctx.db.get(relogId));
  expect(JSON.parse(relogged!.structuredSets!)).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("actions").withIndex("by_user_status", (q) => q.eq("userId", "workout-pipeline-user").eq("status", "committed")).collect())).toHaveLength(2);
  expect(await user.query(api.goals.getDailyGoal, { date })).toMatchObject({ calorieGoal: plan.calories + 250 });
  const action = await t.run((ctx) => ctx.db.query("actions").withIndex("by_user_status", (q) => q.eq("userId", "workout-pipeline-user").eq("status", "committed")).first());
  await user.mutation((api as any).actions_undo.undoAction, { actionId: action!._id });
  expect(await user.query(api.workouts.getWorkouts, { date })).toHaveLength(0);
  expect(await user.query(api.goals.getDailyGoal, { date })).toMatchObject({ calorieGoal: plan.calories });
});

test("calibration counts committed canonical workout actions, not duplicate attempts", async () => {
  const t = convexTest(schema, modules);
  const draft = workoutDraft({ reportedCalories: 200, calorieSource: "reported" });
  const args = {
    group: { userId: "calibration-user", groupIdempotencyKey: "cal-group", sourceSurface: "direct_ui" as const, rawInput: "squat" },
    member: member(workoutPayloadFromDraft(draft, { logSource: "test" }), "cal-member"),
  };
  await t.mutation((internal as any).actions_writer.writeWorkoutAction, args);
  await t.mutation((internal as any).actions_writer.writeWorkoutAction, args);
  const profile = await t.run((ctx) => ctx.db.query("user_metabolic_profiles").withIndex("by_user", (q) => q.eq("userId", "calibration-user")).first());
  expect(profile?.totalWorkoutsTracked).toBe(1);
});

test("natural-language-shaped action writes then undo excludes workout from queries", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "nl-workout-user" });
  const draft = buildWorkoutDraft({ ...workoutDraft(), rawInput: "I did 3 sets of back squats" });
  const id = await t.mutation((internal as any).actions_writer.writeWorkoutAction, {
    group: { userId: "nl-workout-user", groupIdempotencyKey: "nl-group", sourceSurface: "chat", rawInput: "I did 3 sets of back squats" },
    member: member(workoutPayloadFromDraft(draft, { logSource: "coach" }), "nl-member"),
  });
  expect(await user.query(api.workouts.getWorkouts, { date })).toHaveLength(1);
  const action = await t.run((ctx) => ctx.db.query("actions").withIndex("by_user_status", (q) => q.eq("userId", "nl-workout-user").eq("status", "committed")).first());
  await user.mutation((api as any).actions_undo.undoAction, { actionId: action!._id });
  expect(await user.query(api.workouts.getWorkouts, { date })).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ undoneAt: expect.any(Number) });
});

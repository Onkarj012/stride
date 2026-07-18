/**
 * Canonical workout contract.
 *
 * Every workout source is reduced to this shape before the domain writer is
 * allowed to persist it. Raw exercise text is intentionally retained beside
 * normalized values so a weak match can never become an invisible canonical
 * exercise.
 */

import {
  calculateNonPersonalizedWorkoutCalories,
  calculateWorkoutCalories,
  parseDurationMinutes,
} from "./calorie_engine";
import { listExercises, type ExerciseMeta } from "./exercise_db";
import { assertInRange } from "./validation";

export const WORKOUT_QUALITY_THRESHOLD = 0.7;
export const WORKOUT_RUNNER_UP_MARGIN = 0.15;
export const QUALITY_THRESHOLD = WORKOUT_QUALITY_THRESHOLD;
export const RUNNER_UP_MARGIN = WORKOUT_RUNNER_UP_MARGIN;

export type WorkoutCalorieSource = "reported" | "estimated";
export type WorkoutNormalizationState = "canonical" | "unknown-explicit";
export type WorkoutEstimateProvenance =
  | "personalized_met"
  | "non_personalized_met"
  | "broad_unknown_exercise"
  | "provided_estimate"
  | "unavailable_missing_profile";

export type WorkoutExerciseCandidate = {
  exerciseId?: string;
  canonicalName: string;
  score: number;
  metValue?: number;
  category?: ExerciseMeta["category"];
};

export type WorkoutSet = {
  reps?: number;
  load?: number;
  loadUnit?: string;
  unilateral?: boolean;
  rpe?: number;
  effort?: string;
};

export type WorkoutCardio = {
  durationMin?: number;
  distance?: number;
  distanceUnit?: string;
  pace?: number | string;
  incline?: number;
  caloriesPerHour?: number;
};

export type WorkoutDraftExercise = {
  rawName: string;
  normalizedName: string;
  exerciseId?: string;
  normalizationState: WorkoutNormalizationState;
  normalizationConfidence: number;
  candidates: WorkoutExerciseCandidate[];
  category?: string;
  metValue?: number;
  muscleGroup?: string;
  sets: WorkoutSet[];
  cardio?: WorkoutCardio;
};

export type WorkoutProfile = {
  weightKg?: number | null;
  age?: number | null;
  sex?: string | null;
  fitnessLevel?: string | null;
  metabolicFactor?: number | null;
};

export type WorkoutDraft = {
  kind: "workout";
  name: string;
  date: string;
  time: string;
  durationMin?: number;
  duration?: string;
  intensity: string;
  setsSummary: string;
  exercises: WorkoutDraftExercise[];
  reportedCalories?: number;
  estimatedCalories?: number;
  calories?: number;
  calorieSource?: WorkoutCalorieSource;
  calorieEstimateProvenance?: WorkoutEstimateProvenance;
  calorieConfidence?: number;
  calorieRangeLow?: number;
  calorieRangeHigh?: number;
  calorieEstimateRough?: boolean;
  calorieBreakdown?: Record<string, unknown>;
  unresolved: string[];
  confidence: number;
  rawInput?: string;
  rationale?: string;
  validationFlags: string[];
};

export type WorkoutDraftExerciseInput = {
  name?: string;
  rawName?: string;
  exerciseId?: string;
  normalizedName?: string;
  confidence?: number;
  muscle_group?: string;
  muscleGroup?: string;
  weight_unit?: string;
  sets?: Array<Record<string, unknown>>;
  cardio?: Record<string, unknown>;
  candidates?: WorkoutExerciseCandidate[];
};

export type WorkoutDraftInput = {
  name: string;
  date: string;
  time?: string;
  duration?: string | number;
  durationMin?: number;
  intensity?: string;
  sets?: string;
  exercises?: unknown;
  reportedCalories?: number;
  estimatedCalories?: number;
  caloriesBurned?: number;
  calorieSource?: WorkoutCalorieSource;
  calorieEstimateProvenance?: WorkoutEstimateProvenance;
  calorieConfidence?: number;
  calorieRangeLow?: number;
  calorieRangeHigh?: number;
  calorieEstimateRough?: boolean;
  calorieBreakdown?: Record<string, unknown> | string;
  profile?: WorkoutProfile;
  rawInput?: string;
  rationale?: string;
};

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
  return number != null && Number.isFinite(number) ? number : undefined;
}

function nonNegative(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number == null ? undefined : Math.max(0, number);
}

const FIELD_LIMITS = {
  reps: [100, 1_000],
  load: [500, 2_000],
  distance: [100, 1_000],
  duration: [300, 1_440],
  incline: [30, 60],
  caloriesPerHour: [1_500, 3_000],
} as const;

function bounded(field: keyof typeof FIELD_LIMITS, value: unknown, flags: string[]): number | undefined {
  const number = nonNegative(value);
  if (number == null) return undefined;
  const [borderline, reject] = FIELD_LIMITS[field];
  assertInRange(field, number, 0, reject);
  if (number > borderline) {
    flags.push(`${field}_clamped`);
    return borderline;
  }
  return number;
}

function round(value: number, digits = 0): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function normalizeName(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function canonicalExerciseId(value: string): string {
  return normalizeName(value).replace(/ /g, "_");
}

function tokenScore(query: string, candidate: string): number {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.9;
  const qTokens = new Set(q.split(" "));
  const cTokens = new Set(c.split(" "));
  const common = [...qTokens].filter((token) => cTokens.has(token)).length;
  return common === 0 ? 0 : round(common / (qTokens.size + cTokens.size - common), 2);
}

function rankCandidates(rawName: string): WorkoutExerciseCandidate[] {
  return listExercises()
    .map((exercise) => {
      const names = [exercise.canonical_name, ...exercise.aliases];
      const score = Math.max(...names.map((name) => tokenScore(rawName, name)));
      return {
        exerciseId: exercise.exerciseId,
        canonicalName: exercise.canonical_name,
        score: round(score, 2),
        metValue: exercise.met_value,
        category: exercise.category,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.canonicalName.localeCompare(b.canonicalName))
    .slice(0, 5);
}

export function selectExerciseCandidate(candidates: WorkoutExerciseCandidate[]): WorkoutExerciseCandidate | null {
  const [best, runnerUp] = [...candidates].sort((a, b) => b.score - a.score || a.canonicalName.localeCompare(b.canonicalName));
  if (!best || best.score < WORKOUT_QUALITY_THRESHOLD) return null;
  if (runnerUp && best.score - runnerUp.score < WORKOUT_RUNNER_UP_MARGIN) return null;
  return best;
}

function normalizeUnit(value: unknown): string | undefined {
  const unit = typeof value === "string" ? value.trim().toLowerCase() : undefined;
  if (!unit) return undefined;
  if (unit === "lb" || unit === "lbs" || unit === "pound" || unit === "pounds") return "lb";
  if (unit === "body weight" || unit === "bodyweight") return "bodyweight";
  return unit;
}

function normalizeSet(raw: Record<string, unknown>, defaultUnit: string | undefined, flags: string[]): WorkoutSet {
  const reps = bounded("reps", raw.reps, flags);
  const load = bounded("load", raw.load ?? raw.weight, flags);
  const unilateral = typeof raw.unilateral === "boolean"
    ? raw.unilateral
    : typeof raw.side === "string" || typeof raw.sides === "string";
  const rpe = nonNegative(raw.rpe ?? raw.RPE ?? raw.effortRpe);
  const effort = typeof raw.effort === "string" ? raw.effort.trim() || undefined : undefined;
  return {
    reps,
    load,
    loadUnit: normalizeUnit(raw.loadUnit ?? raw.weight_unit ?? defaultUnit),
    unilateral,
    rpe: rpe == null ? undefined : Math.min(10, rpe),
    effort,
  };
}

function normalizeCardio(raw: Record<string, unknown>, fallbackDuration: number | undefined, flags: string[]): WorkoutCardio | undefined {
  const durationMin = bounded("duration", raw.durationMin ?? raw.duration_min, flags) ?? fallbackDuration;
  const distance = bounded("distance", raw.distance ?? raw.distance_km ?? raw.distance_miles, flags);
  const distanceUnit = typeof raw.distanceUnit === "string"
    ? raw.distanceUnit
    : raw.distance_miles != null ? "mi" : raw.distance_km != null ? "km" : undefined;
  const paceValue = finiteNumber(raw.pace);
  const pace = paceValue ?? (typeof raw.pace === "string" ? raw.pace.trim() || undefined : undefined);
  const incline = bounded("incline", raw.incline, flags);
  const caloriesPerHour = bounded("caloriesPerHour", raw.caloriesPerHour ?? raw.calories_per_hr, flags);
  if ([durationMin, distance, pace, incline, caloriesPerHour].every((value) => value == null)) return undefined;
  return { durationMin, distance, distanceUnit, pace, incline, caloriesPerHour };
}

function asExerciseInputs(value: unknown): WorkoutDraftExerciseInput[] {
  if (Array.isArray(value)) return value.filter((item): item is WorkoutDraftExerciseInput => !!item && typeof item === "object");
  if (typeof value === "string") {
    try { return asExerciseInputs(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function parseDuration(input: WorkoutDraftInput, exercises: WorkoutDraftExercise[], flags: string[]): number | undefined {
  const direct = bounded("duration", input.durationMin, flags);
  if (direct != null && direct > 0) return round(direct, 2);
  if (typeof input.duration === "number" && input.duration > 0) return bounded("duration", input.duration, flags);
  if (typeof input.duration === "string") {
    const parsed = parseDurationMinutes(input.duration);
    if (parsed > 0) return bounded("duration", parsed, flags);
  }
  const cardioMinutes = exercises.reduce((total, exercise) => total + (exercise.cardio?.durationMin ?? 0), 0);
  return cardioMinutes > 0 ? round(cardioMinutes, 2) : undefined;
}

function durationLabel(durationMin?: number): string | undefined {
  return durationMin == null ? undefined : `${round(durationMin, 2)} min`;
}

function intensityLevel(value: string): "easy" | "moderate" | "hard" | "very_hard" {
  const upper = value.toUpperCase();
  if (upper === "LOW" || upper === "EASY") return "easy";
  if (upper === "HIGH" || upper === "HARD") return "hard";
  if (upper === "MAX" || upper === "VERY_HARD") return "very_hard";
  return "moderate";
}

function estimateCalories(
  durationMin: number | undefined,
  exercises: WorkoutDraftExercise[],
  intensity: string,
  profile: WorkoutProfile | undefined,
): Pick<WorkoutDraft, "estimatedCalories" | "calorieEstimateProvenance" | "calorieConfidence" | "calorieRangeLow" | "calorieRangeHigh" | "calorieEstimateRough" | "calorieBreakdown"> {
  if (durationMin == null || durationMin <= 0 || exercises.length === 0) {
    return { calorieEstimateProvenance: "unavailable_missing_profile", calorieEstimateRough: true };
  }

  const totalSets = exercises.reduce((sum, exercise) => sum + Math.max(1, exercise.sets.length), 0);
  const weighted = exercises.reduce((sum, exercise) => sum + (exercise.metValue ?? 5) * Math.max(1, exercise.sets.length), 0) / Math.max(1, totalSets);
  const compoundRatio = exercises.length === 0 ? 0.5 : exercises.filter((exercise) => exercise.category === "strength").length / exercises.length;
  const density = durationMin / Math.max(1, totalSets) <= 1.5 ? "circuit" : durationMin / Math.max(1, totalSets) <= 3 ? "short_rests" : durationMin / Math.max(1, totalSets) <= 5 ? "normal" : "long_rests";
  const weight = nonNegative(profile?.weightKg);
  const knownSex = profile?.sex?.toLowerCase() === "female" || profile?.sex?.toLowerCase() === "male";
  const completeProfile = weight != null && weight > 0 && nonNegative(profile?.age) != null && knownSex;
  const rough = exercises.some((exercise) => exercise.normalizationState === "unknown-explicit");

  if (weight == null || weight <= 0) {
    return { calorieEstimateProvenance: "unavailable_missing_profile", calorieEstimateRough: true };
  }

  const result = completeProfile
    ? calculateWorkoutCalories({
        duration_min: durationMin,
        intensity: intensityLevel(intensity),
        density,
        compound_ratio: compoundRatio,
        exercises: [],
        weighted_met: weighted,
      }, {
        weight_kg: weight,
        age: nonNegative(profile?.age)!,
        sex: profile?.sex?.toLowerCase() === "female" ? "female" : "male",
        fitness_level: (profile?.fitnessLevel?.toLowerCase() as "beginner" | "intermediate" | "advanced") || "beginner",
        metabolic_factor: nonNegative(profile?.metabolicFactor) ?? 1,
      })
    : calculateNonPersonalizedWorkoutCalories({
        duration_min: durationMin,
        intensity: intensityLevel(intensity),
        density,
        compound_ratio: compoundRatio,
        weighted_met: weighted,
      }, weight);

  const provenance: WorkoutEstimateProvenance = rough
    ? "broad_unknown_exercise"
    : completeProfile ? "personalized_met" : "non_personalized_met";
  const confidence = round(Math.max(0.1, result.confidence - (rough ? 0.2 : 0)), 2);
  const width = Math.round(result.total_kcal * (1 - confidence) * 0.25);
  const rangeLow = result.range_low ?? Math.max(0, result.total_kcal - width);
  const rangeHigh = result.range_high ?? result.total_kcal + width;
  const roughWidth = rough
    ? Math.max(1, Math.round(Math.max(result.total_kcal - rangeLow, rangeHigh - result.total_kcal) * 0.25))
    : 0;
  return {
    estimatedCalories: result.total_kcal,
    calorieEstimateProvenance: provenance,
    calorieConfidence: confidence,
    calorieRangeLow: rough ? rangeLow - roughWidth : rangeLow,
    calorieRangeHigh: rangeHigh + roughWidth,
    calorieEstimateRough: rough || !completeProfile,
    calorieBreakdown: result.breakdown as unknown as Record<string, unknown>,
  };
}

/** Build the one canonical workout draft used by every workout source. */
export function buildWorkoutDraft(input: WorkoutDraftInput): WorkoutDraft {
  const validationFlags: string[] = [];
  const rawExercises = asExerciseInputs(input.exercises);
  const exercises = rawExercises.map((raw): WorkoutDraftExercise => {
    const rawName = (raw.rawName ?? raw.name ?? "").trim() || "Unknown exercise";
    const candidates = [...(raw.candidates ?? rankCandidates(rawName))]
      .sort((a, b) => b.score - a.score || a.canonicalName.localeCompare(b.canonicalName));
    const selected = raw.exerciseId
      ? candidates.find((candidate) => candidate.exerciseId === raw.exerciseId) ?? selectExerciseCandidate(candidates)
      : selectExerciseCandidate(candidates);
    const inputConfidence = raw.confidence == null ? 1 : Math.max(0, Math.min(1, raw.confidence));
    const accepted = selected && Math.min(selected.score, inputConfidence) >= WORKOUT_QUALITY_THRESHOLD;
    const firstSet = raw.sets?.[0];
    const sourceCardio = raw.cardio ?? (firstSet && typeof firstSet === "object" ? firstSet : undefined);
    const cardio = normalizeCardio(sourceCardio ?? {}, undefined, validationFlags);
    const category = selected?.category;
    const sets = (raw.sets ?? []).map((set) => normalizeSet(set, raw.weight_unit, validationFlags));
    const normalizedName = accepted ? selected.canonicalName : raw.normalizedName?.trim() || rawName;
    return {
      rawName,
      normalizedName,
      exerciseId: accepted ? selected.exerciseId ?? canonicalExerciseId(selected.canonicalName) : undefined,
      normalizationState: accepted ? "canonical" : "unknown-explicit",
      normalizationConfidence: round(accepted ? Math.min(selected.score, inputConfidence) : Math.min(inputConfidence, selected?.score ?? 0), 2),
      candidates,
      category,
      metValue: accepted ? selected.metValue : undefined,
      muscleGroup: raw.muscleGroup ?? raw.muscle_group,
      sets,
      cardio,
    };
  });

  const durationMin = parseDuration(input, exercises, validationFlags);
  const intensity = (input.intensity ?? "MEDIUM").toUpperCase();
  const estimate = estimateCalories(durationMin, exercises, intensity, input.profile);
  const reportedCalories = nonNegative(input.reportedCalories);
  const suppliedEstimatedCalories = nonNegative(input.estimatedCalories);
  const estimatedCalories = estimate.estimatedCalories ?? suppliedEstimatedCalories;
  const hasInternalEstimate = estimate.estimatedCalories != null;
  const hasCalorieValue = estimatedCalories != null || reportedCalories != null;
  const calorieSource = input.calorieSource ?? (reportedCalories != null ? "reported" : estimatedCalories != null ? "estimated" : undefined);
  const calories = calorieSource === "reported" ? reportedCalories : calorieSource === "estimated" ? estimatedCalories : undefined;
  const unresolved = exercises.filter((exercise) => exercise.normalizationState === "unknown-explicit").map((exercise) => exercise.rawName);
  const confidence = validationFlags.length
    ? 0.35
    : exercises.length === 0
      ? 0.1
      : round(exercises.reduce((sum, exercise) => sum + exercise.normalizationConfidence, 0) / exercises.length, 2);
  const suppliedBreakdown = typeof input.calorieBreakdown === "string"
    ? (() => { try { return JSON.parse(input.calorieBreakdown) as Record<string, unknown>; } catch { return undefined; } })()
    : input.calorieBreakdown;

  return {
    kind: "workout",
    name: input.name.trim() || "Workout",
    date: input.date,
    time: input.time ?? "00:00",
    durationMin,
    duration: durationLabel(durationMin),
    intensity,
    setsSummary: input.sets?.trim() || `${exercises.length} exercise${exercises.length === 1 ? "" : "s"} · ${exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} sets`,
    exercises,
    reportedCalories,
    estimatedCalories,
    calories,
    calorieSource,
    calorieEstimateProvenance: hasInternalEstimate
      ? estimate.calorieEstimateProvenance ?? input.calorieEstimateProvenance ?? (hasCalorieValue ? "provided_estimate" : "unavailable_missing_profile")
      : input.calorieEstimateProvenance ?? (hasCalorieValue ? "provided_estimate" : "unavailable_missing_profile"),
    calorieConfidence: hasInternalEstimate ? estimate.calorieConfidence ?? input.calorieConfidence : input.calorieConfidence,
    calorieRangeLow: hasInternalEstimate ? estimate.calorieRangeLow ?? input.calorieRangeLow : input.calorieRangeLow,
    calorieRangeHigh: hasInternalEstimate ? estimate.calorieRangeHigh ?? input.calorieRangeHigh : input.calorieRangeHigh,
    calorieEstimateRough: hasInternalEstimate ? estimate.calorieEstimateRough ?? input.calorieEstimateRough : input.calorieEstimateRough,
    calorieBreakdown: estimate.calorieBreakdown ?? suppliedBreakdown,
    unresolved,
    confidence,
    rawInput: input.rawInput,
    rationale: input.rationale,
    validationFlags,
  };
}

export function workoutPayloadFromDraft(draft: WorkoutDraft, extras: Record<string, unknown> = {}) {
  const exercises = draft.exercises;
  return {
    ...extras,
    name: draft.name,
    date: draft.date,
    time: draft.time,
    sets: draft.setsSummary,
    duration: draft.duration,
    durationMin: draft.durationMin,
    intensity: draft.intensity,
    exercises,
    structuredSets: JSON.stringify(exercises),
    caloriesBurned: draft.calories,
    reportedCalories: draft.reportedCalories,
    estimatedCalories: draft.estimatedCalories,
    calorieSource: draft.calorieSource,
    calorieConfidence: draft.calorieConfidence,
    calorieRangeLow: draft.calorieRangeLow,
    calorieRangeHigh: draft.calorieRangeHigh,
    calorieEstimateRough: draft.calorieEstimateRough,
    calorieEstimateProvenance: draft.calorieEstimateProvenance,
    calorieBreakdown: draft.calorieBreakdown ? JSON.stringify(draft.calorieBreakdown) : undefined,
    workoutDraft: JSON.stringify(draft),
    draft,
  };
}

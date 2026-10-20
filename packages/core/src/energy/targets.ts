import { ageOnDate } from "../time/local_day.ts";
import { KCAL_PER_KG, TDEE_CLAMP } from "./adaptive_tdee.ts";
import { mifflinStJeor, type Sex } from "./bmr.ts";

export type Goal = "lose" | "maintain" | "gain";
export type Pace = "relaxed" | "steady" | "fast";
/** Weekly weight change for each pace preset, in kg. */
export const PACE_KG_PER_WEEK = {
  lose: { relaxed: 0.25, steady: 0.5, fast: 0.75 },
  gain: { relaxed: 0.1, steady: 0.25, fast: 0.5 },
} as const;
/** Largest weekly loss allowed, as a fraction of body weight. */
export const MAX_LOSS_FRACTION_PER_WEEK = 0.01;
/** Largest weekly gain allowed, in kg. */
export const MAX_GAIN_KG_PER_WEEK = 0.5;
/** Lowest daily calorie target allowed for each sex. */
export const KCAL_FLOOR = { male: 1500, female: 1200 } as const;
/** Mifflin maintenance multipliers for the profile's activity categories. */
export const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 } as const;

export type TargetClampReason = "pace_cap" | "floor";

export interface GoalTarget {
  kcal: number;
  clamped: TargetClampReason | null;
}

export interface GoalTargetInput {
  baseline: number;
  maintenance: number;
  goal: Goal;
  pace: Pace | undefined;
  weightKg: number;
  sex: Sex;
}

export interface EnergyProfile {
  activity?: keyof typeof ACTIVITY_FACTORS;
  heightCm?: number;
  dob?: string;
  sex?: Sex;
}

export interface DailyTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Formula maintenance from complete profile inputs and measured weight, with no defaults. */
export function formulaBaseline(profile: EnergyProfile | null, weightKg: number | null, date: string): number | null {
  if (profile === null || profile.activity === undefined) return null;
  const bmr = mifflinStJeor({ weightKg, heightCm: profile.heightCm, ageYears: ageOnDate(profile.dob, date), sex: profile.sex });
  if (bmr === null || !Number.isFinite(bmr) || bmr <= 0) return null;
  return bmr * ACTIVITY_FACTORS[profile.activity];
}

/** Pace-based goal target from the bounded burn estimate, capped by body weight and the sex floor, rounded once at the end. */
export function goalTargetKcal(input: GoalTargetInput): GoalTarget {
  const pace = input.pace ?? "steady";
  let weeklyKg = 0;
  let clamped: TargetClampReason | null = null;
  if (input.goal === "lose") {
    const cap = input.weightKg * MAX_LOSS_FRACTION_PER_WEEK;
    weeklyKg = Math.min(PACE_KG_PER_WEEK.lose[pace], cap);
    if (cap < PACE_KG_PER_WEEK.lose[pace]) clamped = "pace_cap";
  } else if (input.goal === "gain") {
    weeklyKg = Math.min(PACE_KG_PER_WEEK.gain[pace], MAX_GAIN_KG_PER_WEEK);
    if (MAX_GAIN_KG_PER_WEEK < PACE_KG_PER_WEEK.gain[pace]) clamped = "pace_cap";
  }
  const direction = input.goal === "lose" ? -1 : 1;
  const offset = (direction * weeklyKg * KCAL_PER_KG) / 7;
  // The bound applies to the burn estimate, not the result, so a stale estimate can't widen the capped pace and the
  // bound can't silently slow it. Only the floor can still move the result, and it says so.
  const maintenance = Math.max(input.baseline * TDEE_CLAMP.min, Math.min(input.baseline * TDEE_CLAMP.max, input.maintenance));
  let kcal = maintenance + offset;
  const floor = KCAL_FLOOR[input.sex];
  if (kcal < floor) {
    kcal = floor;
    clamped = "floor";
  }
  return { kcal: Math.round(kcal), clamped };
}

/** Scales a reference macro split to the calorie target, retaining the reference when no target exists. */
export function scaleMacroTargets(kcal: number | null, reference: DailyTargets): DailyTargets {
  if (kcal === null) return reference;
  const ratio = kcal / reference.kcal;
  return {
    kcal,
    proteinG: Math.round(reference.proteinG * ratio),
    carbsG: Math.round(reference.carbsG * ratio),
    fatG: Math.round(reference.fatG * ratio),
  };
}

/** The app's daily macro reference at the default calorie target. */
export const DEFAULT_MACRO_REFERENCE: DailyTargets = { kcal: 1890, proteinG: 110, carbsG: 215, fatG: 60 };

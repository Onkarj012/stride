import { ageOnDate } from "../time/local_day.ts";
import { TDEE_CLAMP } from "./adaptive_tdee.ts";
import { mifflinStJeor, type Sex } from "./bmr.ts";

/** Fixed daily goal adjustments in kcal, bounded by the formula maintenance baseline. */
export const GOAL_KCAL_OFFSETS = { lose: -500, maintain: 0, gain: 300 } as const;
/** Mifflin maintenance multipliers for the profile's activity categories. */
export const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 } as const;

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

/** Goal-adjusted maintenance, clamped to the formula baseline and rounded once. */
export function goalTargetKcal(baseline: number, maintenance: number, goal: keyof typeof GOAL_KCAL_OFFSETS): number {
  return Math.round(Math.max(baseline * TDEE_CLAMP.min, Math.min(baseline * TDEE_CLAMP.max, maintenance + GOAL_KCAL_OFFSETS[goal])));
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

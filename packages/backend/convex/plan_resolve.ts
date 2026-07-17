import { calculateNutritionPlan, type NutritionPlan, type PlanInput } from "./tdee_engine";
import { toPlanInput } from "./profile";

/** Single no-plan fallback policy used by every target surface. */
export const FALLBACK_TARGETS = {
  calories: 2000,
  protein: 90,
  carbs: 250,
  fat: 65,
} as const;

function isNonNegativeFinite(n: unknown): n is number {
  return typeof n === "number" && isFinite(n) && n >= 0;
}

/**
 * Parse a stored `user_profiles.planBreakdown` JSON string into a NutritionPlan.
 *
 * Structurally validates every consumed field as finite and non-negative.
 * `plannedEatPerTrainingDay` is optional (legacy plans may omit it); when
 * missing or invalid it is omitted so `resolvePlanForDayAdjustment` can
 * recompute it from the profile. Returns null for malformed/unusable data.
 */
export function parseStoredPlan(planBreakdown?: string | null): NutritionPlan | null {
  if (!planBreakdown) return null;
  try {
    const p = JSON.parse(planBreakdown);
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;

    if (!isNonNegativeFinite(p.calories)) return null;
    if (!isNonNegativeFinite(p.protein)) return null;
    if (!isNonNegativeFinite(p.carbs)) return null;
    if (!isNonNegativeFinite(p.fat)) return null;
    if (!isNonNegativeFinite(p.plannedDailyEAT)) return null;

    const plan: any = {
      calories: p.calories,
      protein: p.protein,
      carbs: p.carbs,
      fat: p.fat,
      plannedDailyEAT: p.plannedDailyEAT,
    };

    // Preserve extra fields from the stored object, but drop the optional
    // training-day baseline if it failed validation so it can be recomputed.
    for (const [key, value] of Object.entries(p)) {
      if (key !== "plannedEatPerTrainingDay" && !(key in plan)) {
        plan[key] = value;
      }
    }
    if (isNonNegativeFinite(p.plannedEatPerTrainingDay)) {
      plan.plannedEatPerTrainingDay = p.plannedEatPerTrainingDay;
    }

    return plan as NutritionPlan;
  } catch {
    return null;
  }
}

/**
 * Resolve the planned-EAT baselines used by adjustCaloriesForDay.
 *
 * Stored planBreakdown JSON may carry stale baselines: legacy plans lack
 * plannedEatPerTrainingDay entirely, and plans persisted before the net-MET
 * change carry gross-MET values that overstate expected burn. So whenever the
 * profile still holds the inputs the engine needs (weight/height/age + workout
 * schedule), recompute both baselines instead of trusting the stored numbers.
 * Stored plan calories/macros are never touched — only the two comparison
 * baselines. If the inputs are missing or invalid, the stored plan is returned
 * as-is.
 */
export function resolvePlanForDayAdjustment(
  plan: NutritionPlan,
  rawProfile: { weight?: number; height?: number; age?: number; sex?: string; bodyFat?: number; occupationType?: string; workHoursPerDay?: number; lifestyleActivity?: string; weeklyWorkouts?: string; goal?: string }
): NutritionPlan {
  const weight = rawProfile.weight;
  const height = rawProfile.height;
  const age = rawProfile.age;
  if (typeof weight !== "number" || !isFinite(weight) || weight <= 0) return plan;
  if (typeof height !== "number" || !isFinite(height) || height <= 0) return plan;
  if (typeof age !== "number" || !isFinite(age) || age <= 0) return plan;

  let weeklyWorkouts: PlanInput["weeklyWorkouts"];
  try {
    if (!rawProfile.weeklyWorkouts) return plan;
    const parsed = JSON.parse(rawProfile.weeklyWorkouts);
    if (!Array.isArray(parsed)) return plan;
    weeklyWorkouts = parsed;
  } catch {
    return plan;
  }

  try {
    const recomputed = calculateNutritionPlan(
      toPlanInput({
        weightKg: weight,
        heightCm: height,
        age,
        sex: rawProfile.sex,
        bodyFat: rawProfile.bodyFat,
        occupationType: rawProfile.occupationType,
        workHoursPerDay: rawProfile.workHoursPerDay,
        lifestyleActivity: rawProfile.lifestyleActivity,
        weeklyWorkouts,
        goal: rawProfile.goal,
      })
    );
    return {
      ...plan,
      plannedDailyEAT: recomputed.plannedDailyEAT,
      plannedEatPerTrainingDay: recomputed.plannedEatPerTrainingDay,
    };
  } catch {
    return plan;
  }
}

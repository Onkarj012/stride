import { calculateNutritionPlan, type NutritionPlan, type PlanInput } from "./tdee_engine";
import { toPlanInput } from "./profile";

/** Parse a stored `user_profiles.planBreakdown` JSON string into a NutritionPlan. */
export function parseStoredPlan(planBreakdown?: string | null): NutritionPlan | null {
  if (!planBreakdown) return null;
  try {
    const p = JSON.parse(planBreakdown);
    return typeof p?.plannedDailyEAT === "number" ? (p as NutritionPlan) : null;
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

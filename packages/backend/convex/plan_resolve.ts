import { calculateNutritionPlan, type NutritionPlan, type PlanInput } from "./tdee_engine";
import { toPlanInput } from "./profile";

export function resolvePlanForDayAdjustment(
  plan: NutritionPlan,
  rawProfile: { weight?: number; height?: number; age?: number; sex?: string; bodyFat?: number; occupationType?: string; workHoursPerDay?: number; lifestyleActivity?: string; weeklyWorkouts?: string; goal?: string }
): NutritionPlan {
  if (typeof plan.plannedEatPerTrainingDay === "number") return plan;

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
    return { ...plan, plannedEatPerTrainingDay: recomputed.plannedEatPerTrainingDay };
  } catch {
    return plan;
  }
}

/**
 * Deterministic 4-component TDEE + protein-first macro engine.
 * Pure functions only — NO Convex imports — so it is fully unit-testable.
 *
 *   TDEE        = BMR + NEAT_job + NEAT_lifestyle + EAT(avg/day)
 *   finalTDEE   = round(TDEE × 1.10)                  // thermic effect of food
 *   target      = applyGoalAdjustment(finalTDEE, goal) // capped deficit + floor
 *   macros      = protein-first (g/lb by goal → fat → carbs fill remainder)
 *
 *   BMR: Katch-McArdle when bodyFat% known, else Mifflin-St Jeor.
 *   NEAT: (MET-1)×kg×h   EAT: MET×kg×h
 */

export type Sex = "male" | "female";

export const OCCUPATION_MET = {
  desk: 1.2,
  mixed: 1.5,
  standing: 1.8,
  physical: 2.6,
} as const;
export type OccupationType = keyof typeof OCCUPATION_MET;

export const LIFESTYLE_MET_EXTRA = {
  sedentary: 0.0,
  light: 0.1,
  moderate: 0.2,
  active: 0.35,
} as const;
export type LifestyleActivity = keyof typeof LIFESTYLE_MET_EXTRA;

export const WORKOUT_MET = {
  strength: 5.0,
  walk: 3.5,
  run_slow: 8.0,
  run_fast: 11.5,
  cycling: 7.5,
  hiit: 9.0,
  yoga: 3.0,
  swim: 7.0,
  sport: 7.0,
} as const;
export type WorkoutType = keyof typeof WORKOUT_MET;

/** Fractional calorie adjustment by goal (the 7 engine goals). */
export const GOAL_CALORIE_ADJUSTMENT = {
  aggressive_loss: -0.25,
  moderate_loss: -0.18,
  mild_loss: -0.1,
  maintain: 0,
  recomp: -0.05,
  lean_gain: 0.1,
  muscle_gain: 0.18,
} as const;
export type Goal = keyof typeof GOAL_CALORIE_ADJUSTMENT;

const PROTEIN_G_PER_LB: Record<Goal, number> = {
  aggressive_loss: 1.1,
  moderate_loss: 1.0,
  mild_loss: 1.0,
  maintain: 0.8,
  recomp: 1.0,
  lean_gain: 0.9,
  muscle_gain: 0.8,
};
const FAT_G_PER_LB: Record<Goal, number> = {
  aggressive_loss: 0.35,
  moderate_loss: 0.4,
  mild_loss: 0.4,
  maintain: 0.4,
  recomp: 0.4,
  lean_gain: 0.45,
  muscle_gain: 0.45,
};

const MAX_DEFICIT = 0.25; // never cut below 75% of finalTDEE
const FLOOR_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };
const KG_PER_LB = 2.20462;
const TEF = 1.1;

export interface WeeklyWorkout {
  type: string;
  durationMin: number;
  sessionsPerWeek: number;
}

export interface PlanInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  bodyFat?: number;
  occupationType?: string;
  workHoursPerDay?: number;
  lifestyleActivity?: string;
  weeklyWorkouts?: WeeklyWorkout[];
  goal?: string;
}

const pos = (n: unknown, fallback: number): number =>
  typeof n === "number" && isFinite(n) && n > 0 ? n : fallback;

function asGoal(g?: string): Goal {
  return g && g in GOAL_CALORIE_ADJUSTMENT ? (g as Goal) : "maintain";
}

/** BMR: Katch-McArdle if bodyFat known, else Mifflin-St Jeor. */
export function getBMR(weightKg: number, heightCm: number, age: number, sex: Sex, bodyFat?: number): number {
  const w = pos(weightKg, 70);
  if (typeof bodyFat === "number" && bodyFat > 0 && bodyFat < 70) {
    const leanMass = w * (1 - bodyFat / 100);
    return Math.round(370 + 21.6 * leanMass);
  }
  const h = pos(heightCm, 170);
  const a = pos(age, 30);
  const base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(sex === "female" ? base - 161 : base + 5);
}

/** MET calories. NEAT subtracts the 1-MET resting baseline (already in BMR). */
export function calcMETCalories(met: number, weightKg: number, hours: number, subtractRmr = false): number {
  const effMet = subtractRmr ? Math.max(0, met - 1) : met;
  return effMet * pos(weightKg, 70) * Math.max(0, hours);
}

export interface TdeeBreakdown {
  bmr: number;
  neatJob: number;
  neatLifestyle: number;
  eat: number;
  tef: number;
  tdee: number;
  finalTDEE: number;
  plannedDailyEAT: number;
  plannedEatPerTrainingDay: number;
}

export function calculateTDEE(input: PlanInput): TdeeBreakdown {
  const weightKg = pos(input.weightKg, 70);
  const bmr = getBMR(weightKg, input.heightCm, input.age, input.sex === "female" ? "female" : "male", input.bodyFat);

  const occMet = OCCUPATION_MET[(input.occupationType as OccupationType)] ?? OCCUPATION_MET.desk;
  // Allow 0 work hours (retired/unemployed) — only fall back to 8 when unset.
  const wh = input.workHoursPerDay;
  const workHours = Math.min(16, Math.max(0, typeof wh === "number" && isFinite(wh) ? wh : 8));
  const neatJob = calcMETCalories(occMet, weightKg, workHours, true);

  const weeklyWorkouts = input.weeklyWorkouts ?? [];
  const weeklyWorkoutMinutes = weeklyWorkouts.reduce(
    (s, w) => s + Math.max(0, w.durationMin ?? 0) * Math.max(0, w.sessionsPerWeek ?? 0),
    0,
  );
  // Sum sessions across entries that actually contribute burn; cap at 7 days/week.
  // Exclude zero-duration / zero-session placeholder rows so they don't dilute the per-day average.
  const activeWorkouts = weeklyWorkouts.filter(
    (w) => Math.max(0, w.durationMin ?? 0) * Math.max(0, w.sessionsPerWeek ?? 0) > 0,
  );
  const summedSessionsPerWeek = activeWorkouts.reduce((sum, w) => sum + Math.max(0, w.sessionsPerWeek ?? 0), 0);
  const trainingDaysPerWeek = activeWorkouts.length > 0 ? Math.min(7, Math.max(1, summedSessionsPerWeek)) : 0;
  const avgWorkoutHours = weeklyWorkoutMinutes / 60 / 7;

  const lifeMet = LIFESTYLE_MET_EXTRA[(input.lifestyleActivity as LifestyleActivity)] ?? LIFESTYLE_MET_EXTRA.light;
  // Leisure NEAT spans waking hours not at work or training (avoid double-counting).
  const wakingLeisureHours = Math.max(0, 16 - workHours - avgWorkoutHours);
  const neatLifestyle = lifeMet * weightKg * wakingLeisureHours;

  const weeklyEat = weeklyWorkouts.reduce((sum, w) => {
    const met = WORKOUT_MET[(w.type as WorkoutType)] ?? WORKOUT_MET.strength;
    const hours = Math.max(0, (w.durationMin ?? 0) / 60);
    const sessions = Math.max(0, w.sessionsPerWeek ?? 0);
    return sum + calcMETCalories(met, weightKg, hours) * sessions;
  }, 0);
  const eat = weeklyEat / 7;
  const plannedEatPerTrainingDay = trainingDaysPerWeek > 0 ? weeklyEat / trainingDaysPerWeek : 0;

  const tdee = bmr + neatJob + neatLifestyle + eat;
  const finalTDEE = Math.round(tdee * TEF);
  return {
    bmr,
    neatJob: Math.round(neatJob),
    neatLifestyle: Math.round(neatLifestyle),
    eat: Math.round(eat),
    tef: Math.round(tdee * (TEF - 1)),
    tdee: Math.round(tdee),
    finalTDEE,
    plannedDailyEAT: Math.round(eat),
    plannedEatPerTrainingDay: Math.round(plannedEatPerTrainingDay),
  };
}

/** Apply goal adjustment with a 25% deficit cap and sex-based calorie floor. */
export function applyGoalAdjustment(finalTDEE: number, goal: string, sex: Sex): number {
  const adj = GOAL_CALORIE_ADJUSTMENT[asGoal(goal)];
  let target = finalTDEE * (1 + adj);
  const minByDeficit = finalTDEE * (1 - MAX_DEFICIT);
  if (target < minByDeficit) target = minByDeficit;
  const floor = FLOOR_KCAL[sex === "female" ? "female" : "male"];
  return Math.max(Math.round(target), floor);
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Protein-first: protein g/lb by goal → fat g/lb → carbs fill the remainder. */
export function calculateMacros(targetCalories: number, weightKg: number, goal: string): Macros {
  const g = asGoal(goal);
  const lbs = pos(weightKg, 70) * KG_PER_LB;
  const protein = Math.max(0, Math.round(PROTEIN_G_PER_LB[g] * lbs));
  const fat = Math.max(0, Math.round(FAT_G_PER_LB[g] * lbs));
  const remaining = targetCalories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(remaining / 4));
  return { calories: targetCalories, protein, carbs, fat };
}

export interface NutritionPlan extends Macros {
  breakdown: TdeeBreakdown & { goal: Goal; goalAdjustment: number };
  percentages: { protein: number; carbs: number; fat: number };
  plannedDailyEAT: number;
  plannedEatPerTrainingDay: number;
}

export function calculateNutritionPlan(input: PlanInput): NutritionPlan {
  const sex: Sex = input.sex === "female" ? "female" : "male";
  const t = calculateTDEE(input);
  const goal = asGoal(input.goal);
  const target = applyGoalAdjustment(t.finalTDEE, goal, sex);
  const macros = calculateMacros(target, input.weightKg, goal);

  const pCal = macros.protein * 4;
  const cCal = macros.carbs * 4;
  const fCal = macros.fat * 9;
  const totalCal = Math.max(1, pCal + cCal + fCal);
  const pct = (n: number) => Math.round((n / totalCal) * 100);

  return {
    ...macros,
    breakdown: { ...t, goal, goalAdjustment: target - t.finalTDEE },
    percentages: { protein: pct(pCal), carbs: pct(cCal), fat: pct(fCal) },
    plannedDailyEAT: t.plannedDailyEAT,
    plannedEatPerTrainingDay: t.plannedEatPerTrainingDay,
  };
}

export interface DayAdjustment {
  calorieGoal: number;
  proteinGoal: number;
  carbGoal: number;
  fatGoal: number;
  note: string;
}

/**
 * Dynamic per-day adjustment. delta = actual workout burn − expected training-day EAT.
 * Carbs absorb the delta (protein/fat fixed). Carbs clamped at ≥ 0.
 */
export function adjustCaloriesForDay(plan: NutritionPlan, todayActualBurn: number): DayAdjustment {
  const actualBurn = todayActualBurn || 0;
  const isTrainingDay = actualBurn > 0;
  const trainingDayBaseline =
    typeof plan.plannedEatPerTrainingDay === "number" ? plan.plannedEatPerTrainingDay : plan.plannedDailyEAT;
  const baseline = isTrainingDay ? trainingDayBaseline : 0;
  const delta = Math.round(actualBurn - baseline);
  const calorieGoal = Math.max(plan.protein * 4 + plan.fat * 9, plan.calories + delta);
  const carbGoal = Math.max(0, plan.carbs + Math.round(delta / 4));
  const note =
    delta > 0
      ? `+${delta} kcal for today's extra activity (carbs +${Math.round(delta / 4)}g)`
      : delta < 0
        ? `${delta} kcal vs your average training day`
        : "On plan for today";
  return { calorieGoal, proteinGoal: plan.protein, carbGoal, fatGoal: plan.fat, note };
}

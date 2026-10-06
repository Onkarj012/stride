/**
 * Workout energy from METs. Source for MET values and the net-MET convention:
 * Ainsworth BE et al., "2011 Compendium of Physical Activities", Med Sci Sports Exerc 2011;43(8):1575-1581,
 * and the 2024 Adult Compendium (Herrmann SD et al., J Sport Health Sci 2024;13(1):6-12).
 * Net kcal = (MET − 1) × kg × hours. The resting 1 MET is already in BMR, so counting it again would double it.
 */

/** Resting metabolic equivalent, subtracted to get net exercise energy. */
export const RESTING_MET = 1;

/**
 * Typical METs for plan-level activity types. Carried over from the previous Stride engine (tdee_engine.ts);
 * each sits inside the Compendium range for its activity group (resistance training, walking, running, etc.).
 */
export const ACTIVITY_MET = {
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
export type ActivityType = keyof typeof ACTIVITY_MET;

/** Session modifiers ported from the previous engine (calorie_engine.ts). Moderate and normal are neutral. */
export const INTENSITY_MULTIPLIER = { easy: 0.85, moderate: 1.0, hard: 1.1, very_hard: 1.2 } as const;
export type Intensity = keyof typeof INTENSITY_MULTIPLIER;

export const DENSITY_MULTIPLIER = { long_rests: 0.9, normal: 1.0, short_rests: 1.1, circuit: 1.2 } as const;
export type Density = keyof typeof DENSITY_MULTIPLIER;

/** Excess post-exercise oxygen consumption as a fraction of session energy, by intensity. */
export const EPOC_FRACTION = { easy: 0.05, moderate: 0.07, hard: 0.1, very_hard: 0.125 } as const;

/** Compound-lift multiplier: 0.95 at an all-isolation session, 1.08 at all compound. */
export const COMPOUND_MULTIPLIER = { base: 0.95, perRatio: 0.13 } as const;

/** Minutes per working set that separate the density bands, from the previous engine's save path. */
export const DENSITY_MINUTES_PER_SET = { circuit: 1.5, short_rests: 3, normal: 5 } as const;

/** One workout, planned or logged. Both go through the same formula. */
export interface WorkoutSession {
  met: number;
  durationMin: number;
  intensity?: Intensity;
  density?: Density;
  /** Share of compound exercises, 0-1. Leave out for cardio; it then has no effect. */
  compoundRatio?: number;
}

/** Net exercise kcal: (MET − 1) × kg × hours, never negative. */
export function netMetKcal(met: number, weightKg: number, hours: number): number {
  return Math.max(0, met - RESTING_MET) * Math.max(0, weightKg) * Math.max(0, hours);
}

/** Duration-weighted MET of a mixed session, so a 5-minute warm-up does not count like the main set. */
export function weightedMet(segments: readonly { met: number; minutes: number }[]): number | null {
  const minutes = segments.reduce((s, seg) => s + Math.max(0, seg.minutes), 0);
  if (minutes === 0) return null;
  return segments.reduce((s, seg) => s + seg.met * Math.max(0, seg.minutes), 0) / minutes;
}

/** Density band from working sets and session length. One rule for preview and save. */
export function densityFromSets(totalSets: number, durationMin: number): Density {
  if (totalSets <= 0 || durationMin <= 0) return "normal";
  const minutesPerSet = durationMin / totalSets;
  if (minutesPerSet <= DENSITY_MINUTES_PER_SET.circuit) return "circuit";
  if (minutesPerSet <= DENSITY_MINUTES_PER_SET.short_rests) return "short_rests";
  if (minutesPerSet <= DENSITY_MINUTES_PER_SET.normal) return "normal";
  return "long_rests";
}

/** Session kcal, unrounded: net MET energy × intensity × density × compound, plus EPOC. Null without a body weight. */
export function sessionBurnKcal(session: WorkoutSession, weightKg: number | null | undefined): number | null {
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const intensity = session.intensity ?? "moderate";
  const ratio = session.compoundRatio;
  const compound = ratio === undefined ? 1 : COMPOUND_MULTIPLIER.base + COMPOUND_MULTIPLIER.perRatio * Math.min(1, Math.max(0, ratio));
  const during =
    netMetKcal(session.met, weightKg, session.durationMin / 60) *
    INTENSITY_MULTIPLIER[intensity] *
    DENSITY_MULTIPLIER[session.density ?? "normal"] *
    compound;
  return during * (1 + EPOC_FRACTION[intensity]);
}

/** A recurring workout in the user's weekly plan. */
export interface PlannedWorkout {
  session: WorkoutSession;
  sessionsPerWeek: number;
}

/** Weekly planned kcal and training days, using the same formula as logged sessions. */
function weeklyPlan(plan: readonly PlannedWorkout[], weightKg: number): { kcal: number; trainingDays: number } | null {
  let kcal = 0;
  let sessions = 0;
  for (const p of plan) {
    const perSession = sessionBurnKcal(p.session, weightKg);
    if (perSession === null) return null;
    const count = Math.max(0, p.sessionsPerWeek);
    if (perSession * count <= 0) continue;
    kcal += perSession * count;
    sessions += count;
  }
  return { kcal, trainingDays: Math.min(7, sessions) };
}

/** Planned exercise kcal averaged over 7 days, for the formula maintenance estimate. */
export function plannedDailyAverageKcal(plan: readonly PlannedWorkout[], weightKg: number | null | undefined): number | null {
  if (typeof weightKg !== "number" || weightKg <= 0) return null;
  const week = weeklyPlan(plan, weightKg);
  return week === null ? null : week.kcal / 7;
}

/** Planned kcal on a training day: the bar a logged workout must beat before it raises the day's budget. */
export function plannedPerTrainingDayKcal(plan: readonly PlannedWorkout[], weightKg: number | null | undefined): number | null {
  if (typeof weightKg !== "number" || weightKg <= 0) return null;
  const week = weeklyPlan(plan, weightKg);
  if (week === null) return null;
  return week.trainingDays === 0 ? 0 : week.kcal / week.trainingDays;
}

/**
 * Extra kcal for today's budget: logged burn above the planned training-day burn.
 * Never negative, so logging a short walk can never lower the budget below not logging at all.
 */
export function budgetAdjustmentKcal(loggedKcal: number, plannedPerTrainingDay: number): number {
  return Math.max(0, Math.max(0, loggedKcal) - Math.max(0, plannedPerTrainingDay));
}

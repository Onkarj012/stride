/** Biological sex as used by the Mifflin-St Jeor equation. */
export type Sex = "male" | "female";

/**
 * Mifflin-St Jeor coefficients (Mifflin et al., Am J Clin Nutr 1990;51:241-247).
 * BMR = 10 × kg + 6.25 × cm − 5 × age + s, with s = +5 for men and −161 for women.
 */
export const MIFFLIN = { perKg: 10, perCm: 6.25, perYear: -5, male: 5, female: -161 } as const;

/** Katch-McArdle: BMR = 370 + 21.6 × lean body mass in kg (McArdle, Katch and Katch, Exercise Physiology). */
export const KATCH_MCARDLE = { intercept: 370, perLeanKg: 21.6 } as const;

/** Body-fat percentages outside this open range are treated as bad input. */
export const BODY_FAT_PCT_RANGE = { min: 2, max: 70 } as const;

/** A usable positive measurement, or null for missing, zero, negative or non-finite input. */
function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Mifflin-St Jeor BMR in kcal/day, unrounded. Null when any input is missing; nothing is defaulted. */
export function mifflinStJeor(input: {
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  ageYears: number | null | undefined;
  sex: Sex | null | undefined;
}): number | null {
  const kg = positive(input.weightKg);
  const cm = positive(input.heightCm);
  const age = positive(input.ageYears);
  if (kg === null || cm === null || age === null || (input.sex !== "male" && input.sex !== "female")) return null;
  return MIFFLIN.perKg * kg + MIFFLIN.perCm * cm + MIFFLIN.perYear * age + MIFFLIN[input.sex];
}

/** Katch-McArdle BMR in kcal/day, unrounded. Null when weight or a plausible body-fat percentage is missing. */
export function katchMcArdle(input: {
  weightKg: number | null | undefined;
  bodyFatPct: number | null | undefined;
}): number | null {
  const kg = positive(input.weightKg);
  const bf = positive(input.bodyFatPct);
  if (kg === null || bf === null || bf <= BODY_FAT_PCT_RANGE.min || bf >= BODY_FAT_PCT_RANGE.max) return null;
  return KATCH_MCARDLE.intercept + KATCH_MCARDLE.perLeanKg * kg * (1 - bf / 100);
}

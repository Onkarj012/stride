import { daysBetween, isLocalDate } from "../time/local_day.ts";

/** D11 constants. */
export const TDEE_EMA_ALPHA = 0.1;
export const TDEE_MIN_WINDOW_DAYS = 14;
export const TDEE_MAX_WINDOW_DAYS = 28;
export const TDEE_MIN_WEIGH_INS = 10;
export const TDEE_MIN_LOGGED_FRACTION = 0.7;
/** Energy in one kg of body-mass change (Wishnofsky 1958, the usual ~3500 kcal/lb rule). */
export const KCAL_PER_KG = 7700;
/** The estimate is held within these multiples of the formula baseline. */
export const TDEE_CLAMP = { min: 0.75, max: 1.3 } as const;

/** One local day of input. Use null for a day with no intake log or no weigh-in. One row per date. */
export interface TdeeDay {
  date: string;
  intakeKcal: number | null;
  weightKg: number | null;
}

/** Inputs for one recompute. */
export interface AdaptiveTdeeInput {
  days: readonly TdeeDay[];
  /** Formula maintenance from Mifflin-St Jeor (BMR × activity). The clamp is relative to this. */
  baselineTdeeKcal: number | null;
}

/** Why the estimate is not ready yet. */
export type TdeeGateReason = "too_few_days" | "too_few_weigh_ins" | "too_few_logged_days" | "missing_baseline";

/** Window statistics reported with every result, so the UI can show progress toward the gate. */
export interface TdeeWindow {
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: number;
  weighIns: number;
  loggedFraction: number;
}

/** Result of `adaptiveTdee`. */
export type AdaptiveTdeeResult =
  | (TdeeWindow & {
      status: "ok";
      tdeeKcal: number;
      unclampedKcal: number;
      clamped: "low" | "high" | null;
      trendKg: number;
      slopeKgPerDay: number;
      meanIntakeKcal: number;
    })
  | (TdeeWindow & { status: "insufficient"; reasons: TdeeGateReason[] });

/** A usable number, or null. Weights must be positive; intake may be zero (a fasting day). */
function usable(value: number | null, allowZero: boolean): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value > 0 || (allowZero && value === 0) ? value : null;
}

/** Least-squares slope of y on x. Requires at least two distinct x values. */
export function leastSquaresSlope(points: readonly { x: number; y: number }[]): number {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** EMA of weigh-ins in date order, seeded with the first weigh-in. Days without a weigh-in leave the trend unchanged. */
export function weightTrend(days: readonly TdeeDay[], alpha = TDEE_EMA_ALPHA): Map<string, number> {
  const trend = new Map<string, number>();
  let current: number | null = null;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const w = usable(day.weightKg, false);
    if (w === null) continue;
    current = current === null ? w : current + alpha * (w - current);
    trend.set(day.date, current);
  }
  return trend;
}

/**
 * D11 adaptive TDEE: TDEE = mean intake − trend slope × 7700, over the last 14-28 days.
 * Pure function of the input series. Ready only with ≥14 days, ≥10 weigh-ins and ≥70% of days logged.
 */
export function adaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult {
  const days = input.days.filter((d) => isLocalDate(d.date)).sort((a, b) => a.date.localeCompare(b.date));
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) {
    return {
      status: "insufficient",
      reasons: ["too_few_days", "too_few_weigh_ins", "too_few_logged_days"],
      windowStart: null,
      windowEnd: null,
      windowDays: 0,
      weighIns: 0,
      loggedFraction: 0,
    };
  }

  const trend = weightTrend(days);
  const span = daysBetween(first.date, last.date) + 1;
  const windowDays = Math.min(span, TDEE_MAX_WINDOW_DAYS);
  const inWindow = days.filter((d) => daysBetween(d.date, last.date) < windowDays);
  const windowStart = inWindow[0]?.date ?? last.date;
  const weighed = inWindow.filter((d) => usable(d.weightKg, false) !== null);
  const intakes = inWindow.map((d) => usable(d.intakeKcal, true)).filter((v): v is number => v !== null);
  const loggedFraction = intakes.length / windowDays;
  const window: TdeeWindow = { windowStart, windowEnd: last.date, windowDays, weighIns: weighed.length, loggedFraction };

  const reasons: TdeeGateReason[] = [];
  if (windowDays < TDEE_MIN_WINDOW_DAYS) reasons.push("too_few_days");
  if (weighed.length < TDEE_MIN_WEIGH_INS) reasons.push("too_few_weigh_ins");
  if (loggedFraction < TDEE_MIN_LOGGED_FRACTION) reasons.push("too_few_logged_days");
  const baseline = usable(input.baselineTdeeKcal, false);
  if (baseline === null) reasons.push("missing_baseline");
  if (reasons.length > 0 || baseline === null) return { status: "insufficient", reasons, ...window };

  const points = weighed.map((d) => ({ x: daysBetween(windowStart, d.date), y: trend.get(d.date) ?? 0 }));
  const slopeKgPerDay = leastSquaresSlope(points);
  const meanIntakeKcal = intakes.reduce((s, v) => s + v, 0) / intakes.length;
  const unclampedKcal = meanIntakeKcal - slopeKgPerDay * KCAL_PER_KG;
  const low = baseline * TDEE_CLAMP.min;
  const high = baseline * TDEE_CLAMP.max;
  const clamped = unclampedKcal < low ? "low" : unclampedKcal > high ? "high" : null;
  const bounded = clamped === "low" ? low : clamped === "high" ? high : unclampedKcal;

  return {
    status: "ok",
    tdeeKcal: Math.round(bounded),
    unclampedKcal,
    clamped,
    trendKg: trend.get(weighed[weighed.length - 1]?.date ?? "") ?? 0,
    slopeKgPerDay,
    meanIntakeKcal,
    ...window,
  };
}

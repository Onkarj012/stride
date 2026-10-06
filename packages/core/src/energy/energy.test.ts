import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays } from "../time/local_day.ts";
import { adaptiveTdee, KCAL_PER_KG, TDEE_CLAMP, type TdeeDay } from "./adaptive_tdee.ts";
import { katchMcArdle, mifflinStJeor } from "./bmr.ts";
import {
  budgetAdjustmentKcal,
  densityFromSets,
  netMetKcal,
  plannedDailyAverageKcal,
  plannedPerTrainingDayKcal,
  sessionBurnKcal,
  weightedMet,
} from "./workout_burn.ts";

describe("BMR", () => {
  it("matches hand-computed Mifflin-St Jeor values", () => {
    expect(mifflinStJeor({ weightKg: 70, heightCm: 175, ageYears: 30, sex: "male" })).toBeCloseTo(1648.75, 9);
    expect(mifflinStJeor({ weightKg: 60, heightCm: 165, ageYears: 25, sex: "female" })).toBeCloseTo(1345.25, 9);
  });

  it("matches a hand-computed Katch-McArdle value", () => {
    expect(katchMcArdle({ weightKg: 80, bodyFatPct: 20 })).toBeCloseTo(370 + 21.6 * 64, 9);
  });

  it("returns null on any missing or bad input instead of defaulting", () => {
    const full = { weightKg: 70, heightCm: 175, ageYears: 30, sex: "male" as const };
    expect(mifflinStJeor({ ...full, weightKg: null })).toBeNull();
    expect(mifflinStJeor({ ...full, heightCm: undefined })).toBeNull();
    expect(mifflinStJeor({ ...full, ageYears: 0 })).toBeNull();
    expect(mifflinStJeor({ ...full, sex: null })).toBeNull();
    expect(mifflinStJeor({ ...full, weightKg: Number.NaN })).toBeNull();
    expect(katchMcArdle({ weightKg: 80, bodyFatPct: null })).toBeNull();
    expect(katchMcArdle({ weightKg: 80, bodyFatPct: 75 })).toBeNull();
  });
});

/** Builds `n` consecutive days from 2026-01-01 with the given intake and weight functions. */
function series(n: number, intake: (i: number) => number | null, weight: (i: number) => number | null): TdeeDay[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays("2026-01-01", i), intakeKcal: intake(i), weightKg: weight(i) }));
}

describe("adaptiveTdee (D11)", () => {
  it("equals mean intake when weight is flat", () => {
    const result = adaptiveTdee({ days: series(28, () => 2200, () => 75), baselineTdeeKcal: 2300 });
    expect(result).toMatchObject({ status: "ok", tdeeKcal: 2200, clamped: null, windowDays: 28, weighIns: 28 });
  });

  it("adds the energy of steady weight loss: 0.5 kg/week over 2000 kcal intake is about 2550", () => {
    const result = adaptiveTdee({ days: series(90, () => 2000, (i) => 80 - (0.5 / 7) * i), baselineTdeeKcal: 2400 });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.windowDays).toBe(28);
    expect(result.slopeKgPerDay).toBeCloseTo(-0.5 / 7, 3);
    expect(result.tdeeKcal).toBeGreaterThan(2540);
    expect(result.tdeeKcal).toBeLessThan(2560);
  });

  it("gates on 14 days, 10 weigh-ins and 70% logged", () => {
    expect(adaptiveTdee({ days: series(13, () => 2000, () => 70), baselineTdeeKcal: 2200 })).toMatchObject({
      status: "insufficient", reasons: ["too_few_days"],
    });
    expect(adaptiveTdee({ days: series(20, () => 2000, (i) => (i < 9 ? 70 : null)), baselineTdeeKcal: 2200 })).toMatchObject({
      status: "insufficient", reasons: ["too_few_weigh_ins"],
    });
    expect(adaptiveTdee({ days: series(20, (i) => (i % 2 === 0 ? 2000 : null), () => 70), baselineTdeeKcal: 2200 })).toMatchObject({
      status: "insufficient", reasons: ["too_few_logged_days"],
    });
    expect(adaptiveTdee({ days: series(20, () => 2000, () => 70), baselineTdeeKcal: null })).toMatchObject({
      status: "insufficient", reasons: ["missing_baseline"],
    });
    expect(adaptiveTdee({ days: [], baselineTdeeKcal: 2000 }).status).toBe("insufficient");
  });

  it("counts missing calendar days against the logged fraction", () => {
    const days = series(20, () => 2000, () => 70).filter((_, i) => i % 3 !== 0);
    expect(adaptiveTdee({ days, baselineTdeeKcal: 2200 })).toMatchObject({ status: "insufficient", reasons: ["too_few_logged_days"] });
  });

  it("clamps to 0.75-1.3 × baseline", () => {
    const fastLoss = adaptiveTdee({ days: series(60, () => 2000, (i) => 90 - 0.3 * i), baselineTdeeKcal: 2000 });
    expect(fastLoss).toMatchObject({ status: "ok", clamped: "high", tdeeKcal: 2600 });
    const fastGain = adaptiveTdee({ days: series(60, () => 1500, (i) => 60 + 0.3 * i), baselineTdeeKcal: 2000 });
    expect(fastGain).toMatchObject({ status: "ok", clamped: "low", tdeeKcal: 1500 });
  });

  const day = fc.record({
    intakeKcal: fc.option(fc.integer({ min: 0, max: 6000 }), { nil: null, freq: 8 }),
    weightKg: fc.option(fc.double({ min: 40, max: 150, noNaN: true }), { nil: null, freq: 4 }),
  });
  const days = fc.array(day, { minLength: 1, maxLength: 60 }).map((rows) =>
    rows.map((r, i) => ({ date: addDays("2026-03-01", i), ...r })),
  );
  const baseline = fc.integer({ min: 1200, max: 4000 });

  it("property: an ok estimate always lies inside the clamp", () => {
    fc.assert(
      fc.property(days, baseline, (d, b) => {
        const r = adaptiveTdee({ days: d, baselineTdeeKcal: b });
        if (r.status !== "ok") return;
        expect(r.tdeeKcal).toBeGreaterThanOrEqual(Math.round(b * TDEE_CLAMP.min));
        expect(r.tdeeKcal).toBeLessThanOrEqual(Math.round(b * TDEE_CLAMP.max));
        expect(r.unclampedKcal).toBeCloseTo(r.meanIntakeKcal - r.slopeKgPerDay * KCAL_PER_KG, 6);
      }),
    );
  });

  it("property: input order does not change the result", () => {
    fc.assert(
      fc.property(days, baseline, (d, b) => {
        expect(adaptiveTdee({ days: [...d].reverse(), baselineTdeeKcal: b })).toEqual(adaptiveTdee({ days: d, baselineTdeeKcal: b }));
      }),
    );
  });
});

describe("workout burn", () => {
  it("uses net MET: one hour of MET 5 at 70 kg is 280 kcal before modifiers", () => {
    expect(netMetKcal(5, 70, 1)).toBe(280);
    expect(sessionBurnKcal({ met: 5, durationMin: 60 }, 70)).toBeCloseTo(280 * 1.07, 9);
  });

  it("returns null without a body weight", () => {
    expect(sessionBurnKcal({ met: 5, durationMin: 60 }, null)).toBeNull();
    expect(plannedDailyAverageKcal([], 0)).toBeNull();
  });

  it("weights MET by duration and bands density by minutes per set", () => {
    expect(weightedMet([{ met: 3, minutes: 5 }, { met: 8, minutes: 25 }])).toBeCloseTo(215 / 30, 9);
    expect(weightedMet([])).toBeNull();
    expect(densityFromSets(20, 30)).toBe("circuit");
    expect(densityFromSets(20, 60)).toBe("short_rests");
    expect(densityFromSets(10, 45)).toBe("normal");
    expect(densityFromSets(10, 90)).toBe("long_rests");
  });

  it("averages a weekly plan over 7 days and over training days", () => {
    const plan = [{ session: { met: 5, durationMin: 60 }, sessionsPerWeek: 3 }];
    const perSession = 280 * 1.07;
    expect(plannedDailyAverageKcal(plan, 70)).toBeCloseTo((perSession * 3) / 7, 9);
    expect(plannedPerTrainingDayKcal(plan, 70)).toBeCloseTo(perSession, 9);
    expect(plannedPerTrainingDayKcal([], 70)).toBe(0);
  });

  it("property: the budget adjustment is never negative and never falls as logged burn rises", () => {
    const kcal = fc.double({ min: 0, max: 3000, noNaN: true });
    fc.assert(
      fc.property(kcal, kcal, kcal, (a, b, planned) => {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(budgetAdjustmentKcal(lo, planned)).toBeGreaterThanOrEqual(0);
        expect(budgetAdjustmentKcal(hi, planned)).toBeGreaterThanOrEqual(budgetAdjustmentKcal(lo, planned));
        expect(budgetAdjustmentKcal(lo, planned)).toBeGreaterThanOrEqual(budgetAdjustmentKcal(0, planned));
      }),
    );
  });

  it("property: session burn is linear in duration and weight", () => {
    const pos = fc.double({ min: 1, max: 300, noNaN: true });
    fc.assert(
      fc.property(fc.double({ min: 1, max: 15, noNaN: true }), pos, pos, (met, minutes, kg) => {
        const one = sessionBurnKcal({ met, durationMin: minutes }, kg) ?? Number.NaN;
        expect(sessionBurnKcal({ met, durationMin: minutes * 2 }, kg)).toBeCloseTo(one * 2, 6);
        expect(sessionBurnKcal({ met, durationMin: minutes }, kg * 2)).toBeCloseTo(one * 2, 6);
      }),
    );
  });
});

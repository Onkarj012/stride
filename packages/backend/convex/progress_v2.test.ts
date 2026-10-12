import { addDays, mifflinStJeor, weightTrend } from "@stride/core";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { ACTIVITY_FACTORS, GOAL_KCAL_OFFSETS } from "./progress_v2";
import { TDEE_USER_BATCH_SIZE } from "./tdee_recompute";

const modules = import.meta.glob("./**/*.*s");
const TODAY = "2026-10-15";
const BASELINE = (mifflinStJeor({ weightKg: 70, heightCm: 175, ageYears: 26, sex: "male" }) ?? 0) * ACTIVITY_FACTORS.moderate;

afterEach(() => {
  vi.useRealTimers();
});

/** A signed-in test user with a complete formula profile and a fixed IST day. */
async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 15, 0));
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await t.run((ctx) => ctx.db.insert("user_settings", {
    userId: "user_a", timeZone: "Asia/Kolkata", goal: "maintain", sex: "male", heightCm: 175, dob: "2000-01-01", activity: "moderate",
  }));
  return { t, user };
}

/** Inserts one bounded window of daily measurements and deterministic intake totals. */
async function seedDays(t: TestConvex<typeof schema>, options: { days?: number; weighIns?: number; loggedDays?: number; kcal?: number; userId?: string } = {}) {
  const { days = 14, weighIns = days, loggedDays = days, kcal = 2400, userId = "user_a" } = options;
  await t.run(async (ctx) => {
    for (let i = 0; i < days; i++) {
      const localDate = addDays(TODAY, i - days);
      if (i < weighIns) await ctx.db.insert("weights", { userId, localDate, kg: 70, loggedAt: 1 });
      if (i < loggedDays) await ctx.db.insert("day_totals", {
        userId, localDate, entryCount: 1, kcal, protein: 100, carbs: 300, fat: 80,
        fiber: 0, sugar: 0, sodiumMg: 0, fiberUnknown: 0, sugarUnknown: 0, sodiumMgUnknown: 0,
      });
    }
  });
}

/** Updates the test profile without changing its identity. */
async function updateSettings(t: TestConvex<typeof schema>, update: Partial<Doc<"user_settings">>) {
  await t.run(async (ctx) => {
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", "user_a")).first();
    if (settings === null) throw new Error("Missing settings");
    await ctx.db.patch("user_settings", settings._id, update);
  });
}

test("summary requires authentication and validates the bounded range", async () => {
  const { t, user } = await setup();
  await expect(t.query(api.progress_v2.summary, { rangeDays: 14 })).rejects.toThrow(/Unauthenticated/);
  for (const rangeDays of [0, -1, 181, 1.5, Infinity]) {
    await expect(user.query(api.progress_v2.summary, { rangeDays })).rejects.toThrow(/rangeDays/);
  }
  await expect(user.query(api.progress_v2.summary, { rangeDays: 180 })).resolves.toMatchObject({ localDate: TODAY });
});

test("summary reports eight real tracking days rather than 28 padded days", async () => {
  const { t, user } = await setup();
  await seedDays(t, { days: 8 });
  const summary = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(summary.gate).toEqual({ status: "insufficient", reasons: ["too_few_days", "too_few_weigh_ins"], windowDays: 8, weighIns: 8, loggedDays: 8, loggedFraction: 1, minDays: 14, minWeighIns: 10, minLoggedFraction: 0.7 });
  expect(summary.snapshot).toBeNull();
  expect(summary.target).toEqual({ kcal: Math.round(BASELINE), source: "formula", appliedLocalDate: TODAY });
});

test("empty data has no target and includes all gate reasons", async () => {
  const { user } = await setup();
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.gate.reasons).toEqual(["too_few_days", "too_few_weigh_ins", "too_few_logged_days", "missing_baseline"]);
  expect(result.gate.windowDays).toBe(0);
  expect(result.target).toBeNull();
  expect(result.latestTrendKg).toBeNull();
  expect(result.weeklyRateKg).toBeNull();
});

test("summary excludes future and other-user data and seeds EMA before the requested chart range", async () => {
  const { t, user } = await setup();
  await t.run(async (ctx) => {
    for (const [localDate, kg] of [["2026-10-01", 80], ["2026-10-10", 70], ["2026-10-15", 69], ["2026-10-16", 100]] as const) {
      await ctx.db.insert("weights", { userId: "user_a", localDate, kg, loggedAt: 1 });
    }
    await ctx.db.insert("weights", { userId: "user_b", localDate: TODAY, kg: 95, loggedAt: 1 });
    await ctx.db.insert("tdee_snapshots", { userId: "user_a", localDate: "2026-10-16", estimateKcal: 9999, trendKg: 100, windowDays: 28, confidence: 1 });
  });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 6 });
  expect(result.weights).toEqual([{ localDate: "2026-10-10", kg: 70, trendKg: 79 }, { localDate: TODAY, kg: 69, trendKg: 78 }]);
  expect(result.latestTrendKg).toBe(78);
  expect(result.weeklyRateKg).toBeCloseTo(-1.4);
  expect(result.snapshot).toBeNull();
  expect(result.target?.kcal).toBe(Math.round(BASELINE - 10 * ACTIVITY_FACTORS.moderate));
});

test("weekly rate is unavailable when all weigh-ins are older than the current week", async () => {
  const { t, user } = await setup();
  await t.run(async (ctx) => {
    for (const localDate of ["2026-09-01", "2026-09-02"]) await ctx.db.insert("weights", { userId: "user_a", localDate, kg: 70, loggedAt: 1 });
  });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 90 })).weeklyRateKg).toBeNull();
});

test("completed-day gate ignores today's intake and deleted totals", async () => {
  const { t, user } = await setup();
  await seedDays(t, { days: 14, loggedDays: 9 });
  await t.run(async (ctx) => {
    await ctx.db.insert("weights", { userId: "user_a", localDate: TODAY, kg: 70, loggedAt: 1 });
    for (const localDate of [TODAY, "2026-10-14"]) await ctx.db.insert("day_totals", {
      userId: "user_a", localDate, entryCount: localDate === TODAY ? 1 : 0, kcal: 2400, protein: 100, carbs: 300, fat: 80,
      fiber: 0, sugar: 0, sodiumMg: 0, fiberUnknown: 0, sugarUnknown: 0, sodiumMgUnknown: 0,
    });
  });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.gate).toMatchObject({ windowDays: 14, weighIns: 14, loggedDays: 9, loggedFraction: 9 / 14, reasons: ["too_few_logged_days"] });
  expect(result.snapshot).toBeNull();
});

test("recomputeUser upserts one ready snapshot per local date and uses the last 28 complete days", async () => {
  const { t, user } = await setup();
  await seedDays(t, { days: 40 });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect(await t.run((ctx) => ctx.db.query("tdee_snapshots").take(5))).toHaveLength(1);
  const result = await user.query(api.progress_v2.summary, { rangeDays: 30 });
  expect(result.snapshot).toEqual({ localDate: TODAY, estimate: 2400, trendKg: 70, windowDays: 28, confidence: 1 });
  expect(result.gate).toMatchObject({ status: "ok", windowDays: 28, weighIns: 28, loggedDays: 28 });
  expect(result.target).toEqual({ kcal: 2400, source: "adaptive", appliedLocalDate: TODAY });
});

test("recomputeUser guards clearing users and skips missing or invalid time zones", async () => {
  const { t } = await setup();
  await t.run((ctx) => ctx.db.insert("ledger_clears", { userId: "user_a" }));
  await expect(t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" })).rejects.toThrow(/being cleared/);
  await expect(t.mutation(internal.tdee_recompute.recomputeUser, { userId: "missing" })).resolves.toBeNull();
  await t.run((ctx) => ctx.db.insert("user_settings", { userId: "invalid", timeZone: "Not/AZone" }));
  await expect(t.mutation(internal.tdee_recompute.recomputeUser, { userId: "invalid" })).resolves.toBeNull();
});

test("a failed rerun removes today's invalid snapshot while preserving history and the weekly target", async () => {
  const { t, user } = await setup();
  await seedDays(t);
  await t.run((ctx) => ctx.db.insert("tdee_snapshots", { userId: "user_a", localDate: "2026-10-14", estimateKcal: 2500, trendKg: 70, windowDays: 14, confidence: 1 }));
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const frozen = (await user.query(api.progress_v2.summary, { rangeDays: 14 })).target;
  await t.run(async (ctx) => {
    const totals = await ctx.db.query("day_totals").withIndex("by_userId_and_localDate", (q) => q.eq("userId", "user_a")).take(28);
    for (const row of totals.slice(0, 5)) await ctx.db.patch("day_totals", row._id, { entryCount: 0, kcal: 0 });
  });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.gate.reasons).toEqual(["too_few_logged_days"]);
  expect(result.snapshot?.localDate).toBe("2026-10-14");
  expect(result.target).toEqual(frozen);
  expect((await t.run((ctx) => ctx.db.query("tdee_snapshots").take(5))).map((row) => row.localDate)).toEqual(["2026-10-14"]);
});

test.each(["sex", "heightCm", "dob", "activity", "goal"] as const)("missing %s gives no calorie target", async (key) => {
  const { t, user } = await setup();
  await seedDays(t);
  await updateSettings(t, { [key]: undefined });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toBeNull();
});

test.each(["lose", "maintain", "gain"] as const)("%s goal applies its documented fixed offset", async (goal) => {
  const { t, user } = await setup();
  await seedDays(t, { kcal: 2600 });
  await updateSettings(t, { goal });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target?.kcal).toBe(2600 + GOAL_KCAL_OFFSETS[goal]);
});

test.each([{ goal: "lose", intake: 100, multiplier: 0.75 }, { goal: "gain", intake: 10000, multiplier: 1.3 }] as const)("$goal target obeys the $multiplier baseline clamp", async ({ goal, intake, multiplier }) => {
  const { t, user } = await setup();
  await seedDays(t, { kcal: intake });
  await updateSettings(t, { goal });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.snapshot?.estimate).toBe(Math.round(BASELINE * multiplier));
  expect(result.target?.kcal).toBe(Math.round(BASELINE * multiplier));
});

test("logging the first measured weight freezes the formula target until seven local days pass", async () => {
  const { t, user } = await setup();
  await user.mutation(api.weights.logWeight, { kg: 70 });
  const initial = (await user.query(api.progress_v2.summary, { rangeDays: 14 })).target;
  expect(initial).toEqual({ kcal: Math.round(BASELINE), source: "formula", appliedLocalDate: TODAY });
  await user.mutation(api.weights.logWeight, { kg: 80 });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toEqual(initial);
  await seedDays(t);
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).snapshot).not.toBeNull();
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toEqual(initial);
  vi.setSystemTime(Date.UTC(2026, 9, 21, 0));
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toEqual(initial);
  vi.setSystemTime(Date.UTC(2026, 9, 22, 0));
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toMatchObject({ source: "adaptive", appliedLocalDate: "2026-10-22" });
});

test("weekly refresh uses latest historical snapshot when today's gate fails", async () => {
  const { t, user } = await setup();
  await seedDays(t, { days: 1 });
  await updateSettings(t, { calorieTarget: { kcal: 2200, source: "formula", appliedLocalDate: "2026-10-08" } });
  await t.run((ctx) => ctx.db.insert("tdee_snapshots", { userId: "user_a", localDate: "2026-10-10", estimateKcal: 2500, trendKg: 70, windowDays: 14, confidence: 1 }));
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.gate.status).toBe("insufficient");
  expect(result.target).toEqual({ kcal: 2500, source: "adaptive", appliedLocalDate: TODAY });
  expect(await t.run((ctx) => ctx.db.query("tdee_snapshots").take(5))).toHaveLength(1);
});

test("formula birthday uses the user's local calendar day", async () => {
  const { t, user } = await setup();
  await seedDays(t, { days: 1 });
  await updateSettings(t, { dob: "2000-10-15" });
  vi.setSystemTime(Date.UTC(2026, 9, 14, 19)); // 00:30 IST on the birthday.
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.localDate).toBe(TODAY);
  expect(result.target?.kcal).toBe(Math.round(BASELINE));
});

test("daily recompute paginates profiles, schedules active users and skips idle or clearing users", async () => {
  const { t } = await setup();
  await seedDays(t);
  await t.run(async (ctx) => {
    for (let i = 0; i < TDEE_USER_BATCH_SIZE + 3; i++) await ctx.db.insert("user_settings", { userId: `idle_${i}`, timeZone: "Asia/Kolkata" });
    await ctx.db.insert("user_settings", { userId: "active_last", timeZone: "Asia/Kolkata", goal: "maintain", sex: "male", heightCm: 175, dob: "2000-01-01", activity: "moderate" });
    await ctx.db.insert("user_settings", { userId: "clearing", timeZone: "Asia/Kolkata" });
    await ctx.db.insert("weights", { userId: "clearing", localDate: TODAY, kg: 70, loggedAt: 1 });
    await ctx.db.insert("ledger_clears", { userId: "clearing" });
    await ctx.db.insert("user_settings", { userId: "bad_zone", timeZone: "bad" });
  });
  await seedDays(t, { userId: "active_last" });
  await t.mutation(internal.tdee_recompute.recomputeDaily, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const snapshots = await t.run((ctx) => ctx.db.query("tdee_snapshots").take(10));
  expect(snapshots.map((row) => row.userId).sort()).toEqual(["active_last", "user_a"]);
});

test("cleared profiles and measurements cannot be resurrected by queued recompute work", async () => {
  const { t, user } = await setup();
  await seedDays(t);
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  await user.mutation(api.users.clearAllData, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect(await t.run((ctx) => ctx.db.query("tdee_snapshots").take(10))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("user_settings").take(10))).toEqual([]);
});

test("chart trend comes from the shared core EMA", async () => {
  const { t, user } = await setup();
  const points = [{ date: "2026-10-12", weightKg: 70, intakeKcal: null }, { date: "2026-10-14", weightKg: 69, intakeKcal: null }];
  await t.run(async (ctx) => {
    for (const point of points) await ctx.db.insert("weights", { userId: "user_a", localDate: point.date, kg: point.weightKg, loggedAt: 1 });
  });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.weights.map((row) => row.trendKg)).toEqual([...weightTrend(points).values()]);
});

import { ACTIVITY_FACTORS, adaptiveTdee, addDays, mifflinStJeor, weightTrend } from "@stride/core";
import type { FunctionArgs } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { TDEE_USER_BATCH_SIZE } from "./tdee_recompute";

const modules = import.meta.glob("./**/*.*s");
const TODAY = "2026-10-15";
const BASELINE = (mifflinStJeor({ weightKg: 70, heightCm: 175, ageYears: 26, sex: "male" }) ?? 0) * ACTIVITY_FACTORS.moderate;
const PROFILE: FunctionArgs<typeof api.progress_v2.saveProfile> = { goal: "maintain", sex: "male", heightCm: 175, dob: "2000-01-01", activity: "moderate", dietTypes: ["veg"] };

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

test.each([{ goal: "lose", offset: -550 }, { goal: "maintain", offset: 0 }, { goal: "gain", offset: 275 }] as const)("$goal steady pace applies its offset of $offset kcal", async ({ goal, offset }) => {
  const { t, user } = await setup();
  await seedDays(t, { kcal: 2600 });
  await updateSettings(t, { goal });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target?.kcal).toBe(2600 + offset);
});

// The bound applies to the burn estimate; the steady pace then moves the target from there (male floor 1500).
test.each([
  { goal: "lose", intake: 100, multiplier: 0.75, offset: -550 },
  { goal: "gain", intake: 10000, multiplier: 1.3, offset: 275 },
] as const)("$goal target applies its pace to the $multiplier-bounded estimate", async ({ goal, intake, multiplier, offset }) => {
  const { t, user } = await setup();
  await seedDays(t, { kcal: intake });
  await updateSettings(t, { goal });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 14 });
  expect(result.snapshot?.estimate).toBe(Math.round(BASELINE * multiplier));
  expect(result.target?.kcal).toBe(Math.max(1500, Math.round(BASELINE * multiplier + offset)));
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

test("snapshot warms the EMA on older weigh-ins, matching core on the full series and the chart trend", async () => {
  const { t, user } = await setup();
  // 120 days of steady 0.5 kg/week loss at 2000 kcal: the true burn is 2000 + 7700 / 14 = 2550.
  const days = Array.from({ length: 120 }, (_, i) => ({ date: addDays(TODAY, i - 120), weightKg: 90 - i / 14, intakeKcal: 2000 }));
  await t.run(async (ctx) => {
    for (const day of days) {
      await ctx.db.insert("weights", { userId: "user_a", localDate: day.date, kg: day.weightKg, loggedAt: 1 });
      await ctx.db.insert("day_totals", {
        userId: "user_a", localDate: day.date, entryCount: 1, kcal: day.intakeKcal, protein: 100, carbs: 200, fat: 60,
        fiber: 0, sugar: 0, sodiumMg: 0, fiberUnknown: 0, sugarUnknown: 0, sodiumMgUnknown: 0,
      });
    }
  });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const latestKg = days[days.length - 1]?.weightKg ?? 0;
  const baseline = (mifflinStJeor({ weightKg: latestKg, heightCm: 175, ageYears: 26, sex: "male" }) ?? 0) * ACTIVITY_FACTORS.moderate;
  const full = adaptiveTdee({ days, baselineTdeeKcal: baseline });
  if (full.status !== "ok") throw new Error("Expected a ready core result");
  expect(Math.abs(full.tdeeKcal - 2550)).toBeLessThanOrEqual(5);

  const result = await user.query(api.progress_v2.summary, { rangeDays: 180 });
  expect(result.snapshot).toMatchObject({ estimate: full.tdeeKcal, windowDays: 28 });
  expect(result.snapshot?.trendKg).toBeCloseTo(full.trendKg, 9);
  expect(result.weights.at(-1)?.trendKg).toBeCloseTo(result.snapshot?.trendKg ?? 0, 9);
});

test("one old weigh-in warms the trend without stretching the gate window to 28 days", async () => {
  const { t, user } = await setup();
  await t.run((ctx) => ctx.db.insert("weights", { userId: "user_a", localDate: addDays(TODAY, -60), kg: 72, loggedAt: 1 }));
  await seedDays(t, { days: 15 });
  await t.mutation(internal.tdee_recompute.recomputeUser, { userId: "user_a" });
  const result = await user.query(api.progress_v2.summary, { rangeDays: 90 });
  expect(result.gate).toMatchObject({ status: "ok", windowDays: 15, weighIns: 15, loggedFraction: 1 });
  expect(result.snapshot).toMatchObject({ windowDays: 15 });
  // The 72 kg weigh-in seeds the EMA, so the trend sits above the flat 70 kg of the window.
  expect(result.snapshot?.trendKg).toBeGreaterThan(70);
});

test("saveProfile requires authentication and validates height and birth date", async () => {
  const { t, user } = await setup();
  await expect(t.mutation(api.progress_v2.saveProfile, PROFILE)).rejects.toThrow(/Unauthenticated/);
  for (const heightCm of [99, 251, Infinity]) {
    await expect(user.mutation(api.progress_v2.saveProfile, { ...PROFILE, heightCm })).rejects.toThrow(/heightCm/);
  }
  for (const dob of ["2026-13-01", "2026-10-15", "1900-01-01"]) {
    await expect(user.mutation(api.progress_v2.saveProfile, { ...PROFILE, dob })).rejects.toThrow(/dob/);
  }
});

test("saving a profile then logging a weight gives a formula target", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.saveProfile, PROFILE);
  await user.mutation(api.weights.logWeight, { kg: 70 });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toEqual({ kcal: Math.round(BASELINE), source: "formula", appliedLocalDate: TODAY });
});

test("changing the goal re-freezes the calorie target at once", async () => {
  const { user } = await setup();
  await user.mutation(api.weights.logWeight, { kg: 70 });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target?.kcal).toBe(Math.round(BASELINE));
  await user.mutation(api.progress_v2.saveProfile, { ...PROFILE, goal: "lose" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target?.kcal).toBe(Math.round(BASELINE - 550));
});

test("profileStatus lists missing fields until the profile and a weight are saved", async () => {
  const { user } = await setup();
  expect(await user.query(api.progress_v2.profileStatus, {})).toEqual({ complete: false, missing: ["dietType", "weight"] });
  await user.mutation(api.progress_v2.saveProfile, PROFILE);
  expect(await user.query(api.progress_v2.profileStatus, {})).toEqual({ complete: false, missing: ["weight"] });
  await user.mutation(api.weights.logWeight, { kg: 70 });
  expect(await user.query(api.progress_v2.profileStatus, {})).toEqual({ complete: true, missing: [] });
});

test("saveProfile keeps every picked diet once", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.saveProfile, { ...PROFILE, dietTypes: ["veg", "non_veg", "veg"] });
  expect(await user.query(api.progress_v2.profile, {})).toMatchObject({ dietTypes: ["veg", "non_veg"] });
});

test("saveProfile rejects an empty diet pick", async () => {
  const { user } = await setup();
  await expect(user.mutation(api.progress_v2.saveProfile, { ...PROFILE, dietTypes: [] })).rejects.toThrow("Pick at least one diet");
});

test("a row saved with the old single dietType reads back as a one-item list", async () => {
  const { t, user } = await setup();
  await t.run(async (ctx) => {
    const row = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", "user_a")).first();
    if (row === null) throw new Error("setup row missing");
    await ctx.db.patch("user_settings", row._id, { dietType: "vegan" });
  });
  expect(await user.query(api.progress_v2.profile, {})).toMatchObject({ dietTypes: ["vegan"] });
  expect((await user.query(api.progress_v2.profileStatus, {})).missing).not.toContain("dietType");
});

test("updateProfile changing the pace re-freezes the target at once", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.saveProfile, { ...PROFILE, goal: "lose", pace: "steady" });
  await user.mutation(api.weights.logWeight, { kg: 70 });
  const steady = (await user.query(api.progress_v2.summary, { rangeDays: 14 })).target?.kcal;
  expect(steady).toBe(Math.round(BASELINE - 550));
  await user.mutation(api.progress_v2.updateProfile, { pace: "fast" });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target?.kcal).toBeLessThan(steady ?? 0);
});

test("updateProfile rejects a target weight on the wrong side of the current weight", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.saveProfile, { ...PROFILE, goal: "lose" });
  await user.mutation(api.weights.logWeight, { kg: 70 });
  await expect(user.mutation(api.progress_v2.updateProfile, { targetWeightKg: 75 })).rejects.toThrow(/targetWeightKg/);
  await expect(user.mutation(api.progress_v2.updateProfile, { targetWeightKg: 65 })).resolves.toBeNull();
});

test("updateProfile on unrelated fields still works once the target weight is reached", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.saveProfile, { ...PROFILE, goal: "lose", targetWeightKg: 65 });
  await user.mutation(api.weights.logWeight, { kg: 64 });
  await expect(user.mutation(api.progress_v2.updateProfile, { dietTypes: ["vegan"] })).resolves.toBeNull();
  await expect(user.mutation(api.progress_v2.updateProfile, {})).resolves.toBeNull();
  await expect(user.mutation(api.progress_v2.updateProfile, { targetWeightKg: 70 })).rejects.toThrow(/targetWeightKg/);
});

test("profile ignores a weigh-in dated after today", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.saveProfile, PROFILE);
  await user.mutation(api.weights.logWeight, { kg: 70 });
  await user.mutation(api.weights.logWeight, { kg: 80, localDate: addDays(TODAY, 1) });
  expect(await user.query(api.progress_v2.profile, {})).toMatchObject({ latestWeightKg: 70 });
});

test("updateProfile rejects trainingDaysPerWeek outside 0-7", async () => {
  const { user } = await setup();
  await expect(user.mutation(api.progress_v2.updateProfile, { trainingDaysPerWeek: 8 })).rejects.toThrow(/trainingDaysPerWeek/);
});

test("a low-maintenance female target is lifted to the sex floor and reports why", async () => {
  const { user } = await setup();
  await user.mutation(api.progress_v2.updateProfile, { sex: "female", heightCm: 160, dob: "1986-01-01", activity: "sedentary", goal: "lose" });
  await user.mutation(api.weights.logWeight, { kg: 50 });
  expect((await user.query(api.progress_v2.summary, { rangeDays: 14 })).target).toEqual({ kcal: 1200, source: "formula", appliedLocalDate: TODAY, clamped: "floor" });
});

test("profile returns only the signed-in user's settings", async () => {
  const { t, user } = await setup();
  expect(await t.withIdentity({ subject: "user_b" }).query(api.progress_v2.profile, {})).toBeNull();
  expect(await user.query(api.progress_v2.profile, {})).toMatchObject({ goal: "maintain", latestWeightKg: null });
});

test("setUnits saves the unit choice and keeps the frozen calorie target", async () => {
  const { t, user } = await setup();
  await updateSettings(t, { calorieTarget: { kcal: 2000, source: "formula", appliedLocalDate: TODAY } });
  await user.mutation(api.progress_v2.setUnits, { units: "imperial" });
  const settings = await t.run((ctx) => ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", "user_a")).first());
  expect(settings).toMatchObject({ units: "imperial", calorieTarget: { kcal: 2000 } });
});

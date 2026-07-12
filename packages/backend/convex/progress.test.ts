import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

const PLAN_INPUT = {
  weightKg: 80, heightCm: 178, age: 28, sex: "male",
  occupationType: "desk", workHoursPerDay: 8, lifestyleActivity: "moderate",
  weeklyWorkouts: [
    { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
    { type: "run_slow", durationMin: 30, sessionsPerWeek: 2 },
  ],
  goal: "moderate_loss",
  date: "2026-05-29",
};

test("days without a daily_goals row use the live-computed plan goal, not 2400", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);

  // Only 2026-05-29 has a seeded daily_goals row; the two prior days have none.
  const rows = await asUser.query(api.progress.getProgress, { days: 3, today: "2026-05-29" });

  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.goal).toBe(plan.calories);
    expect(row.goal).not.toBe(2400);
  }
});

test("a rowless training day gets a burn-adjusted live goal", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);

  // Simulate a pre-fix workout that never wrote a daily_goals row.
  await t.run(async (ctx) => {
    await ctx.db.insert("workouts", {
      userId: "user1", date: "2026-05-28", name: "Legacy session",
      sets: "n/a", intensity: "HIGH",
      caloriesBurned: plan.plannedEatPerTrainingDay + 400,
    });
  });

  const rows = await asUser.query(api.progress.getProgress, { days: 3, today: "2026-05-29" });
  const trainingDay = rows.find((r) => r.date === "2026-05-28");
  expect(trainingDay?.goal).toBe(plan.calories + 400);
});

test("a day with a stored daily_goals row keeps using it", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);
  await asUser.mutation(api.goals.upsertDailyGoal, { date: "2026-05-28", calorieGoal: 1800 });

  const rows = await asUser.query(api.progress.getProgress, { days: 3, today: "2026-05-29" });
  const day = rows.find((r) => r.date === "2026-05-28");
  expect(day?.goal).toBe(1800);
});

test("without a stored plan, falls back to profile calorieTarget then 2400", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });

  // No profile at all → legacy 2400 default.
  let rows = await asUser.query(api.progress.getProgress, { days: 2, today: "2026-05-29" });
  for (const row of rows) expect(row.goal).toBe(2400);

  // Profile with a calorieTarget but no planBreakdown → calorieTarget.
  await asUser.mutation(api.profile.upsertProfile, { calorieTarget: 2100 });
  rows = await asUser.query(api.progress.getProgress, { days: 2, today: "2026-05-29" });
  for (const row of rows) expect(row.goal).toBe(2100);
});

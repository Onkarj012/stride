import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

const PLAN_INPUT = {
  weightKg: 80, heightCm: 178, age: 28, sex: "male",
  occupationType: "desk", workHoursPerDay: 8, lifestyleActivity: "moderate",
  weeklyWorkouts: [{ type: "strength", durationMin: 60, sessionsPerWeek: 4 }],
  goal: "moderate_loss",
  date: "2026-05-29",
};

test("rowless progress days use the live plan goal and that day's burn", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);

  await t.run(async (ctx) => {
    await ctx.db.insert("workouts", {
      userId: "user1", date: "2026-05-28", name: "Legacy session",
      sets: "n/a", intensity: "HIGH", caloriesBurned: plan.plannedEatPerTrainingDay + 400,
    });
  });

  const rows = await asUser.query(api.progress.getProgress, { days: 3, today: "2026-05-29" });
  expect(rows).toHaveLength(3);
  expect(rows.find((row) => row.date === "2026-05-28")?.goal).toBe(plan.calories + 400);
  expect(rows.find((row) => row.date === "2026-05-27")?.goal).toBe(plan.calories);
});

test("a stored daily goal overrides live fallback resolution", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);
  await asUser.mutation(api.goals.upsertDailyGoal, { date: "2026-05-28", calorieGoal: 1800 });

  const rows = await asUser.query(api.progress.getProgress, { days: 3, today: "2026-05-29" });
  expect(rows.find((row) => row.date === "2026-05-28")?.goal).toBe(1800);
});

test("invalid plans fall back to profile targets and then shared defaults", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });

  let rows = await asUser.query(api.progress.getProgress, { days: 2, today: "2026-05-29" });
  expect(rows.every((row) => row.goal === 2000)).toBe(true);

  await asUser.mutation(api.profile.upsertProfile, { calorieTarget: 2100, planBreakdown: "not json" });
  rows = await asUser.query(api.progress.getProgress, { days: 2, today: "2026-05-29" });
  expect(rows.every((row) => row.goal === 2100 && Number.isFinite(row.goal))).toBe(true);
});

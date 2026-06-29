import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

const INPUT = {
  weightKg: 80,
  heightCm: 178,
  age: 28,
  sex: "male",
  occupationType: "desk",
  workHoursPerDay: 8,
  lifestyleActivity: "moderate",
  weeklyWorkouts: [
    { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
    { type: "run_slow", durationMin: 30, sessionsPerWeek: 2 },
  ],
  goal: "cut", // legacy → moderate_loss
  date: "2026-05-29",
};

test("upsertPlanFromOnboarding persists targets + seeds daily_goals + maps legacy goal", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });

  const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, INPUT);
  expect(plan.calories).toBeGreaterThan(2000);

  const profile = await asUser.query(api.profile.getProfile, {});
  expect(profile?.calorieTarget).toBe(plan.calories);
  expect(profile?.proteinTarget).toBe(plan.protein);
  expect(profile?.goal).toBe("moderate_loss"); // legacy mapped
  expect(profile?.onboardingComplete).toBe(true);
  expect(JSON.parse(profile!.planBreakdown!).breakdown.bmr).toBe(1778);

  const day = await asUser.query(api.goals.getDailyGoal, { date: "2026-05-29" });
  expect(day.calorieGoal).toBe(plan.calories);
  expect(day.carbGoal).toBe(plan.carbs);
});

test("calculateNutritionPlan query computes without persisting", async () => {
  const t = convexTest(schema, modules);
  const { date, ...planInput } = INPUT;
  const plan = await t.withIdentity({ subject: "u2" }).query(api.profile.calculateNutritionPlan, planInput);
  expect(plan.breakdown.goal).toBe("moderate_loss");
  const profile = await t.withIdentity({ subject: "u2" }).query(api.profile.getProfile, {});
  expect(profile).toBeNull(); // not persisted
});

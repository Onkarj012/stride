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

test("logging an extra-burn workout raises calorie + carb goals; protein/fat fixed", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);
  // plannedDailyEAT is 320 for this profile.
  const extraBurn = plan.plannedDailyEAT + 500; // delta +500

  await asUser.mutation(api.workouts.addWorkout, {
    name: "Long HIIT", sets: "n/a", intensity: "HIGH",
    date: "2026-05-29", caloriesBurned: extraBurn,
  });

  const day = await asUser.query(api.goals.getDailyGoal, { date: "2026-05-29" });
  expect(day.calorieGoal).toBe(plan.calories + 500);
  expect(day.carbGoal).toBe(plan.carbs + 125); // 500/4
  expect(day.proteinGoal).toBe(plan.protein);
  expect(day.fatGoal).toBe(plan.fat);
});

test("getTodayBrief surfaces adjusted target + note", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, PLAN_INPUT);
  await asUser.mutation(api.workouts.addWorkout, {
    name: "Long HIIT", sets: "n/a", intensity: "HIGH",
    date: "2026-05-29", caloriesBurned: plan.plannedDailyEAT + 600,
  });
  const brief = await asUser.query(api.insights.getTodayBrief, { today: "2026-05-29" });
  expect(brief.stats.adjustedCalorieTarget).toBe(plan.calories + 600);
  expect(brief.stats.adjustmentNote).toMatch(/\+600 kcal/);
});

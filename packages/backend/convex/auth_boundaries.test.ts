import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("anonymous callers cannot invoke paid AI actions", async () => {
  const t = convexTest(schema, modules);

  await expect(t.action(api.ai.estimateMeal, { mealName: "oatmeal" })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.ai.parseMeal, { description: "a bowl of oatmeal" })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.ai.parseWorkout, { description: "30 minutes of running" })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.ai.parseNutritionImage, { imageDataUrl: "data:image/png;base64," })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.ai.estimatePortion, {
    baseName: "oatmeal",
    caloriesPer100g: 100,
    proteinPer100g: 5,
    carbsPer100g: 15,
    fatPer100g: 2,
    portionDescription: "one bowl",
  })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.ai.calculateProfileMacros, {
    weight: 70,
    height: 175,
    age: 30,
  })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.ai.transcribe, { audio: "" })).rejects.toThrow("Unauthenticated");
});

test("anonymous callers cannot invoke shared-cache or profile actions", async () => {
  const t = convexTest(schema, modules);

  await expect(t.action(api.foods.searchFoods, { query: "apple" })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.foods.lookupBarcode, { barcode: "0123456789012" })).rejects.toThrow("Unauthenticated");
  await expect(t.action(api.profile.calculateTDEE, {
    weight: 70,
    height: 175,
    age: 30,
    sex: "male",
  })).rejects.toThrow("Unauthenticated");
  await expect(t.mutation(api.gamification.recordActivity, { type: "meal" })).rejects.toThrow("Unauthenticated");
});

test("calorie feedback requires auth and workout ownership", async () => {
  const t = convexTest(schema, modules);
  const workoutId = await t.run((ctx) => ctx.db.insert("workouts", {
    userId: "owner",
    date: "2026-07-18",
    name: "Run",
    sets: "1",
    intensity: "moderate",
  }));

  await expect(t.mutation(api.calibration.submitCalorieFeedback, {
    workoutId,
    feedback: "accurate",
  })).rejects.toThrow("Unauthenticated");

  await expect(t.withIdentity({ subject: "intruder" }).mutation(api.calibration.submitCalorieFeedback, {
    workoutId,
    feedback: "accurate",
  })).rejects.toThrow("Not found");

  await expect(t.withIdentity({ subject: "owner" }).mutation(api.calibration.submitCalorieFeedback, {
    workoutId,
    feedback: "accurate",
  })).resolves.toMatchObject({ metabolicFactor: 1, totalWorkoutsTracked: 0 });
});

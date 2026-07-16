import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const writer = (name: "writeMealAction" | "writeWorkoutAction" | "writeRecoveryAction") => (internal as any).actions_writer[name];
const foodMemory = (api as any).food_memory;

function group(key: string, sourceSurface: "chat" | "direct_ui" = "chat") {
  return { userId: "derived-user", groupIdempotencyKey: key, sourceSurface, rawInput: key };
}

function member(payload: any, key: string, provenance: "user_reported" | "ai_extracted" = "user_reported") {
  return {
    memberIdempotencyKey: key,
    payload,
    provenance,
    validation: { status: "valid" as const, messages: [] },
    reversible: true,
    resolvedDate: payload.date,
    resolvedTime: payload.time ?? payload.timestamp,
  };
}

async function writeMeal(t: ReturnType<typeof convexTest>, key: string, date = "2026-07-16", name = key) {
  return t.mutation(writer("writeMealAction"), {
    group: group(key),
    member: member({ name, calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date, logSource: "test" }, `${key}-member`, "ai_extracted"),
  });
}

describe("derived-state recomputation and memory correction", () => {
  test("a canonical workout write recomputes the day calorie adjustment", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const plan = await asUser.mutation(api.profile.upsertPlanFromOnboarding, {
      weightKg: 80, heightCm: 178, age: 28, sex: "male", occupationType: "desk", workHoursPerDay: 8,
      lifestyleActivity: "moderate", weeklyWorkouts: [{ type: "strength", durationMin: 60, sessionsPerWeek: 4 }],
      goal: "moderate_loss", date: "2026-07-16",
    });
    await t.mutation(writer("writeWorkoutAction"), {
      group: group("derived-workout"),
      member: member({ name: "Run", sets: "1", duration: "30", intensity: "MODERATE", date: "2026-07-16", timestamp: "09:00", caloriesBurned: plan.plannedEatPerTrainingDay + 200, logSource: "test" }, "derived-workout-member"),
    });
    await expect(asUser.query(api.goals.getDailyGoal, { date: "2026-07-16" })).resolves.toMatchObject({ calorieGoal: plan.calories + 200 });
  });

  test("undo rebuilds streak and XP from active source rows", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    await writeMeal(t, "derived-yesterday", "2026-07-15");
    await writeMeal(t, "derived-today");
    const before = await asUser.query(api.gamification.getState);
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    const todayAction = actions.find((action) => action.memberIdempotencyKey === "derived-today-member");
    if (!todayAction) throw new Error("today action missing");
    await asUser.mutation((api as any).actions_undo.undoAction, { actionId: todayAction._id });
    const after = await asUser.query(api.gamification.getState);
    expect(before?.streakDays).toBe(2);
    expect(after).toMatchObject({ streakDays: 1, totalMealsLogged: 1 });
    expect(after!.xp).toBeLessThan(before!.xp);
  });

  test("delete followed by a canonical relog leaves one active source and consistent counts", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const originalId = await writeMeal(t, "derived-delete");
    await asUser.mutation(api.meals.deleteMeal, { id: originalId });
    await writeMeal(t, "derived-relog", "2026-07-16", "relogged");
    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(1);
    expect(await asUser.query(api.gamification.getState)).toMatchObject({ totalMealsLogged: 1 });
  });

  test("source undo marks a generated insight stale", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const mealId = await writeMeal(t, "derived-insight");
    await t.mutation((internal as any).insights.saveInsights, { userId: "derived-user", date: "2026-07-16", insights: ["old"] });
    const action = (await t.run((ctx) => ctx.db.query("actions").collect())).find((row) => row.committedRowRef?.id === mealId);
    if (!action) throw new Error("meal action missing");
    await asUser.mutation((api as any).actions_undo.undoAction, { actionId: action._id });
    const row = await t.run((ctx) => ctx.db.query("insights").withIndex("by_user_date", (q) => q.eq("userId", "derived-user").eq("date", "2026-07-16")).first());
    expect(row).toMatchObject({ stale: true, generatedAt: expect.any(Number), sourceRowIds: [mealId] });
    await expect(asUser.query(api.insights.getDailyInsights, { date: "2026-07-16" })).resolves.toMatchObject({ insights: [], stale: true });
  });

  test("explicit facts persist with user provenance", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const id = await asUser.mutation(foodMemory.createExplicitFact, { fact: "I'm vegetarian", sourceActionId: "fact-action" });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ fact: "I'm vegetarian", memoryType: "explicit", approvalStatus: "approved", provenance: "user_stated", sourceActionIds: ["fact-action"] });
  });

  test("inferred preferences remain pending until approve or reject", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const first = await t.mutation((internal as any).food_memory.recordFromMeal, { userId: "derived-user", name: "Oats", kcal: 300, protein: 12, carbs: 45, fat: 8, date: "2026-07-16" });
    const second = await t.mutation((internal as any).food_memory.recordFromMeal, { userId: "derived-user", name: "Rice", kcal: 250, protein: 5, carbs: 52, fat: 1, date: "2026-07-16" });
    expect(await asUser.query(foodMemory.getPendingApprovals)).toHaveLength(2);
    await asUser.mutation(foodMemory.approveMemory, { id: first });
    await asUser.mutation(foodMemory.rejectMemory, { id: second });
    expect(await t.run((ctx) => Promise.all([ctx.db.get(first), ctx.db.get(second)]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ approvalStatus: "approved" }),
      expect.objectContaining({ approvalStatus: "rejected" }),
    ]));
  });

  test("memory undo is independent from meal undo", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const mealId = await writeMeal(t, "derived-independent-memory");
    const memory = (await t.run((ctx) => ctx.db.query("food_memory").collect()))[0];
    const action = (await t.run((ctx) => ctx.db.query("actions").collect()))[0];
    await asUser.mutation((api as any).actions_undo.undoAction, { actionId: action._id });
    const memoryBeforeUndo = await t.run((ctx) => ctx.db.get(memory._id));
    expect(memoryBeforeUndo?._id).toBe(memory._id);
    expect(memoryBeforeUndo?.undoneAt).toBeUndefined();
    await asUser.mutation(foodMemory.undoMemory, { id: memory._id });
    expect(await t.run((ctx) => ctx.db.get(mealId))).toMatchObject({ undoneAt: expect.any(Number) });
    expect(await t.run((ctx) => ctx.db.get(memory._id))).toMatchObject({ undoneAt: expect.any(Number) });
  });

  test("correction aliases stay bounded and original AI payload remains auditable", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "derived-user" });
    const memoryId = await t.mutation((internal as any).food_memory.recordFromMeal, { userId: "derived-user", name: "Oats", kcal: 300, protein: 12, carbs: 45, fat: 8, date: "2026-07-16", source: "corrected" });
    const mealId = await t.mutation(writer("writeMealAction"), {
      group: group("derived-correction"),
      member: member({ name: "Oats", calories: 300, protein: 12, carbs: 45, fat: 8, time: "08:00", date: "2026-07-16", foodMemoryId: memoryId, logSource: "ai" }, "derived-correction-member", "ai_extracted"),
    });
    const original = (await t.run((ctx) => ctx.db.query("actions").collect()))[0].payload;
    await asUser.mutation(api.meals.updateMeal, { id: mealId, name: "Corrected oats", calories: 320, protein: 14, carbs: 44, fat: 9, time: "08:00" });
    for (let i = 0; i < 7; i++) {
      await t.mutation((internal as any).food_memory.updateFromCorrection, { foodMemoryId: memoryId, name: `Alias ${i}`, kcal: 320, protein: 14, carbs: 44, fat: 9, date: "2026-07-16" });
    }
    const action = (await t.run((ctx) => ctx.db.query("actions").collect()))[0];
    const correctedMemory = await t.run((ctx) => ctx.db.get(memoryId));
    expect(correctedMemory?.aliases).toHaveLength(5);
    expect(action.originalPayload).toEqual(original);
  });

  test("canonical paths all expose the central recompute hook", () => {
    const paths = ["actions_writer.ts", "actions_undo.ts", "meals.ts", "workouts.ts", "wellness.ts"];
    for (const path of paths) expect(readFileSync(new URL(`./${path}`, import.meta.url), "utf8")).toContain("recomputeForAction");
    expect(readFileSync(new URL("./ai.ts", import.meta.url), "utf8")).toContain("writeWorkoutAction");
  });
});

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { LEGACY_LEDGER_TABLES, WIPE_BATCH } from "./wipe_legacy";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => {
  vi.useRealTimers();
});

test("wipeLegacyLedger empties only the listed old tables, across batches", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });

  const foodId = await t.run(async (ctx) => {
    const meal = {
      userId: "user_a",
      date: "2026-10-05",
      name: "Dal rice",
      calories: 500,
      protein: 15,
      carbs: 80,
      fat: 10,
      time: "13:00",
    };
    // More than one batch, so the self-scheduling continuation runs.
    for (let i = 0; i < WIPE_BATCH + 50; i++) await ctx.db.insert("meals", meal);
    const sessionId = await ctx.db.insert("chat_sessions", { userId: "user_a", title: "Chat", updatedAt: 1 });
    await ctx.db.insert("chat_messages", { userId: "user_a", sessionId, role: "user", content: "dal rice" });
    await ctx.db.insert("weight_logs", { userId: "user_a", date: "2026-10-05", weightKg: 72, source: "profile", createdAt: 1 });
    await ctx.db.insert("food_memory", {
      userId: "user_a",
      normalizedName: "dal rice",
      displayName: "Dal rice",
      aliases: [],
      kcal: 500,
      protein: 15,
      carbs: 80,
      fat: 10,
      timesLogged: 3,
      source: "learned",
      lastUsedDate: "2026-10-05",
    });
    await ctx.db.insert("users", { clerkId: "user_a", email: "a@example.com", name: "A" });
    await ctx.db.insert("user_profiles", { userId: "user_a", activityLevel: "moderate" });
    await ctx.db.insert("food_cache", {
      name: "Rice",
      caloriesPer100g: 130,
      proteinPer100g: 2.7,
      carbsPer100g: 28,
      fatPer100g: 0.3,
      source: "usda",
    });
    return await ctx.db.insert("foods", {
      name: "Rice",
      aliases: [],
      searchText: "Rice",
      per100g: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 },
      source: "fdc",
      sourceId: "1",
      verified: true,
    });
  });
  await user.mutation(api.entries.addEntries, { submissionId: "s1", items: [{ foodId, grams: 100, source: "db" }] });
  await user.mutation(api.weights.logWeight, { kg: 72, localDate: "2026-10-05" });

  await t.mutation(internal.wipe_legacy.wipeLegacyLedger, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const left = await t.run(async (ctx) => {
    const legacy: Record<string, number> = {};
    for (const table of LEGACY_LEDGER_TABLES) legacy[table] = (await ctx.db.query(table).take(1)).length;
    return {
      legacy,
      users: (await ctx.db.query("users").take(5)).length,
      user_profiles: (await ctx.db.query("user_profiles").take(5)).length,
      user_settings: (await ctx.db.query("user_settings").take(5)).length,
      food_cache: (await ctx.db.query("food_cache").take(5)).length,
      foods: (await ctx.db.query("foods").take(5)).length,
      entries: (await ctx.db.query("entries").take(5)).length,
      day_totals: (await ctx.db.query("day_totals").take(5)).length,
      weights: (await ctx.db.query("weights").take(5)).length,
    };
  });
  expect(Object.values(left.legacy).every((n) => n === 0)).toBe(true);
  expect(left).toMatchObject({
    users: 1,
    user_profiles: 1,
    user_settings: 1,
    food_cache: 1,
    foods: 1,
    entries: 1,
    day_totals: 1,
    weights: 1,
  });
});

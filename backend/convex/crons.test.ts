import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { windowForHour } from "./nudges";

const modules = import.meta.glob("./**/*.*s");
const today = new Date().toISOString().slice(0, 10);

describe("windowForHour", () => {
  test("maps hours to windows", () => {
    expect(windowForHour(8)).toBe("morning");
    expect(windowForHour(13)).toBe("day");
    expect(windowForHour(19)).toBe("evening");
    expect(windowForHour(23)).toBe("night");
  });
});

test("dispatchWindowNudges creates for active users, dedupes, skips fatigued", async () => {
  const t = convexTest(schema, modules);
  const u1 = t.withIdentity({ subject: "u1" });
  const u2 = t.withIdentity({ subject: "u2" });

  // Make both users "active" by logging a meal today.
  await u1.mutation(api.meals.addMeal, { name: "Eggs", calories: 200, protein: 20, carbs: 1, fat: 12, time: "08:00", date: today });
  await u2.mutation(api.meals.addMeal, { name: "Eggs", calories: 200, protein: 20, carbs: 1, fat: 12, time: "08:00", date: today });
  // u2 is fatigued of the morning window.
  await u2.mutation(api.behavior.recordBehavior, { kind: "nudge_dismiss", key: "morning" });

  const res = await t.mutation(internal.nudges.dispatchWindowNudges, { hour: 8, date: today });
  expect(res.window).toBe("morning");
  expect(res.created).toBe(1); // u1 only; u2 fatigued

  // Re-run dedupes (no new nudges).
  const res2 = await t.mutation(internal.nudges.dispatchWindowNudges, { hour: 8, date: today });
  expect(res2.created).toBe(0);

  const u1Nudges = await u1.query(api.nudges.getActiveNudges, {});
  expect(u1Nudges).toHaveLength(1);
  expect(u1Nudges[0].type).toBe("window_morning");
  const u2Nudges = await u2.query(api.nudges.getActiveNudges, {});
  expect(u2Nudges).toHaveLength(0);
});

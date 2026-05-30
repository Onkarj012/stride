import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("profile round-trip includes richer inputs", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  await asUser.mutation(api.profile.upsertProfile, {
    dislikedFoods: "mushrooms, olives",
    cuisines: "indian, thai",
    equipment: "dumbbells, bands",
    scheduleNote: "trains at 6am",
    occupationType: "desk",
    weeklyWorkouts: JSON.stringify([{ type: "strength", durationMin: 60, sessionsPerWeek: 4 }]),
  });
  const p = await asUser.query(api.profile.getProfile, {});
  expect(p?.dislikedFoods).toBe("mushrooms, olives");
  expect(p?.cuisines).toBe("indian, thai");
  expect(p?.equipment).toBe("dumbbells, bands");
  expect(p?.occupationType).toBe("desk");
  expect(JSON.parse(p!.weeklyWorkouts!)[0].sessionsPerWeek).toBe(4);
});

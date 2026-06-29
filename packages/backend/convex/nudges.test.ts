import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("nudge create → list → dismiss, dedupe + behavior", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });

  await t.mutation(internal.nudges.createNudge, {
    userId: "user1",
    type: "hydration",
    title: "Drink water",
    body: "You're behind on hydration.",
    window: "day",
    deepLink: "/?log=water",
    date: "2026-05-29",
  });
  // Duplicate (same type/window/date) should be skipped.
  await t.mutation(internal.nudges.createNudge, {
    userId: "user1",
    type: "hydration",
    title: "Drink water again",
    body: "dupe",
    window: "day",
    date: "2026-05-29",
  });

  let active = await asUser.query(api.nudges.getActiveNudges, {});
  expect(active).toHaveLength(1);
  expect(active[0].title).toBe("Drink water");

  await asUser.mutation(api.nudges.dismissNudge, { id: active[0]._id });
  active = await asUser.query(api.nudges.getActiveNudges, {});
  expect(active).toHaveLength(0);

  const profile = await asUser.query(api.behavior.getBehaviorProfile, {});
  expect(profile.dismissedNudges).toContain("day");
});

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("settings round-trip persists UI prefs", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  await asUser.mutation(api.profile.upsertSettings, {
    coachingStyle: "motivating",
    units: "imperial",
    notifications: false,
    reduceMotion: true,
  });
  const s = await asUser.query(api.profile.getSettings, {});
  expect(s.coachingStyle).toBe("motivating");
  expect(s.units).toBe("imperial");
  expect(s.notifications).toBe(false);
  expect(s.reduceMotion).toBe(true);
});

test("settings defaults when none stored", async () => {
  const t = convexTest(schema, modules);
  const s = await t.withIdentity({ subject: "u2" }).query(api.profile.getSettings, {});
  expect(s.units).toBe("metric");
  expect(s.coachingStyle).toBe("gentle");
  expect(s.notifications).toBe(true);
});

test("settings rejects invalid enum values", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "u3" });
  await expect(
    asUser.mutation(api.profile.upsertSettings, { units: "lightyears" }),
  ).rejects.toThrow(/Invalid units/);
  await expect(
    asUser.mutation(api.profile.upsertSettings, { coachingStyle: "snarky" }),
  ).rejects.toThrow(/Invalid coachingStyle/);
});

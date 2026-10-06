import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => {
  vi.useRealTimers();
});

/** A test backend with one signed-in user in IST. */
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  return { t, user };
}

test("logWeight upserts one row per local date", async () => {
  const { t, user } = await setup();
  const first = await user.mutation(api.weights.logWeight, { kg: 72.4, localDate: "2026-10-05" });
  const second = await user.mutation(api.weights.logWeight, { kg: 72.1, localDate: "2026-10-05" });
  await user.mutation(api.weights.logWeight, { kg: 71.9, localDate: "2026-10-06" });
  expect(second).toBe(first);
  const rows = await t.run((ctx) => ctx.db.query("weights").take(10));
  expect(rows.map((r) => [r.localDate, r.kg])).toEqual([
    ["2026-10-05", 72.1],
    ["2026-10-06", 71.9],
  ]);
});

test("logWeight without a date uses today in the user's zone", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 5, 19, 0)); // 00:30 IST on 2026-10-06
  const { user } = await setup();
  await user.mutation(api.weights.logWeight, { kg: 70 });
  const rows = await user.query(api.weights.weightsInRange, { from: "2026-10-05", to: "2026-10-06" });
  expect(rows).toEqual([{ localDate: "2026-10-06", kg: 70 }]);
});

test("weightsInRange is inclusive, ordered, per user and bounded", async () => {
  const { t, user } = await setup();
  for (const [localDate, kg] of [
    ["2026-10-03", 73],
    ["2026-10-01", 74],
    ["2026-10-02", 73.5],
    ["2026-10-07", 72],
  ] as const) {
    await user.mutation(api.weights.logWeight, { kg, localDate });
  }
  const other = t.withIdentity({ subject: "user_b" });
  await other.mutation(api.time_zone.setTimeZone, { timeZone: "UTC" });
  await other.mutation(api.weights.logWeight, { kg: 90, localDate: "2026-10-02" });

  expect(await user.query(api.weights.weightsInRange, { from: "2026-10-01", to: "2026-10-03" })).toEqual([
    { localDate: "2026-10-01", kg: 74 },
    { localDate: "2026-10-02", kg: 73.5 },
    { localDate: "2026-10-03", kg: 73 },
  ]);
  await expect(user.query(api.weights.weightsInRange, { from: "2026-10-03", to: "2026-10-01" })).rejects.toThrow(
    /Range/,
  );
  await expect(user.query(api.weights.weightsInRange, { from: "2025-01-01", to: "2026-10-01" })).rejects.toThrow(
    /Range/,
  );
});

test("logWeight rejects implausible weights and bad dates", async () => {
  const { user } = await setup();
  await expect(user.mutation(api.weights.logWeight, { kg: 7, localDate: "2026-10-05" })).rejects.toThrow(/kg/);
  await expect(user.mutation(api.weights.logWeight, { kg: 70, localDate: "2026-13-01" })).rejects.toThrow(/YYYY-MM-DD/);
});

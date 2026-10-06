import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { deriveBehaviorProfile } from "./behavior";

const modules = import.meta.glob("./**/*.*s");

describe("deriveBehaviorProfile (pure)", () => {
  test("empty history → safe defaults", () => {
    const p = deriveBehaviorProfile([]);
    expect(p.engagedWindows).toEqual([]);
    expect(p.sampleSize).toBe(0);
  });

  test("derives engaged windows", () => {
    const now = Date.now();
    const rows = [
      { kind: "engagement", key: "evening", date: "", ts: now },
      { kind: "engagement", key: "evening", date: "", ts: now },
      { kind: "engagement", key: "morning", date: "", ts: now },
    ];
    const p = deriveBehaviorProfile(rows, now);
    expect(p.engagedWindows[0]).toBe("evening");
  });

  test("ignores rows older than 30 days", () => {
    const now = Date.now();
    const old = now - 40 * 86_400_000;
    const p = deriveBehaviorProfile([{ kind: "engagement", key: "evening", date: "", ts: old }], now);
    expect(p.engagedWindows).toEqual([]);
  });
});

test("recordBehavior persists and getBehaviorProfile aggregates", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1" });
  await asUser.mutation(api.behavior.recordBehavior, { kind: "suggestion", key: "Log lunch" });
  await asUser.mutation(api.behavior.recordBehavior, { kind: "suggestion", key: "Log lunch" });
  await asUser.mutation(api.behavior.recordBehavior, { kind: "engagement", key: "evening" });
  const p = await asUser.query(api.behavior.getBehaviorProfile, {});
  expect(p.topSuggestions[0]).toBe("Log lunch");
  expect(p.engagedWindows).toEqual(["evening"]);
  expect(p.sampleSize).toBe(3);
});

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import {
  AI_DAILY_BUDGET_USD,
  AI_GLOBAL_MONTHLY_BUDGET_USD,
  AI_INPUT_LIMITS,
  AI_MONTHLY_BUDGET_USD,
  AI_RATE_LIMIT_REQUESTS,
  assertAudioBase64,
  assertHistoryEntries,
  assertImageDataUrl,
  assertIngredients,
  assertMaxChars,
} from "./ai_guard";

const modules = import.meta.glob("./**/*.*s");
const NOW = Date.UTC(2026, 6, 18, 12);

function reserveArgs(userId = "user-1", estimatedCostUsd = 0.001) {
  return {
    userId,
    model: "openai/gpt-4o-mini",
    estimatedInputTokens: 10,
    estimatedOutputTokens: 10,
    estimatedCostUsd,
    now: NOW,
  };
}

describe("AI spend guard", () => {
  test("trips the per-user sliding-window rate limit", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < AI_RATE_LIMIT_REQUESTS; i++) {
      await t.mutation(internal.ai_guard.checkAndReserve, reserveArgs());
    }
    await expect(
      t.mutation(internal.ai_guard.checkAndReserve, reserveArgs()),
    ).rejects.toThrow("RATE_LIMITED:");
  });

  test("encodes daily, monthly, and global budget scope in the error message", async () => {
    const daily = convexTest(schema, modules);
    await daily.mutation(internal.ai_guard.checkAndReserve, reserveArgs("daily-user", AI_DAILY_BUDGET_USD));
    await expect(
      daily.mutation(internal.ai_guard.checkAndReserve, reserveArgs("daily-user")),
    ).rejects.toThrow("BUDGET_EXCEEDED:daily");

    const monthly = convexTest(schema, modules);
    await monthly.run(async (ctx) => {
      await ctx.db.insert("ai_usage_buckets", {
        scope: "user",
        ownerKey: "monthly-user",
        bucketKey: "2026-07-01",
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: AI_MONTHLY_BUDGET_USD,
        reservedCostUsd: 0,
        rateLimitTimestamps: [],
      });
    });
    await expect(
      monthly.mutation(internal.ai_guard.checkAndReserve, reserveArgs("monthly-user")),
    ).rejects.toThrow("BUDGET_EXCEEDED:monthly");

    const global = convexTest(schema, modules);
    await global.run(async (ctx) => {
      await ctx.db.insert("ai_usage_buckets", {
        scope: "global",
        ownerKey: "global",
        bucketKey: "2026-07-18",
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: AI_GLOBAL_MONTHLY_BUDGET_USD,
        reservedCostUsd: 0,
        rateLimitTimestamps: [],
      });
    });
    await expect(
      global.mutation(internal.ai_guard.checkAndReserve, reserveArgs("global-user")),
    ).rejects.toThrow("BUDGET_EXCEEDED:global");
  });

  test("settles and releases reservations idempotently by reservation id", async () => {
    const t = convexTest(schema, modules);
    const settledReservation = await t.mutation(
      internal.ai_guard.checkAndReserve,
      reserveArgs("usage-user", 0.01),
    );
    const settlement = {
      reservationId: settledReservation.reservationId,
      inputTokens: 123,
      outputTokens: 45,
      actualCostUsd: 0.002,
    };
    await t.mutation(internal.ai_guard.settleUsage, settlement);
    await t.mutation(internal.ai_guard.settleUsage, settlement);

    const releasedReservation = await t.mutation(
      internal.ai_guard.checkAndReserve,
      reserveArgs("usage-user", 0.01),
    );
    const release = { reservationId: releasedReservation.reservationId };
    await t.mutation(internal.ai_guard.releaseReservation, release);
    await t.mutation(internal.ai_guard.releaseReservation, release);

    const row = await t.run((ctx) => ctx.db
      .query("ai_usage_buckets")
      .withIndex("by_scope_owner_bucket", (q) => q.eq("scope", "user").eq("ownerKey", "usage-user").eq("bucketKey", "2026-07-18"))
      .unique());
    expect(row).toMatchObject({ inputTokens: 123, outputTokens: 45, costUsd: 0.002, reservedCostUsd: 0, requestCount: 2 });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(settledReservation.reservationId)).toMatchObject({ state: "settled" });
      expect(await ctx.db.get(releasedReservation.reservationId)).toMatchObject({ state: "released" });
    });
  });

  test("rejects oversized AI inputs at the shared boundary", () => {
    expect(() => assertMaxChars("x".repeat(AI_INPUT_LIMITS.textChars + 1), AI_INPUT_LIMITS.textChars, "message"))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertHistoryEntries([{ content: "x".repeat(AI_INPUT_LIMITS.historyEntryChars + 1) }]))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertHistoryEntries(Array.from({ length: AI_INPUT_LIMITS.historyEntries + 1 }, () => ({ content: "ok" }))))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertHistoryEntries(Array.from({ length: 9 }, () => ({ content: "x".repeat(4_000) }))))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertIngredients(Array.from({ length: AI_INPUT_LIMITS.ingredients + 1 }, () => "food")))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertIngredients([{ name: "x".repeat(AI_INPUT_LIMITS.ingredientStringChars + 1) }]))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertImageDataUrl(`data:image/png;base64,${"A".repeat(AI_INPUT_LIMITS.imageBytes * 2)}`))
      .toThrow("INPUT_TOO_LARGE:");
    expect(() => assertAudioBase64("A".repeat(AI_INPUT_LIMITS.audioBytes * 2)))
      .toThrow("INPUT_TOO_LARGE:");
  });
});

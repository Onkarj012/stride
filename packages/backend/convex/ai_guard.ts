import { internalMutation, type MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

// Public-beta ceilings. Keep all AI spend and payload limits in this module.
export const AI_RATE_LIMIT_REQUESTS = 20;
export const AI_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const AI_DAILY_BUDGET_USD = 0.25;
export const AI_MONTHLY_BUDGET_USD = 3;
export const AI_GLOBAL_MONTHLY_BUDGET_USD = 50;
// Groq bills Whisper Large v3 Turbo at $0.04/hour (verified 2026-07-18).
export const GROQ_WHISPER_USD_PER_MINUTE = 0.04 / 60;
export const GROQ_MIN_BILLABLE_SECONDS = 10;
// 8 kbps is a deliberately low speech-audio bitrate, so bytes overestimate duration.
export const AI_TRANSCRIPTION_CONSERVATIVE_BITRATE_BPS = 8_000;

export const AI_INPUT_LIMITS = {
  messageChars: 4_000,
  historyEntryChars: 4_000,
  textChars: 2_000,
  imageBytes: 5 * 1024 * 1024,
  audioBytes: 10 * 1024 * 1024,
  ingredients: 50,
} as const;

// OpenRouter list prices in USD per million tokens (verified 2026-07-18).
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
  "anthropic/claude-sonnet-4.6": { input: 3, output: 15 },
};

type UsageLike = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AIBucketScope = "user" | "global";

export function pricingForModel(model: string): { input: number; output: number } {
  const pricing = MODEL_PRICING[model];
  if (!pricing) throw new Error(`MODEL_PRICING_UNAVAILABLE:${model}`);
  return pricing;
}

export function hasDeploymentPricing(model: string): boolean {
  return MODEL_PRICING[model] !== undefined;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingForModel(model);
  return (
    Math.max(0, inputTokens) * pricing.input +
    Math.max(0, outputTokens) * pricing.output
  ) / 1_000_000;
}

export function estimateTranscriptionCostUsd(decodedAudioBytes: number): number {
  const estimatedSeconds = Math.max(
    GROQ_MIN_BILLABLE_SECONDS,
    Math.ceil(Math.max(0, decodedAudioBytes) * 8 / AI_TRANSCRIPTION_CONSERVATIVE_BITRATE_BPS),
  );
  return estimatedSeconds / 60 * GROQ_WHISPER_USD_PER_MINUTE;
}

export function usageFromResponse(
  usage: UsageLike | undefined,
  fallbackInputTokens: number,
  fallbackOutputTokens: number,
): TokenUsage {
  const inputTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? fallbackInputTokens;
  const outputTokens = usage?.completion_tokens ?? usage?.output_tokens ?? fallbackOutputTokens;
  return {
    inputTokens: Math.max(0, Math.round(inputTokens)),
    outputTokens: Math.max(0, Math.round(outputTokens)),
    totalTokens: Math.max(0, Math.round(usage?.total_tokens ?? inputTokens + outputTokens)),
  };
}

export function estimateMessageTokens(messages: Array<{ content: unknown }>): number {
  let chars = 0;
  for (const message of messages) {
    const serialized = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);
    chars += serialized?.length ?? 0;
  }
  // Three characters per token is deliberately conservative for unknown and
  // multilingual input when OpenRouter does not return usage metadata.
  return Math.max(1, Math.ceil(chars / 3));
}

export function inputTooLarge(field: string, limit: number): never {
  throw new ConvexError({
    code: "INPUT_TOO_LARGE",
    message: `INPUT_TOO_LARGE: ${field} exceeds ${limit} characters or bytes`,
    field,
    limit,
  });
}

export function assertMaxChars(value: string, limit: number, field: string): void {
  if (value.length > limit) inputTooLarge(field, limit);
}

export function assertHistoryEntries(
  history: Array<{ content: string }>,
  limit = AI_INPUT_LIMITS.historyEntryChars,
): void {
  for (const entry of history) {
    if (entry.content.length > limit) inputTooLarge("history entry", limit);
  }
}

export function assertIngredients(value: unknown, field = "ingredients"): void {
  if (Array.isArray(value) && value.length > AI_INPUT_LIMITS.ingredients) {
    inputTooLarge(field, AI_INPUT_LIMITS.ingredients);
  }
}

function decodedBase64Bytes(value: string): number {
  const payload = (value.includes(",") ? value.slice(value.indexOf(",") + 1) : value)
    .replace(/\s/g, "");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

export function assertImageDataUrl(value: string, field = "image"): void {
  if (
    decodedBase64Bytes(value) > AI_INPUT_LIMITS.imageBytes ||
    value.length > AI_INPUT_LIMITS.imageBytes * 2
  ) {
    inputTooLarge(field, AI_INPUT_LIMITS.imageBytes);
  }
}

export function assertAudioBase64(value: string, field = "audio"): void {
  if (
    decodedBase64Bytes(value) > AI_INPUT_LIMITS.audioBytes ||
    value.length > AI_INPUT_LIMITS.audioBytes * 2
  ) {
    inputTooLarge(field, AI_INPUT_LIMITS.audioBytes);
  }
}

function dateBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function monthStart(now: number): string {
  return `${new Date(now).toISOString().slice(0, 7)}-01`;
}

function nextMonthStart(now: number): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

function previousDateBucket(now: number): string {
  return new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getBucket(
  ctx: MutationCtx,
  scope: AIBucketScope,
  ownerKey: string,
  bucketKey: string,
) {
  return ctx.db
    .query("ai_usage_buckets")
    .withIndex("by_scope_owner_bucket", (q) =>
      q.eq("scope", scope).eq("ownerKey", ownerKey).eq("bucketKey", bucketKey),
    )
    .unique();
}

async function getMonthBuckets(
  ctx: MutationCtx,
  scope: AIBucketScope,
  ownerKey: string,
  now: number,
) {
  return ctx.db
    .query("ai_usage_buckets")
    .withIndex("by_scope_owner_bucket", (q) =>
      q.eq("scope", scope)
        .eq("ownerKey", ownerKey)
        .gte("bucketKey", monthStart(now))
        .lt("bucketKey", nextMonthStart(now)),
    )
    .take(32);
}

function sumUsage(rows: Array<{ costUsd: number; reservedCostUsd: number }>) {
  return rows.reduce(
    (sum, row) => ({
      costUsd: sum.costUsd + row.costUsd,
      reservedCostUsd: sum.reservedCostUsd + row.reservedCostUsd,
    }),
    { costUsd: 0, reservedCostUsd: 0 },
  );
}

function budgetError(scope: string, limit: number): never {
  throw new ConvexError({
    code: "BUDGET_EXCEEDED",
    scope,
    limit,
    message: `BUDGET_EXCEEDED:${scope}: AI budget of $${limit.toFixed(2)} has been reached`,
  });
}

function rateLimitError(resetAt: number): never {
  throw new ConvexError({
    code: "RATE_LIMITED",
    resetAt,
    message: `RATE_LIMITED: ${AI_RATE_LIMIT_REQUESTS} AI requests per ${AI_RATE_LIMIT_WINDOW_MS / 60_000} minutes`,
  });
}

type UsagePatch = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  reservedCostUsd: number;
  rateLimitTimestamps: number[];
};

function reservationPatch(row: Awaited<ReturnType<typeof getBucket>>, reservedCostUsd: number, timestamps: number[]): UsagePatch {
  return {
    requestCount: (row?.requestCount ?? 0) + 1,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    costUsd: row?.costUsd ?? 0,
    reservedCostUsd: (row?.reservedCostUsd ?? 0) + reservedCostUsd,
    rateLimitTimestamps: timestamps,
  };
}

async function upsertReservation(
  ctx: MutationCtx,
  scope: AIBucketScope,
  ownerKey: string,
  bucketKey: string,
  row: Awaited<ReturnType<typeof getBucket>>,
  patch: UsagePatch,
) {
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("ai_usage_buckets", { scope, ownerKey, bucketKey, ...patch });
}

export const checkAndReserve = internalMutation({
  args: {
    // Convex recommends tokenIdentifier, but Stride ownership is keyed by identity.subject, so guard buckets stay aligned.
    userId: v.string(),
    model: v.string(),
    estimatedInputTokens: v.number(),
    estimatedOutputTokens: v.number(),
    estimatedCostUsd: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const day = dateBucket(now);
    const yesterday = previousDateBucket(now);
    const estimatedCostUsd = Math.max(0, args.estimatedCostUsd);
    const [userDay, userYesterday, userMonth, globalDay, globalMonth] = await Promise.all([
      getBucket(ctx, "user", args.userId, day),
      getBucket(ctx, "user", args.userId, yesterday),
      getMonthBuckets(ctx, "user", args.userId, now),
      getBucket(ctx, "global", "global", day),
      getMonthBuckets(ctx, "global", "global", now),
    ]);

    const rateCutoff = now - AI_RATE_LIMIT_WINDOW_MS;
    const recentRequests = [
      ...(userYesterday?.rateLimitTimestamps ?? []),
      ...(userDay?.rateLimitTimestamps ?? []),
    ].filter((timestamp) => timestamp > rateCutoff).sort((a, b) => a - b);
    if (recentRequests.length >= AI_RATE_LIMIT_REQUESTS) {
      rateLimitError(recentRequests[0]! + AI_RATE_LIMIT_WINDOW_MS);
    }

    const dailySpend = (userDay?.costUsd ?? 0) + (userDay?.reservedCostUsd ?? 0);
    if (dailySpend + estimatedCostUsd > AI_DAILY_BUDGET_USD) {
      budgetError("daily", AI_DAILY_BUDGET_USD);
    }

    const userMonthlySpend = sumUsage(userMonth);
    if (userMonthlySpend.costUsd + userMonthlySpend.reservedCostUsd + estimatedCostUsd > AI_MONTHLY_BUDGET_USD) {
      budgetError("monthly", AI_MONTHLY_BUDGET_USD);
    }

    const globalMonthlySpend = sumUsage(globalMonth);
    if (globalMonthlySpend.costUsd + globalMonthlySpend.reservedCostUsd + estimatedCostUsd > AI_GLOBAL_MONTHLY_BUDGET_USD) {
      budgetError("global", AI_GLOBAL_MONTHLY_BUDGET_USD);
    }

    const timestamps = [...(userDay?.rateLimitTimestamps ?? []), now]
      .filter((timestamp) => timestamp > rateCutoff)
      .sort((a, b) => a - b);
    await upsertReservation(
      ctx,
      "user",
      args.userId,
      day,
      userDay,
      reservationPatch(userDay, estimatedCostUsd, timestamps),
    );
    await upsertReservation(
      ctx,
      "global",
      "global",
      day,
      globalDay,
      reservationPatch(globalDay, estimatedCostUsd, globalDay?.rateLimitTimestamps ?? []),
    );

    const reservationId = await ctx.db.insert("ai_usage_reservations", {
      ownerKey: args.userId,
      bucketKey: day,
      model: args.model,
      reservedCostUsd: estimatedCostUsd,
      state: "reserved",
      createdAt: now,
    });

    return {
      reservationId,
      reservedCostUsd: estimatedCostUsd,
      bucketKey: day,
      inputTokens: Math.max(0, Math.round(args.estimatedInputTokens)),
      outputTokens: Math.max(0, Math.round(args.estimatedOutputTokens)),
      model: args.model,
    };
  },
});

async function rowsForReservation(ctx: MutationCtx, userId: string, bucketKey: string) {
  return [
    await getBucket(ctx, "user", userId, bucketKey),
    await getBucket(ctx, "global", "global", bucketKey),
  ];
}

export const settleUsage = internalMutation({
  args: {
    reservationId: v.id("ai_usage_reservations"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    actualCostUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.state !== "reserved") return;

    const inputTokens = Math.max(0, Math.round(args.inputTokens));
    const outputTokens = Math.max(0, Math.round(args.outputTokens));
    const actualCostUsd = Math.max(0, args.actualCostUsd);
    const rows = await rowsForReservation(ctx, reservation.ownerKey, reservation.bucketKey);
    for (const row of rows) {
      if (!row) continue;
      await ctx.db.patch(row._id, {
        inputTokens: row.inputTokens + inputTokens,
        outputTokens: row.outputTokens + outputTokens,
        costUsd: row.costUsd + actualCostUsd,
        reservedCostUsd: Math.max(0, row.reservedCostUsd - reservation.reservedCostUsd),
      });
    }
    await ctx.db.patch(reservation._id, {
      state: "settled",
      settledInputTokens: inputTokens,
      settledOutputTokens: outputTokens,
      settledCostUsd: actualCostUsd,
    });
  },
});

export const releaseReservation = internalMutation({
  args: {
    reservationId: v.id("ai_usage_reservations"),
  },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.state !== "reserved") return;

    const rows = await rowsForReservation(ctx, reservation.ownerKey, reservation.bucketKey);
    for (const row of rows) {
      if (row) {
        await ctx.db.patch(row._id, {
          reservedCostUsd: Math.max(0, row.reservedCostUsd - reservation.reservedCostUsd),
        });
      }
    }
    await ctx.db.patch(reservation._id, { state: "released" });
  },
});

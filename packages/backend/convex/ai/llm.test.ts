import { afterEach, beforeEach, describe, test, expect, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";
import { callAI, parseJSON, VISION_MODELS, DEFAULT_MODEL, CHAT_MODEL, FALLBACK_MODEL } from "./llm";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-deployment-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseJSON", () => {
  test("parses a clean JSON object", () => {
    expect(parseJSON('{"a":1,"b":2}', {})).toEqual({ a: 1, b: 2 });
  });

  test("extracts a JSON object embedded in prose", () => {
    expect(parseJSON('Sure! Here it is: {"kcal":300} hope that helps', {})).toEqual({ kcal: 300 });
  });

  test("extracts a JSON array embedded in prose", () => {
    expect(parseJSON('result: [1,2,3]', [])).toEqual([1, 2, 3]);
  });

  test("returns fallback on unparseable text", () => {
    expect(parseJSON("not json at all", { ok: false })).toEqual({ ok: false });
  });

  test("prefers object match over array when both present", () => {
    // object regex is tried first
    expect(parseJSON('{"x":1} and [2,3]', null)).toEqual({ x: 1 });
  });
});

describe("model config", () => {
  test("default model is a vision-capable model", () => {
    expect(VISION_MODELS.has(DEFAULT_MODEL)).toBe(true);
  });

  test("split-model strategy: parse and chat models are distinct", () => {
    // Cheap parsing model must differ from the upgraded chat model.
    expect(DEFAULT_MODEL).not.toBe(CHAT_MODEL);
    expect(CHAT_MODEL).toBeTruthy();
    expect(FALLBACK_MODEL).toBeTruthy();
  });

  test("chat + fallback models are vision-capable (handle image chats)", () => {
    expect(VISION_MODELS.has(CHAT_MODEL)).toBe(true);
    expect(VISION_MODELS.has(FALLBACK_MODEL)).toBe(true);
  });

  test("falls back to the default model for a saved model without deployment pricing", async () => {
    const mutationArgs: unknown[] = [];
    const ctx = {
      runMutation: async (_reference: unknown, args: unknown) => {
        mutationArgs.push(args);
        if (mutationArgs.length === 1) {
          return { reservationId: "reservation-1", reservedCostUsd: 0, bucketKey: "2026-07-18" };
        }
        return undefined;
      },
    } as unknown as ActionCtx;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      "unpriced/provider-model",
    )).resolves.toBe("done");
    expect(mutationArgs[0]).toMatchObject({ model: DEFAULT_MODEL });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(DEFAULT_MODEL);
  });

  test("retains the reservation when settlement fails after a provider response", async () => {
    const mutationArgs: unknown[] = [];
    const ctx = {
      runMutation: async (_reference: unknown, args: unknown) => {
        mutationArgs.push(args);
        if (mutationArgs.length === 1) {
          return { reservationId: "reservation-1", reservedCostUsd: 0, bucketKey: "2026-07-18" };
        }
        throw new Error("settlement unavailable");
      },
    } as unknown as ActionCtx;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
    )).rejects.toThrow("settlement unavailable");
    expect(mutationArgs).toHaveLength(2);
    expect(mutationArgs[1]).toMatchObject({ reservationId: "reservation-1" });
  });

  test("releases a reservation for a definitive provider error", async () => {
    const mutationArgs: unknown[] = [];
    const ctx = {
      runMutation: async (_reference: unknown, args: unknown) => {
        mutationArgs.push(args);
        if (mutationArgs.length === 1) {
          return { reservationId: "reservation-1", reservedCostUsd: 0, bucketKey: "2026-07-18" };
        }
        return undefined;
      },
    } as unknown as ActionCtx;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
    )).rejects.toThrow("OpenRouter error 400");
    expect(mutationArgs).toHaveLength(2);
    expect(mutationArgs[1]).toMatchObject({ reservationId: "reservation-1" });
  });

  test("rejects unusable finish reasons but accepts missing finish_reason with content", async () => {
    const mutationArgs: unknown[] = [];
    const ctx = {
      runMutation: async (_reference: unknown, args: unknown) => {
        mutationArgs.push(args);
        if (mutationArgs.length === 1) {
          return { reservationId: "reservation-1", reservedCostUsd: 0, bucketKey: "2026-07-18" };
        }
        return undefined;
      },
    } as unknown as ActionCtx;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "partial response" }, finish_reason: "length" }],
        usage: { prompt_tokens: 3, completion_tokens: 10, total_tokens: 13 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "complete response" }, finish_reason: null }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "also complete" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
    )).rejects.toThrow("OpenRouter incomplete response (finish_reason: length); retry the request");
    expect(mutationArgs).toHaveLength(2);
    // Truncated replies are billed, so their usage settles against the budget instead of being released.
    expect(mutationArgs[1]).toMatchObject({ reservationId: "reservation-1", inputTokens: 3, outputTokens: 10 });

    mutationArgs.length = 0;
    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
    )).resolves.toBe("complete response");
    expect(mutationArgs).toHaveLength(2);

    mutationArgs.length = 0;
    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
    )).resolves.toBe("also complete");
    expect(mutationArgs).toHaveLength(2);
  });

  test("releases a retryable failed attempt before reserving the next attempt", async () => {
    const mutationArgs: unknown[] = [];
    let reserveCount = 0;
    const ctx = {
      runMutation: async (_reference: unknown, args: any) => {
        mutationArgs.push(args);
        if (args?.estimatedCostUsd != null) {
          reserveCount += 1;
          const reservationId = `reservation-${reserveCount}`;
          return { reservationId, reservedCostUsd: 0, bucketKey: "2026-07-18" };
        }
        return undefined;
      },
    } as unknown as ActionCtx;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "done" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
    )).resolves.toBe("done");
    expect(mutationArgs[1]).toMatchObject({ reservationId: "reservation-1" });
    expect(mutationArgs[2]).toMatchObject({ estimatedCostUsd: expect.any(Number) });
  });
});

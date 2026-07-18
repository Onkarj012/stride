import { afterEach, describe, test, expect, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";
import { callAI, parseJSON, VISION_MODELS, DEFAULT_MODEL, CHAT_MODEL, FALLBACK_MODEL } from "./llm";

afterEach(() => {
  vi.unstubAllGlobals();
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

  test("rejects an unknown model before using the deployment key", async () => {
    let mutationCalled = false;
    const ctx = {
      runMutation: async () => {
        mutationCalled = true;
        throw new Error("unexpected mutation");
      },
    } as unknown as ActionCtx;

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      "unpriced/provider-model",
    )).rejects.toThrow("MODEL_NOT_ALLOWED_WITH_DEPLOYMENT_KEY:unpriced/provider-model");
    expect(mutationCalled).toBe(false);
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
      choices: [{ message: { content: "done" } }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(callAI(
      ctx,
      "user-1",
      [{ role: "user", content: "hello" }],
      10,
      DEFAULT_MODEL,
      "user-supplied-key",
    )).rejects.toThrow("settlement unavailable");
    expect(mutationArgs).toHaveLength(2);
    expect(mutationArgs[1]).toMatchObject({ reservationId: "reservation-1" });
  });
});

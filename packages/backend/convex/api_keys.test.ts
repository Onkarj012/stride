import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { AI_DAILY_BUDGET_USD } from "./ai_guard";
import { KEY_CHECK_TIMEOUT_MS } from "./api_keys";
import { OPENROUTER_CHAT_URL, PIPELINE_MODEL } from "./pipeline/openrouter";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const OPENROUTER_KEY_CHECK_URL = "https://openrouter.ai/api/v1/key";
// Obviously fake. Long enough to pass the key-shape check.
const FAKE_KEY = "sk-or-v1-test-000000000000000000";
const ENV_KEY = "env-key";

let calls: { url: string; auth: string | null }[];
let keyCheckStatus: number;
let keyCheckHold: Promise<void> | null;
let chatStatus: number;
let promptTokens: number;

/** A streamed reply with one text delta and the reported usage. */
function streamedReply(): Response {
  const events = [
    { choices: [{ delta: { content: "Hi!" } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: 30 } },
  ];
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Mocked OpenRouter key check and chat endpoint. Any other URL fails the test. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  calls.push({ url, auth: new Headers(init?.headers).get("Authorization") });
  if (url === OPENROUTER_KEY_CHECK_URL) {
    await keyCheckHold;
    return new Response("{}", { status: keyCheckStatus });
  }
  if (url !== OPENROUTER_CHAT_URL) throw new Error(`Unexpected fetch: ${url}`);
  if (chatStatus !== 200) return new Response("denied", { status: chatStatus });
  return streamedReply();
}

beforeEach(() => {
  calls = [];
  keyCheckStatus = 200;
  keyCheckHold = null;
  chatStatus = 200;
  promptTokens = 300;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubEnv("OPENROUTER_API_KEY", ENV_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Creates the profile row a real save needs. Saves only come from Settings, after onboarding. */
async function completeProfile(t: ReturnType<typeof convexTest>, userId: string): Promise<void> {
  await t.run((ctx) => ctx.db.insert("user_settings", { userId, timeZone: "Asia/Kolkata" }));
}

describe("own OpenRouter key settings", () => {
  test("saving a verified key reports only its last 4 characters", async () => {
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const user = t.withIdentity({ subject: "user_a" });
    expect(await user.action(api.api_keys.saveOpenRouterKey, { key: `  ${FAKE_KEY}  ` })).toEqual({ last4: "0000" });

    const status = await user.query(api.api_keys.openRouterKeyStatus, {});
    expect(status).toEqual({ set: true, last4: "0000" });
    expect(JSON.stringify(status)).not.toContain(FAKE_KEY);
    expect(calls).toEqual([{ url: OPENROUTER_KEY_CHECK_URL, auth: `Bearer ${FAKE_KEY}` }]);
  });

  test("a malformed key is refused before any check, and nothing is stored", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await expect(user.action(api.api_keys.saveOpenRouterKey, { key: "not-a-key" })).rejects.toMatchObject({
      data: { code: "KEY_FORMAT" },
    });
    expect(calls).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("a key OpenRouter rejects is not stored", async () => {
    keyCheckStatus = 401;
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const user = t.withIdentity({ subject: "user_a" });
    await expect(user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY })).rejects.toMatchObject({
      data: { code: "KEY_REJECTED" },
    });
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("an OpenRouter outage is reported as KEY_CHECK_FAILED and nothing is stored", async () => {
    keyCheckStatus = 503;
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const user = t.withIdentity({ subject: "user_a" });
    await expect(user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY })).rejects.toMatchObject({
      data: { code: "KEY_CHECK_FAILED" },
    });
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("a key check that never answers times out as KEY_CHECK_FAILED and stores nothing", async () => {
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const user = t.withIdentity({ subject: "user_a" });
    // Stands in for a hung connection: only the abort signal ends the request.
    const hungFetch = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.stubGlobal("fetch", hungFetch);
    vi.useFakeTimers();

    const save = user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    const outcome = expect(save).rejects.toMatchObject({ data: { code: "KEY_CHECK_FAILED" } });
    await vi.waitFor(() => expect(hungFetch).toHaveBeenCalled());
    vi.advanceTimersByTime(KEY_CHECK_TIMEOUT_MS);
    await outcome;
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("a save whose check is still pending when data is cleared stores no key", async () => {
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const user = t.withIdentity({ subject: "user_a" });
    let releaseCheck!: () => void;
    keyCheckHold = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });

    const save = user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    await vi.waitFor(() => expect(calls.some((call) => call.url === OPENROUTER_KEY_CHECK_URL)).toBe(true));

    // Another device clears the data while the OpenRouter check is still open.
    vi.useFakeTimers();
    await user.mutation(api.users.clearAllData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // Settings recreates the profile row under a new id before the check returns.
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });

    releaseCheck();
    await expect(save).rejects.toMatchObject({ data: { code: "KEY_SAVE_CANCELLED" } });
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("removing the key clears the status", async () => {
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const user = t.withIdentity({ subject: "user_a" });
    await user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    await user.mutation(api.api_keys.removeOpenRouterKey, {});
    expect(await user.query(api.api_keys.openRouterKeyStatus, {})).toEqual({ set: false, last4: null });
  });

  test("each user sees only their own key status", async () => {
    const t = convexTest(schema, modules);
    await completeProfile(t, "user_a");
    const userA = t.withIdentity({ subject: "user_a" });
    const userB = t.withIdentity({ subject: "user_b" });
    await userA.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    expect(await userB.query(api.api_keys.openRouterKeyStatus, {})).toEqual({ set: false, last4: null });
  });
});

describe("own OpenRouter key on chat turns", () => {
  test("an own-key turn skips the allowance and sends the user's key", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
    const chatId = await user.mutation(api.chats.createChat, {});

    // Use up today's allowance so a request on the deployment key is refused.
    await t.mutation(internal.ai_guard.checkAndReserve, {
      userId: "user_a",
      model: PIPELINE_MODEL,
      estimatedInputTokens: 1,
      estimatedOutputTokens: 1,
      estimatedCostUsd: AI_DAILY_BUDGET_USD,
      now: Date.now(),
    });
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hello" })).rejects.toThrow(
      "BUDGET_EXCEEDED:daily",
    );

    await user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    const sent = await user.action(api.chats.sendMessage, { chatId, submissionId: "m2", text: "hello again" });
    expect(sent.reply).toBe("Hi!");

    const chatAuths = calls.filter((call) => call.url === OPENROUTER_CHAT_URL).map((call) => call.auth);
    expect(chatAuths).toEqual([`Bearer ${FAKE_KEY}`]);
  });

  test("own-key spend counts toward no cap, so the deployment key still works after the key is removed", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
    const chatId = await user.mutation(api.chats.createChat, {});
    await user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });

    // 20M prompt tokens at the pipeline model's input price is about $4, far over the $0.25 daily cap.
    promptTokens = 20_000_000;
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "heavy turn" });

    const buckets = await t.run((ctx) => ctx.db.query("ai_usage_buckets").take(50));
    expect(buckets.map((b) => b.scope).sort()).toEqual(["global", "user"]);
    // Usage is still recorded, but no cost lands in any bucket.
    expect(buckets.every((b) => b.costUsd === 0 && b.reservedCostUsd === 0)).toBe(true);
    expect(buckets.every((b) => b.inputTokens > 0)).toBe(true);

    await user.mutation(api.api_keys.removeOpenRouterKey, {});
    promptTokens = 300;
    const sent = await user.action(api.chats.sendMessage, { chatId, submissionId: "m2", text: "after removing the key" });
    expect(sent.reply).toBe("Hi!");
    expect(calls.filter((call) => call.url === OPENROUTER_CHAT_URL).at(-1)?.auth).toBe(`Bearer ${ENV_KEY}`);
  });

  test("OpenRouter rejecting the user's key fails the turn with OWN_KEY_INVALID, without a retry", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
    const chatId = await user.mutation(api.chats.createChat, {});
    await user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });

    chatStatus = 401;
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hello" })).rejects.toMatchObject({
      data: { code: "OWN_KEY_INVALID" },
    });
    expect(calls.filter((call) => call.url === OPENROUTER_CHAT_URL)).toHaveLength(1);
  });

  test("the app's key out of credits (402) fails the turn with AI_UNAVAILABLE, without a retry", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
    const chatId = await user.mutation(api.chats.createChat, {});

    chatStatus = 402;
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hello" })).rejects.toMatchObject({
      data: { code: "AI_UNAVAILABLE" },
    });
    expect(calls.filter((call) => call.url === OPENROUTER_CHAT_URL)).toHaveLength(1);

    // The user's own key out of credits names their key, not the app's.
    await user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m2", text: "hello again" })).rejects.toMatchObject({
      data: { code: "OWN_KEY_NO_CREDITS" },
    });
  });
});

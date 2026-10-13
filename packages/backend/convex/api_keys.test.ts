import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { AI_DAILY_BUDGET_USD } from "./ai_guard";
import { OPENROUTER_CHAT_URL, PIPELINE_MODEL } from "./pipeline/openrouter";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const OPENROUTER_KEY_CHECK_URL = "https://openrouter.ai/api/v1/key";
// Obviously fake. Long enough to pass the key-shape check.
const FAKE_KEY = "sk-or-v1-test-000000000000000000";
const ENV_KEY = "env-key";

let calls: { url: string; auth: string | null }[];
let keyCheckStatus: number;
let chatStatus: number;

/** A streamed reply with one text delta and usage. */
function streamedReply(): Response {
  const events = [
    { choices: [{ delta: { content: "Hi!" } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 300, completion_tokens: 30 } },
  ];
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Mocked OpenRouter key check and chat endpoint. Any other URL fails the test. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  calls.push({ url, auth: new Headers(init?.headers).get("Authorization") });
  if (url === OPENROUTER_KEY_CHECK_URL) return new Response("{}", { status: keyCheckStatus });
  if (url !== OPENROUTER_CHAT_URL) throw new Error(`Unexpected fetch: ${url}`);
  if (chatStatus !== 200) return new Response("denied", { status: chatStatus });
  return streamedReply();
}

beforeEach(() => {
  calls = [];
  keyCheckStatus = 200;
  chatStatus = 200;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubEnv("OPENROUTER_API_KEY", ENV_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("own OpenRouter key settings", () => {
  test("saving a verified key reports only its last 4 characters", async () => {
    const t = convexTest(schema, modules);
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
    await expect(user.action(api.api_keys.saveOpenRouterKey, { key: "not-a-key" })).rejects.toThrow(
      "That doesn't look like an OpenRouter key.",
    );
    expect(calls).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("a key OpenRouter rejects is not stored", async () => {
    keyCheckStatus = 401;
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await expect(user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY })).rejects.toThrow(
      "OpenRouter rejected that key.",
    );
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([]);
  });

  test("removing the key clears the status", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "user_a" });
    await user.action(api.api_keys.saveOpenRouterKey, { key: FAKE_KEY });
    await user.mutation(api.api_keys.removeOpenRouterKey, {});
    expect(await user.query(api.api_keys.openRouterKeyStatus, {})).toEqual({ set: false, last4: null });
  });

  test("each user sees only their own key status", async () => {
    const t = convexTest(schema, modules);
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
});

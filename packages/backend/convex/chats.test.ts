import type { Nutrients } from "@stride/core";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { MAX_CHAT_ITERATIONS, STREAM_FLUSH_CHARS } from "./chats";
import { isRecord, OPENROUTER_CHAT_URL, PHOTO_MODEL } from "./pipeline/openrouter";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const CHAPATI: Nutrients = { kcal: 297, protein: 11.25, carbs: 46.36, fat: 7.45, fiber: 4.9, sugar: 2.72, sodiumMg: 409 };
const DAL: Nutrients = { kcal: 116.3, protein: 9.02, carbs: 20.13, fat: 0.38, fiber: 7.9, sugar: 1.8, sodiumMg: 2 };

/** One mocked model reply. A streamed reply sends `chunks` (or `content` whole) as separate text deltas. */
interface LlmReply {
  content?: string | null;
  chunks?: string[];
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  noUsage?: boolean;
  /** Runs before the stream sends event `index`, while the turn is mid-stream. */
  beforeEvent?: (index: number) => Promise<void>;
  /** The stream breaks instead of sending event `failAt`. */
  failAt?: number;
}
type RequestBody = Record<string, unknown>;

let llm: (body: RequestBody, n: number) => LlmReply;
let bodies: RequestBody[];
let groqCalls: number;

/** A JSON response. */
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

/** Mocked OpenRouter and Groq. Any other URL fails the test. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.groq.com/")) {
    groqCalls++;
    return json({ text: "two rotis" });
  }
  if (url !== OPENROUTER_CHAT_URL) throw new Error(`Unexpected fetch: ${url}`);
  const body: unknown = JSON.parse(String(init?.body));
  if (!isRecord(body)) throw new Error("bad body");
  bodies.push(body);
  const reply = llm(body, bodies.length);
  const toolCalls = (reply.toolCalls ?? []).map((call, i) => ({
    id: `call_${bodies.length}_${i}`,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.args) },
  }));
  const usage = reply.noUsage === true ? {} : { usage: { prompt_tokens: 300, completion_tokens: 30 } };
  if (body.stream === true) return sse(reply, toolCalls, usage);
  return json({ choices: [{ message: { content: reply.content ?? null, tool_calls: toolCalls }, finish_reason: "stop" }], ...usage });
}

/** An OpenRouter SSE stream: text deltas, then each tool call split across two events, then finish and usage. */
function sse(
  reply: LlmReply,
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
  usage: Record<string, unknown>,
): Response {
  const pieces = reply.chunks ?? (typeof reply.content === "string" ? [reply.content] : []);
  const events: unknown[] = [
    ...pieces.map((text) => ({ choices: [{ delta: { content: text } }] })),
    ...toolCalls.flatMap((call, index) => {
      const half = Math.floor(call.function.arguments.length / 2);
      return [
        { choices: [{ delta: { tool_calls: [{ index, id: call.id, type: "function", function: { name: call.function.name, arguments: call.function.arguments.slice(0, half) } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index, function: { arguments: call.function.arguments.slice(half) } }] } }] },
      ];
    }),
    { choices: [{ delta: {}, finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop" }] },
    ...(Object.keys(usage).length === 0 ? [] : [{ choices: [], ...usage }]),
  ];
  const encoder = new TextEncoder();
  let next = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
    },
    async pull(controller) {
      if (next === events.length) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }
      await reply.beforeEvent?.(next);
      if (reply.failAt === next) {
        controller.error(new Error("connection reset"));
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[next])}\n\n`));
      next++;
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** The system prompt of a request, where the turn context lives. */
function systemText(body: RequestBody): string {
  const first = Array.isArray(body.messages) ? body.messages[0] : undefined;
  return isRecord(first) && typeof first.content === "string" ? first.content : "";
}

/** True when the last message of a request is a tool result. */
function afterToolResult(body: RequestBody): boolean {
  const last = Array.isArray(body.messages) ? body.messages.at(-1) : undefined;
  return isRecord(last) && last.role === "tool";
}

beforeEach(() => {
  bodies = [];
  groqCalls = 0;
  llm = () => ({ content: "Hi!" });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("GROQ_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A backend with one IST user, two foods and a chat. */
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await user.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
  const foods = await t.run(async (ctx) => ({
    chapati: await ctx.db.insert("foods", {
      name: "Chapati",
      aliases: ["roti"],
      searchText: "Chapati roti",
      per100g: CHAPATI,
      source: "fdc",
      sourceId: "1",
      verified: true,
    }),
    dal: await ctx.db.insert("foods", {
      name: "Dal, cooked",
      aliases: [],
      searchText: "Dal, cooked",
      per100g: DAL,
      source: "fdc",
      sourceId: "2",
      verified: true,
    }),
  }));
  const chatId = await user.mutation(api.chats.createChat, {});
  return { t, user, foods, chatId };
}

/** Every entries row, oldest first. */
async function entryRows(t: TestConvex<typeof schema>): Promise<Doc<"entries">[]> {
  return await t.run((ctx) => ctx.db.query("entries").take(500));
}

describe("multi-chat (D12)", () => {
  test("create, list, page messages, delete; other users see nothing", async () => {
    const { t, user, chatId } = await setup();
    const second = await user.mutation(api.chats.createChat, { title: "Dinner plans" });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hello coach" });

    const chats = await user.query(api.chats.listChats, {});
    expect(chats.map((c) => c.title).sort()).toEqual(["Dinner plans", "hello coach"]);
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 1, cursor: null } });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({ role: "assistant", text: "Hi!" });
    expect(page.isDone).toBe(false);

    const other = t.withIdentity({ subject: "user_b" });
    expect(await other.query(api.chats.listChats, {})).toEqual([]);
    await expect(other.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 5, cursor: null } })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } })
    await expect(other.action(api.chats.sendMessage, { chatId, submissionId: "x", text: "hi" })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });

    vi.useFakeTimers();
    await user.mutation(api.chats.deleteChat, { chatId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect((await user.query(api.chats.listChats, {})).map((c) => c._id)).toEqual([second]);
    expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toHaveLength(0);
  });

  test("each turn sees the chat history, today's entries and the user's foods", async () => {
    const { user, chatId, foods } = await setup();
    await user.mutation(api.entries.addEntries, { submissionId: "e1", items: [{ foodId: foods.dal, grams: 150, source: "db" }] });
    await user.mutation(api.foods_db.createUserFood, { name: "Homemade ghee roti", per100g: CHAPATI });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "first question" });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m2", text: "second question" });

    const last = bodies.at(-1);
    if (last === undefined) throw new Error("no request");
    expect(systemText(last)).toContain("Dal, cooked | 150 g | 174 kcal");
    expect(systemText(last)).toContain("Homemade ghee roti");
    const roles = Array.isArray(last.messages) ? last.messages.map((m) => (isRecord(m) ? m.role : "")) : [];
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
  });

  test("the same submissionId twice returns one turn and one model call", async () => {
    const { user, chatId } = await setup();
    const a = await user.action(api.chats.sendMessage, { chatId, submissionId: "same", text: "hi" });
    const b = await user.action(api.chats.sendMessage, { chatId, submissionId: "same", text: "hi" });
    expect(b).toEqual(a);
    expect(bodies).toHaveLength(1);
  });

  test("a retry after a failed turn reports its saved entries instead of asking the model again", async () => {
    const { t, user, chatId, foods } = await setup();
    // Attempt 1 fails at its first model call (an empty reply throws) after a write under its key was saved.
    llm = () => ({});
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "had 2 rotis" })).rejects.toThrow();
    await user.mutation(api.entries.addEntries, {
      submissionId: "m1:edit_entry:0:0",
      items: [{ foodId: foods.chapati, grams: 80, source: "db" }],
    });
    const calls = bodies.length;

    // A fresh model run would add the same meal again under a new key.
    llm = () => ({ content: "Logged." });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "had 2 rotis" });

    const rows = await entryRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.foodId).toBe(foods.chapati);
    expect(bodies).toHaveLength(calls);
    expect(turn.entryIds).toEqual([rows[0]?._id]);
    expect(turn.reply).toContain("Chapati");
  });

  test("a second send while the first is still running is refused before any model call", async () => {
    const { t, user, chatId } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("messages", {
        userId: "user_a",
        chatId,
        role: "user",
        text: "hi",
        attachments: [],
        toolCalls: [],
        draftIds: [],
        submissionId: "m1",
        claimedAt: Date.now(),
      }),
    );
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" })).rejects.toMatchObject({ data: { code: "MESSAGE_BUSY" } })
    const audio = { data: btoa("fake audio bytes"), mimeType: "audio/webm" };
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", audio })).rejects.toMatchObject({ data: { code: "MESSAGE_BUSY" } });
    expect(bodies).toHaveLength(0);
    expect(groqCalls).toBe(0);
  });

  test("a submissionId with ':' is refused, so it cannot take another turn's reply key", async () => {
    const { user, chatId } = await setup();
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "x:reply", text: "hi" })).rejects.toThrow(/no ':'/);
    expect(bodies).toHaveLength(0);
  });

  test("a voice retry reuses the saved transcript instead of paying Groq again", async () => {
    const { t, user, chatId } = await setup();
    const audio = { data: btoa("fake audio bytes"), mimeType: "audio/webm" };
    llm = () => ({});
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "v1", audio })).rejects.toThrow();
    expect(groqCalls).toBe(1);

    llm = () => ({ content: "Logged." });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "v1", audio });
    expect(turn.reply).toBe("Logged.");
    expect(groqCalls).toBe(1);
    const message = await t.run((ctx) => ctx.db.get("messages", turn.userMessageId));
    expect(message).toMatchObject({ text: "two rotis" });
    expect(message?.audioPending).toBeUndefined();
    expect((await user.query(api.chats.listChats, {})).map((c) => c.title)).toEqual(["two rotis"]);
  });

  test("a tool-only reply without usage settles its tool arguments as output", async () => {
    const { t, user, chatId } = await setup();
    llm = (_body, n) =>
      n === 1 ? { noUsage: true, toolCalls: [{ name: "delete_entry", args: { entry_id: "x".repeat(900) } }] } : { content: "Done." };
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "delete it" });
    const [first] = await t.run((ctx) => ctx.db.query("ai_usage_reservations").take(10));
    expect(first?.settledOutputTokens).toBeGreaterThanOrEqual(300);
  });
});

describe("chat photo ownership", () => {
  test("a photo the caller did not upload is refused before the turn is claimed or a model runs", async () => {
    const { t, user, chatId } = await setup();
    const other = t.withIdentity({ subject: "user_b" });
    const theirs = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await other.mutation(internal.uploads.registerStoredUpload, { storageId: theirs });
    await expect(
      user.action(api.chats.sendMessage, { chatId, submissionId: "img", text: "what is this", imageStorageId: theirs }),
    ).rejects.toThrow(/Photo not found/);
    expect(bodies).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toHaveLength(0);
  });
});

describe("chat cannot log food", () => {
  test("add_entry is not offered, and a call to it gets an unknown-tool error and logs nothing", async () => {
    const { t, user, chatId } = await setup();
    llm = (body) =>
      afterToolResult(body)
        ? { content: "Use Compose to log that." }
        : { toolCalls: [{ name: "add_entry", args: { food: "roti", quantity: 2, unit: null, confidence: 0.95 } }] };
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "had 2 rotis" });

    expect(JSON.stringify(bodies[0]?.tools)).not.toContain("add_entry");
    expect(JSON.stringify(bodies[1]?.messages)).toContain("Unknown tool add_entry");
    expect(await entryRows(t)).toHaveLength(0);
  });
});

describe("Log this (A11)", () => {
  test("a photo is discussed, not logged: the photo model gets the image and the reply offers Log this with it", async () => {
    const { t, user, chatId } = await setup();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await user.mutation(internal.uploads.registerStoredUpload, { storageId });
    llm = () => ({ content: "Looks like dal and rice." });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "img", text: "what is this", imageStorageId: storageId });

    const first = bodies[0] ?? {};
    expect(first.model).toBe(PHOTO_MODEL);
    expect(JSON.stringify(lastMessage(first))).toContain("image_url");
    expect(await entryRows(t)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("drafts").take(10))).toHaveLength(0);
    expect(await replyRow(t)).toMatchObject({ status: "done", logAction: { storageId, text: "what is this" } });
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 5, cursor: null } });
    expect(page.page[0]).toMatchObject({ role: "assistant", logAction: { storageId, text: "what is this" } });
    expect(page.page[1]).toMatchObject({ role: "user", imageUrl: expect.any(String) });
  });

  test("asking to log food offers Log this with the food text and creates no entry", async () => {
    const { t, user, chatId } = await setup();
    llm = (body) =>
      afterToolResult(body)
        ? { content: "Tap Log this." }
        : { toolCalls: [{ name: "offer_log", args: { text: "2 roti and dal" } }] };
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "log 2 roti and dal" });

    expect(await entryRows(t)).toHaveLength(0);
    expect((await replyRow(t)).logAction).toEqual({ text: "2 roti and dal" });
  });

  test("a plain text reply has no Log this action", async () => {
    const { t, user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect((await replyRow(t)).logAction).toBeUndefined();
  });
});

/** The last message of a request body, or undefined. */
function lastMessage(body: RequestBody): unknown {
  return Array.isArray(body.messages) ? body.messages.at(-1) : undefined;
}

describe("chat corrections (D8)", () => {
  test("edit_entry writes a revision row by the AI and undo restores the prior revision", async () => {
    const { t, user, chatId, foods } = await setup();
    const [original] = await user.mutation(api.entries.addEntries, {
      submissionId: "e1",
      items: [{ foodId: foods.chapati, grams: 80, source: "db" }],
    });
    if (original === undefined) throw new Error("no entry");
    llm = (body) =>
      afterToolResult(body)
        ? { content: "Updated to 3 rotis." }
        : { toolCalls: [{ name: "edit_entry", args: { entry_id: original, quantity: 3, unit: null } }] };
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "it was 3 rotis, not 2" });

    const rows = await entryRows(t);
    expect(rows).toHaveLength(2);
    const revision = rows[1];
    expect(revision).toMatchObject({ op: "edit", createdBy: "ai", supersedes: original, grams: 120, status: "live", revision: 2 });
    expect(rows[0]?.status).toBe("superseded");
    expect(turn.entryIds).toEqual([revision?._id]);
    expect((await user.query(api.day_totals.dayTotals, {})).nutrients.kcal).toBe(356);

    if (revision === undefined) throw new Error("no revision");
    const undone = await user.mutation(api.entries.undoRevision, { submissionId: "u1", entryId: revision._id });
    const head = await t.run((ctx) => ctx.db.get("entries", undone));
    expect(head).toMatchObject({ op: "undo", grams: 80, revision: 3, status: "live" });
    expect((await user.query(api.day_totals.dayTotals, {})).nutrients.kcal).toBe(238);
  });

  test("delete_entry writes a deleted revision; a bad entry id returns an error to the model", async () => {
    const { t, user, chatId, foods } = await setup();
    const [original] = await user.mutation(api.entries.addEntries, {
      submissionId: "e1",
      items: [{ foodId: foods.dal, grams: 100, source: "db" }],
    });
    llm = (body) =>
      afterToolResult(body)
        ? { content: "Removed it." }
        : {
            toolCalls: [
              { name: "delete_entry", args: { entry_id: "not-an-id" } },
              { name: "delete_entry", args: { entry_id: original } },
            ],
          };
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "remove the dal" });
    const rows = await entryRows(t);
    expect(rows.at(-1)).toMatchObject({ op: "delete", status: "deleted", createdBy: "ai", supersedes: original });
    const toolResult = bodies[1]?.messages;
    expect(JSON.stringify(toolResult)).toContain("Unknown entry_id");
    expect((await user.query(api.day_totals.dayTotals, {})).entryCount).toBe(0);
  });

  test("another user's entry cannot be edited through chat", async () => {
    const { t, user, chatId, foods } = await setup();
    const other = t.withIdentity({ subject: "user_b" });
    await other.mutation(api.time_zone.setTimeZone, { timeZone: "Asia/Kolkata" });
    const [theirs] = await other.mutation(api.entries.addEntries, {
      submissionId: "e1",
      items: [{ foodId: foods.dal, grams: 100, source: "db" }],
    });
    llm = (body) =>
      afterToolResult(body) ? { content: "ok" } : { toolCalls: [{ name: "delete_entry", args: { entry_id: theirs } }] };
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "delete it" });
    expect((await entryRows(t)).every((r) => r.op === "add" && r.status === "live")).toBe(true);
  });

  test("a turn stops after MAX_CHAT_ITERATIONS model calls", async () => {
    const { user, chatId } = await setup();
    llm = () => ({ toolCalls: [{ name: "get_user_foods", args: {} }] });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "loop" });
    expect(bodies).toHaveLength(MAX_CHAT_ITERATIONS);
    expect(turn.reply).not.toBe("");
  });
});

/** The chat's assistant reply row. */
async function replyRow(t: TestConvex<typeof schema>): Promise<Doc<"messages">> {
  const rows = await t.run((ctx) => ctx.db.query("messages").take(20));
  const reply = rows.find((row) => row.role === "assistant");
  if (reply === undefined) throw new Error("no reply row");
  return reply;
}

/** Every live reply text row. */
async function streamRows(t: TestConvex<typeof schema>): Promise<Doc<"reply_streams">[]> {
  return await t.run((ctx) => ctx.db.query("reply_streams").take(20));
}

/** Waits until the reply's live row shows `text`, then returns the reply row; the stream reads ahead of the turn, so event order alone proves nothing. */
async function waitForText(t: TestConvex<typeof schema>, text: string): Promise<Doc<"messages">> {
  for (let i = 0; i < 200; i++) {
    const stream = (await streamRows(t)).find((s) => s.text === text);
    const row = stream === undefined ? null : await t.run((ctx) => ctx.db.get("messages", stream.messageId));
    if (row !== null) return row;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`reply never showed ${JSON.stringify(text.slice(0, 40))}`);
}

describe("streaming replies (A12)", () => {
  test("text lands on the live row while it streams, and the reply row ends done", async () => {
    const { t, user, chatId } = await setup();
    const long = "x".repeat(STREAM_FLUSH_CHARS + 50);
    const seen: Doc<"messages">[] = [];
    const live: (string | null)[] = [];
    llm = () => ({
      chunks: ["Hello ", long, " end"],
      beforeEvent: async (i) => {
        if (i !== 2) return;
        const row = await waitForText(t, `Hello ${long}`);
        seen.push(row);
        live.push(await user.query(api.chats.liveReply, { messageId: row._id }));
      },
    });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });

    expect(seen[0]).toMatchObject({ status: "streaming", text: "" });
    expect(live).toEqual([`Hello ${long}`]);
    expect(turn.reply).toBe(`Hello ${long} end`);
    expect(await streamRows(t)).toEqual([]);
    expect(await user.query(api.chats.liveReply, { messageId: turn.assistantMessageId })).toBeNull();
    expect(await replyRow(t)).toMatchObject({ _id: turn.assistantMessageId, status: "done", text: `Hello ${long} end` });
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 5, cursor: null } });
    expect(page.page[0]).toMatchObject({ role: "assistant", status: "done" });
    expect(bodies[0]?.stream).toBe(true);
  });

  test("stop keeps the partial reply, marks it stopped, and a resend returns it without a model call", async () => {
    const { t, user, chatId } = await setup();
    const long = "x".repeat(STREAM_FLUSH_CHARS + 50);
    llm = () => ({
      chunks: ["Hello ", long, "y".repeat(STREAM_FLUSH_CHARS + 50), " tail"],
      beforeEvent: async (i) => {
        if (i === 2) await user.mutation(api.chats.stopMessage, { messageId: (await waitForText(t, `Hello ${long}`))._id });
      },
    });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });

    expect(turn.reply).toBe(`Hello ${long}`);
    expect(await replyRow(t)).toMatchObject({ status: "stopped", text: `Hello ${long}` });
    expect((await replyRow(t)).stopRequested).toBeUndefined();
    const again = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(again).toEqual(turn);
    expect(bodies).toHaveLength(1);
  });

  test("a stop after the last streamed write still ends the reply stopped at the text the user saw", async () => {
    const { t, user, chatId } = await setup();
    llm = () => ({
      chunks: ["Hello", " tail"],
      beforeEvent: async (i) => {
        if (i === 1) await user.mutation(api.chats.stopMessage, { messageId: (await waitForText(t, "Hello"))._id });
      },
    });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(turn.reply).toBe("Hello");
    expect(await replyRow(t)).toMatchObject({ status: "stopped", text: "Hello" });
  });

  test("a stop pressed while tools run ends the turn before the next model call", async () => {
    const { t, user, chatId } = await setup();
    llm = (_body, n) =>
      n === 1
        ? {
            chunks: ["Checking."],
            toolCalls: [{ name: "get_user_foods", args: {} }],
            beforeEvent: async (i) => {
              if (i === 1) await user.mutation(api.chats.stopMessage, { messageId: (await waitForText(t, "Checking."))._id });
            },
          }
        : { content: "Never sent." };
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "foods?" });
    expect(bodies).toHaveLength(1);
    expect(await replyRow(t)).toMatchObject({ status: "stopped", text: "Checking." });
    expect(turn.reply).toBe("Checking.");
  });

  test("a broken stream marks the reply failed; the retry streams into the same row", async () => {
    const { t, user, chatId } = await setup();
    llm = () => ({ chunks: ["Partial", " more"], failAt: 1 });
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" })).rejects.toThrow(/connection reset/);
    const failed = await replyRow(t);
    expect(failed).toMatchObject({ status: "failed", text: "Partial" });
    const view = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 5, cursor: null } });
    expect(view.page.find((m) => m._id === failed._id)?.retrySubmissionId).toBe("m1");

    // A failed reply is not history: the retry's model call sees only the user's message.
    llm = () => ({ content: "Full answer." });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(turn.assistantMessageId).toBe(failed._id);
    expect(await replyRow(t)).toMatchObject({ status: "done", text: "Full answer." });
    const roles = Array.isArray(bodies.at(-1)?.messages) ? (bodies.at(-1)?.messages as unknown[]).map((m) => (isRecord(m) ? m.role : "")) : [];
    expect(roles).toEqual(["system", "user"]);
    expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toHaveLength(2);
  });

  test("a reply left streaming by a crashed turn expires as failed", async () => {
    const { t, chatId } = await setup();
    vi.useFakeTimers();
    const claim = await t.mutation(internal.chats.claimTurn, {
      userId: "user_a",
      chatId,
      submissionId: "m1",
      text: "hi",
      attachments: [],
      audioPending: false,
    });
    expect(await replyRow(t)).toMatchObject({ _id: claim.replyId, status: "streaming" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect(await replyRow(t)).toMatchObject({ status: "failed" });
    expect(bodies).toHaveLength(0);
  });

  test("only the owner can stop a reply", async () => {
    const { t, user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    const other = t.withIdentity({ subject: "user_b" });
    await expect(other.mutation(api.chats.stopMessage, { messageId: (await replyRow(t))._id })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });
});

describe("live reply rows (B3)", () => {
  /** Every messages and chats row: what the paged message query and the chat list read. */
  async function pagedRows(t: TestConvex<typeof schema>) {
    return await t.run(async (ctx) => ({ messages: await ctx.db.query("messages").take(20), chats: await ctx.db.query("chats").take(5) }));
  }

  test("streaming writes touch neither messages nor chats, so listMessages and listChats don't rerun", async () => {
    const { t, user, chatId } = await setup();
    const a = "a".repeat(STREAM_FLUSH_CHARS + 10);
    const b = "b".repeat(STREAM_FLUSH_CHARS + 10);
    const snapshots: Awaited<ReturnType<typeof pagedRows>>[] = [];
    let writes = 0;
    llm = () => ({
      chunks: ["Hello", a, b, " end"],
      beforeEvent: async (i) => {
        if (i === 1) await waitForText(t, "Hello");
        if (i === 3) await waitForText(t, `Hello${a}${b}`);
        if (i === 1 || i === 3) {
          snapshots.push(await pagedRows(t));
          writes++;
        }
      },
    });
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(writes).toBe(2);
    // Three streamed writes landed between the snapshots; not one of them changed a row the paged queries read.
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(turn.reply).toBe(`Hello${a}${b} end`);
  });

  test("the live row is gone after a stop, a late stop, a failure, an expiry, a regenerate and a deleted chat", async () => {
    const { t, user, chatId } = await setup();
    // Stop mid-stream.
    llm = () => ({
      chunks: ["Hello", "x".repeat(STREAM_FLUSH_CHARS + 10), " tail"],
      beforeEvent: async (i) => {
        if (i === 2) await user.mutation(api.chats.stopMessage, { messageId: (await waitForText(t, `Hello${"x".repeat(STREAM_FLUSH_CHARS + 10)}`))._id });
      },
    });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(await streamRows(t)).toEqual([]);

    // A broken stream fails the reply and keeps the text it reached on the message.
    llm = () => ({ chunks: ["Partial", " more"], failAt: 1 });
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m2", text: "again" })).rejects.toThrow(/connection reset/);
    expect(await streamRows(t)).toEqual([]);
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page[0]).toMatchObject({ status: "failed", text: "Partial" });

    // Regenerate streams into a new row and cleans it up when done.
    llm = () => ({ content: "Fresh take." });
    await user.action(api.chats.regenerate, { chatId });
    expect(await streamRows(t)).toEqual([]);

    // A chat deleted mid-stream: the turn ends, its rows are purged, and no live row is left.
    llm = () => ({
      chunks: ["Doomed", " reply"],
      beforeEvent: async (i) => {
        if (i !== 1) return;
        await waitForText(t, "Doomed");
        await user.mutation(api.chats.deleteChat, { chatId });
      },
    });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m3", text: "last" });
    expect(await streamRows(t)).toEqual([]);
  });

  test("an expired reply keeps the streamed text and drops its live row", async () => {
    const { t, chatId } = await setup();
    vi.useFakeTimers();
    const claim = await t.mutation(internal.chats.claimTurn, { userId: "user_a", chatId, submissionId: "m1", text: "hi", attachments: [], audioPending: false });
    expect(await t.mutation(internal.chats.appendReply, { messageId: claim.replyId, claimedAt: claim.claimedAt, text: "Half" })).toBe(false);
    expect(await streamRows(t)).toHaveLength(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect(await replyRow(t)).toMatchObject({ status: "failed", text: "Half" });
    expect(await streamRows(t)).toEqual([]);
  });

  test("a stale attempt can't write the live row, and a retry starts it empty", async () => {
    const { t, chatId } = await setup();
    const first = await t.mutation(internal.chats.claimTurn, { userId: "user_a", chatId, submissionId: "m1", text: "hi", attachments: [], audioPending: false });
    await t.mutation(internal.chats.appendReply, { messageId: first.replyId, claimedAt: first.claimedAt, text: "Old attempt" });
    await t.mutation(internal.chats.releaseTurn, { userId: "user_a", messageId: first.messageId, replyId: first.replyId, claimedAt: first.claimedAt });
    expect(await replyRow(t)).toMatchObject({ status: "failed", text: "Old attempt" });
    expect(await streamRows(t)).toEqual([]);

    // Claim times fence attempts, so the retry must start at a later millisecond.
    vi.useFakeTimers({ toFake: ["Date"], now: first.claimedAt + 1_000 });
    const retry = await t.mutation(internal.chats.claimTurn, { userId: "user_a", chatId, submissionId: "m1", text: "hi", attachments: [], audioPending: false });
    vi.useRealTimers();
    expect(retry.replyId).toBe(first.replyId);
    expect(await t.mutation(internal.chats.appendReply, { messageId: first.replyId, claimedAt: first.claimedAt, text: "stale" })).toBe(true);
    expect(await streamRows(t)).toEqual([]);
    expect(await t.mutation(internal.chats.appendReply, { messageId: retry.replyId, claimedAt: retry.claimedAt, text: "New" })).toBe(false);
    expect((await streamRows(t)).map((s) => s.text)).toEqual(["New"]);
  });

  test("purging a deleted chat removes a live row left by a reply that never ended", async () => {
    const { t, user, chatId } = await setup();
    const claim = await t.mutation(internal.chats.claimTurn, { userId: "user_a", chatId, submissionId: "m1", text: "hi", attachments: [], audioPending: false });
    await t.mutation(internal.chats.appendReply, { messageId: claim.replyId, claimedAt: claim.claimedAt, text: "Cut off" });
    vi.useFakeTimers();
    await user.mutation(api.chats.deleteChat, { chatId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect(await streamRows(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toEqual([]);
  });

  test("liveReply hides another user's stream", async () => {
    const { t, chatId } = await setup();
    const claim = await t.mutation(internal.chats.claimTurn, { userId: "user_a", chatId, submissionId: "m1", text: "hi", attachments: [], audioPending: false });
    await t.mutation(internal.chats.appendReply, { messageId: claim.replyId, claimedAt: claim.claimedAt, text: "Private" });
    expect(await t.withIdentity({ subject: "user_a" }).query(api.chats.liveReply, { messageId: claim.replyId })).toBe("Private");
    expect(await t.withIdentity({ subject: "user_b" }).query(api.chats.liveReply, { messageId: claim.replyId })).toBeNull();
  });
});

describe("chat previews on the chat row (B3)", () => {
  /** The stored preview field of the only chat. */
  async function storedPreview(t: TestConvex<typeof schema>): Promise<string | null | undefined> {
    return (await t.run((ctx) => ctx.db.query("chats").first()))?.lastMessage;
  }

  test("the preview follows claim, finish, failure, retry and regenerate", async () => {
    const { t, user, chatId } = await setup();
    expect(await storedPreview(t)).toBeNull();

    llm = () => ({ chunks: ["Partial", " more"], failAt: 1 });
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "my question" })).rejects.toThrow();
    expect(await storedPreview(t)).toBe("Partial");

    // The retry resets the reply, so the preview falls back to the question until the new reply finishes.
    llm = () => ({ chunks: ["Answer"], beforeEvent: async (i) => void (i === 0 && expect(await storedPreview(t)).toBe("my question")) });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "my question" });
    expect(await storedPreview(t)).toBe("Answer");

    llm = () => ({ content: "y".repeat(150) });
    await user.action(api.chats.regenerate, { chatId });
    expect(await storedPreview(t)).toBe("y".repeat(100));
    expect((await user.query(api.chats.listChats, {}))[0]?.lastMessage).toBe("y".repeat(100));
  });

  test("a chat stored before previews falls back to reading its messages", async () => {
    const { t, user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    await t.run((ctx) => ctx.db.patch("chats", chatId, { lastMessage: undefined }));
    expect((await user.query(api.chats.listChats, {}))[0]?.lastMessage).toBe("Hi!");
  });
});

describe("regenerate", () => {
  test("hides the last reply, streams a new one, and keeps the hidden reply's entry links", async () => {
    const { t, user, chatId, foods } = await setup();
    const [original] = await user.mutation(api.entries.addEntries, {
      submissionId: "e1",
      items: [{ foodId: foods.chapati, grams: 80, source: "db" }],
    });
    llm = (body) =>
      afterToolResult(body)
        ? { content: "Updated to 3 rotis." }
        : { toolCalls: [{ name: "edit_entry", args: { entry_id: original, quantity: 3, unit: null } }] };
    const first = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "it was 3 rotis" });
    const oldReply = await replyRow(t);

    llm = () => ({ content: "Try again: 3 rotis." });
    const calls = bodies.length;
    const result = await user.action(api.chats.regenerate, { chatId });

    expect(bodies).toHaveLength(calls + 1);
    expect(result.reply).toBe("Try again: 3 rotis.");
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((m) => m._id)).toEqual([result.assistantMessageId, first.userMessageId]);
    expect(page.page[0]).toMatchObject({ _id: result.assistantMessageId, text: "Try again: 3 rotis.", status: "done" });
    expect(await t.run((ctx) => ctx.db.get("messages", oldReply._id))).toMatchObject({
      deletedAt: expect.any(Number),
      entryIds: first.entryIds,
    });
    expect(first.entryIds).toHaveLength(1);
    // The hidden reply is not history: the new attempt sees only the user's message.
    const roles = Array.isArray(bodies.at(-1)?.messages) ? (bodies.at(-1)?.messages as unknown[]).map((m) => (isRecord(m) ? m.role : "")) : [];
    expect(roles).toEqual(["system", "user"]);
  });

  test("refuses while the last reply is still streaming", async () => {
    const { t, user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    const reply = await replyRow(t);
    await t.run((ctx) =>
      ctx.db.insert("messages", {
        userId: "user_a",
        chatId,
        role: "assistant",
        text: "",
        attachments: [],
        toolCalls: [],
        draftIds: [],
        entryIds: [],
        submissionId: "m1:reply:live",
        answersMessageId: reply.answersMessageId,
        status: "streaming",
        claimedAt: Date.now(),
      }),
    );
    await expect(user.action(api.chats.regenerate, { chatId })).rejects.toMatchObject({ data: { code: "REPLY_STREAMING" } });
    expect(bodies).toHaveLength(1);
  });

  test("a resend of the original message after regenerate is refused without a model call", async () => {
    const { user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    await user.action(api.chats.regenerate, { chatId });
    const calls = bodies.length;
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" })).rejects.toMatchObject({ data: { code: "MESSAGE_BUSY" } });
    expect(bodies).toHaveLength(calls);
  });
});

describe("rename, preview and search", () => {
  test("renameChat: the owner renames the chat; others get Chat not found; bad titles throw", async () => {
    const { t, user, chatId } = await setup();
    await user.mutation(api.chats.renameChat, { chatId, title: "  Dinner ideas  " });
    expect((await user.query(api.chats.listChats, {}))[0]?.title).toBe("Dinner ideas");

    const other = t.withIdentity({ subject: "user_b" });
    await expect(other.mutation(api.chats.renameChat, { chatId, title: "Mine" })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    await expect(user.mutation(api.chats.renameChat, { chatId, title: "   " })).rejects.toMatchObject({ data: { code: "INVALID_TEXT" } });
    await expect(user.mutation(api.chats.renameChat, { chatId, title: "x".repeat(61) })).rejects.toMatchObject({ data: { code: "INVALID_TEXT" } });
    expect((await user.query(api.chats.listChats, {}))[0]?.title).toBe("Dinner ideas");
  });

  test("listChats previews each chat's newest message", async () => {
    const { user, chatId } = await setup();
    expect((await user.query(api.chats.listChats, {}))[0]?.lastMessage).toBeNull();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect((await user.query(api.chats.listChats, {}))[0]?.lastMessage).toBe("Hi!");
  });

  test("searchChats finds a message by word and hides other users' and deleted messages", async () => {
    const { t, user, chatId } = await setup();
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "I had paneer tikka for lunch" });
    expect(await user.query(api.chats.searchChats, { query: "paneer" })).toEqual([
      { chatId, title: "I had paneer tikka for lunch", snippet: "I had paneer tikka for lunch", messageId: turn.userMessageId },
    ]);
    expect(await user.query(api.chats.searchChats, { query: "   " })).toEqual([]);

    const other = t.withIdentity({ subject: "user_b" });
    expect(await other.query(api.chats.searchChats, { query: "paneer" })).toEqual([]);

    await t.run((ctx) => ctx.db.patch("messages", turn.userMessageId, { deletedAt: Date.now() }));
    expect(await user.query(api.chats.searchChats, { query: "paneer" })).toEqual([]);
  });

  test("searchChats returns at most 20 chats", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        const chat = await ctx.db.insert("chats", { userId: "user_a", title: `Chat ${i}`, updatedAt: Date.now() });
        await ctx.db.insert("messages", {
          userId: "user_a",
          chatId: chat,
          role: "user",
          text: `garlic naan ${i}`,
          attachments: [],
          toolCalls: [],
          draftIds: [],
          submissionId: `s${i}`,
        });
      }
    });
    expect(await user.query(api.chats.searchChats, { query: "naan" })).toHaveLength(20);
  });
});

describe("review fixes", () => {
  test("a stop pressed during a tool-only reply runs no ledger tool", async () => {
    const { t, user, chatId, foods } = await setup();
    const [entry] = await user.mutation(api.entries.addEntries, { submissionId: "e1", items: [{ foodId: foods.dal, grams: 100, source: "db" }] });
    llm = (_body, n) =>
      n === 1
        ? {
            toolCalls: [{ name: "delete_entry", args: { entry_id: entry } }],
            beforeEvent: async (i) => {
              if (i === 0) await user.mutation(api.chats.stopMessage, { messageId: (await replyRow(t))._id });
            },
          }
        : { content: "Never sent." };
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "delete the dal" });
    expect((await entryRows(t)).every((row) => row.status === "live")).toBe(true);
    expect(await replyRow(t)).toMatchObject({ status: "stopped" });
  });

  test("a stream that closes before a finish event fails instead of saving a cut-off reply", async () => {
    const { t, user, chatId } = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Half an ans" } }] })}\n\n`));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" })).rejects.toThrow(/ended before/);
    expect(await replyRow(t)).toMatchObject({ status: "failed" });
  });

  test("regenerating a reply that edited an entry keeps its undo card on the replacement", async () => {
    const { t, user, chatId, foods } = await setup();
    const [entry] = await user.mutation(api.entries.addEntries, { submissionId: "e1", items: [{ foodId: foods.chapati, grams: 80, source: "db" }] });
    llm = (body) =>
      afterToolResult(body) ? { content: "Updated." } : { toolCalls: [{ name: "edit_entry", args: { entry_id: entry, quantity: 3, unit: null } }] };
    const first = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "3 rotis" });
    llm = () => ({ content: "Here's another take." });
    const again = await user.action(api.chats.regenerate, { chatId });
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 10, cursor: null } });
    const visible = page.page.find((m) => m._id === again.assistantMessageId);
    expect(visible?.entryIds).toEqual(first.entryIds);
  });

  test("many regenerations don't push the question out of the model's history", async () => {
    const { t, user, chatId } = await setup();
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "the question" });
    // 25 earlier regenerations: hidden replies newer than the question, then the live reply newest of all.
    await t.run(async (ctx) => {
      await ctx.db.patch("messages", turn.assistantMessageId, { deletedAt: 1 });
      for (let i = 0; i < 25; i++) {
        await ctx.db.insert("messages", {
          userId: "user_a", chatId, role: "assistant", text: `old ${i}`, attachments: [], toolCalls: [], draftIds: [],
          answersMessageId: turn.userMessageId, deletedAt: 1, status: "done",
        });
      }
      await ctx.db.insert("messages", {
        userId: "user_a", chatId, role: "assistant", text: "live", attachments: [], toolCalls: [], draftIds: [],
        answersMessageId: turn.userMessageId, status: "done",
      });
    });
    await user.action(api.chats.regenerate, { chatId });
    const roles = Array.isArray(bodies.at(-1)?.messages) ? (bodies.at(-1)?.messages as unknown[]).map((m) => (isRecord(m) ? m.role : "")) : [];
    expect(roles).toEqual(["system", "user"]);
  });

  test("getChat returns the caller's chat and null for anyone else", async () => {
    const { t, user, chatId } = await setup();
    expect(await user.query(api.chats.getChat, { chatId })).toMatchObject({ _id: chatId });
    expect(await t.withIdentity({ subject: "user_b" }).query(api.chats.getChat, { chatId })).toBeNull();
  });

  test("stop is noticed while the stream is silent, without waiting for more text", async () => {
    const { t, user, chatId } = await setup();
    llm = () => ({
      chunks: ["Hello", " later"],
      beforeEvent: async (i) => {
        if (i !== 1) return;
        await user.mutation(api.chats.stopMessage, { messageId: (await waitForText(t, "Hello"))._id });
        // The provider goes quiet (keep-alives only) for longer than the turn should take to stop.
        await new Promise((resolve) => setTimeout(resolve, 2000));
      },
    });
    const started = Date.now();
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(turn.reply).toBe("Hello");
    expect(await replyRow(t)).toMatchObject({ status: "stopped" });
  });

  test("a regenerate that fails keeps the old reply's undo cards on its row", async () => {
    const { user, chatId, foods } = await setup();
    const [entry] = await user.mutation(api.entries.addEntries, { submissionId: "e1", items: [{ foodId: foods.chapati, grams: 80, source: "db" }] });
    llm = (body) =>
      afterToolResult(body) ? { content: "Updated." } : { toolCalls: [{ name: "edit_entry", args: { entry_id: entry, quantity: 3, unit: null } }] };
    const first = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "3 rotis" });
    llm = () => ({});
    await expect(user.action(api.chats.regenerate, { chatId })).rejects.toThrow();
    const page = await user.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 10, cursor: null } });
    const failed = page.page.find((m) => m.role === "assistant");
    expect(failed).toMatchObject({ status: "failed", entryIds: first.entryIds });
  });

  test("a regenerated reply can't run log changes again", async () => {
    const { user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    llm = () => ({ content: "Again." });
    await user.action(api.chats.regenerate, { chatId });
    const names = JSON.stringify(bodies.at(-1)?.tools ?? []);
    expect(names).not.toContain("edit_entry");
    expect(names).not.toContain("delete_entry");
    expect(names).toContain("offer_log");
  });

  test("stop is noticed while keep-alives arrive faster than the idle tick", async () => {
    const { t, user, chatId } = await setup();
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn(async () => {
      let timer: ReturnType<typeof setInterval> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`));
          timer = setInterval(() => controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n")), 100);
        },
        cancel() {
          clearInterval(timer);
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    const sending = user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    await user.mutation(api.chats.stopMessage, { messageId: (await waitForText(t, "Hello"))._id });
    const started = Date.now();
    const turn = await sending;
    expect(Date.now() - started).toBeLessThan(1500);
    expect(turn.reply).toBe("Hello");
    expect(await replyRow(t)).toMatchObject({ status: "stopped" });
  });
});

describe("coach sees the profile (10f)", () => {
  test("a saved profile reaches the system prompt with diet, training, targets and weight trend", async () => {
    const { user, chatId } = await setup();
    await user.mutation(api.weights.logWeight, { kg: 72.4 });
    await user.mutation(api.progress_v2.saveProfile, {
      goal: "lose",
      sex: "male",
      heightCm: 175,
      dob: "1990-01-01",
      activity: "moderate",
      dietTypes: ["jain"],
      targetWeightKg: 68,
      pace: "steady",
      trainingDaysPerWeek: 4,
    });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "what should I eat?" });

    const system = systemText(bodies[0] ?? {});
    expect(system).toContain("About the user:");
    expect(system).toContain("Goal: lose, steady pace (0.5 kg a week). Target weight 68 kg.");
    expect(system).toContain("Diet: Jain.");
    expect(system).toContain("never onion or garlic if Jain is listed");
    expect(system).toContain("Trains 4 days a week.");
    expect(system).toMatch(/Daily target: \d+ kcal, protein \d+ g, carbs \d+ g, fat \d+ g\./);
    expect(system).toContain("Weight trend: 72.4 kg.");
  });

  test("a user who eats both veg and non-veg has both diets in the system prompt", async () => {
    const { user, chatId } = await setup();
    await user.mutation(api.progress_v2.saveProfile, {
      goal: "maintain",
      sex: "male",
      heightCm: 175,
      dob: "1990-01-01",
      activity: "moderate",
      dietTypes: ["veg", "non_veg"],
    });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "dinner ideas?" });
    expect(systemText(bodies[0] ?? {})).toContain("Diet: Vegetarian, Non-vegetarian.");
  });

  test("a user with no profile gets no About block and no crash", async () => {
    const { user, chatId } = await setup();
    await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "hi" });
    expect(systemText(bodies[0] ?? {})).not.toContain("About the user");
  });

  test("retrying an older failed question sends history that ends at that question", async () => {
    const { user, chatId } = await setup();
    llm = () => ({});
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "a", text: "question A" })).rejects.toThrow();
    llm = () => ({ content: "Answer B." });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "b", text: "question B" });
    await user.action(api.chats.sendMessage, { chatId, submissionId: "a", text: "question A" });
    const sent = Array.isArray(bodies.at(-1)?.messages) ? (bodies.at(-1)?.messages as unknown[]) : [];
    const texts = sent.map((m) => (isRecord(m) && typeof m.content === "string" ? m.content : ""));
    expect(texts.at(-1)).toBe("question A");
    expect(texts).not.toContain("question B");
  });

  test("a turn that fails after a correction keeps its Undo card on the failed reply", async () => {
    const { t, user, chatId, foods } = await setup();
    const [entry] = await user.mutation(api.entries.addEntries, { submissionId: "e1", items: [{ foodId: foods.chapati, grams: 80, source: "db" }] });
    llm = (_body, n) => (n === 1 ? { toolCalls: [{ name: "edit_entry", args: { entry_id: entry, quantity: 3, unit: null } }] } : {});
    await expect(user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "3 rotis" })).rejects.toThrow();
    const failed = await replyRow(t);
    const revision = (await entryRows(t)).at(-1);
    expect(failed.status).toBe("failed");
    expect(failed.entryIds).toEqual([revision?._id]);
  });
});

import { roundNutrients, type Nutrients } from "@stride/core";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { MAX_CHAT_ITERATIONS } from "./chats";
import { isRecord, OPENROUTER_CHAT_URL } from "./pipeline/openrouter";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const CHAPATI: Nutrients = { kcal: 297, protein: 11.25, carbs: 46.36, fat: 7.45, fiber: 4.9, sugar: 2.72, sodiumMg: 409 };
const DAL: Nutrients = { kcal: 116.3, protein: 9.02, carbs: 20.13, fat: 0.38, fiber: 7.9, sugar: 1.8, sodiumMg: 2 };

/** One mocked model reply. */
interface LlmReply {
  content?: string | null;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}
type RequestBody = Record<string, unknown>;

let llm: (body: RequestBody, n: number) => LlmReply;
let bodies: RequestBody[];

/** A JSON response. */
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

/** Mocked OpenRouter. Any other URL fails the test. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
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
  return json({
    choices: [{ message: { content: reply.content ?? null, tool_calls: toolCalls }, finish_reason: "stop" }],
    usage: { prompt_tokens: 300, completion_tokens: 30 },
  });
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
  llm = () => ({ content: "Hi!" });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
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
    await expect(other.query(api.chats.listMessages, { chatId, paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(
      /Chat not found/,
    );
    await expect(other.action(api.chats.sendMessage, { chatId, submissionId: "x", text: "hi" })).rejects.toThrow(/Chat not found/);

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
});

describe("chat logging runs the same pipeline", () => {
  test("add_entry items commit through the gate, linked to the chat message, with nutrients from foods", async () => {
    const { t, user, chatId, foods } = await setup();
    llm = (body) =>
      afterToolResult(body)
        ? { content: "Logged 2 rotis." }
        : { toolCalls: [{ name: "add_entry", args: { food: "roti", quantity: 2, unit: null, confidence: 0.95, kcal: 5000 } }] };
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "had 2 rotis" });

    expect(turn.reply).toBe("Logged 2 rotis.");
    const [row] = await entryRows(t);
    expect(row).toMatchObject({ foodId: foods.chapati, grams: 80, createdBy: "ai", chatId, messageId: turn.userMessageId });
    expect(roundNutrients(row?.nutrients ?? CHAPATI).kcal).toBe(238);
    expect(turn.entryIds).toEqual([row?._id]);
    const reply = await t.run((ctx) => ctx.db.get("messages", turn.assistantMessageId));
    expect(reply?.entryIds).toEqual([row?._id]);
    expect(reply?.toolCalls[0]?.name).toBe("add_entry");
  });

  test("an unmatched add_entry becomes a draft card on the message", async () => {
    const { t, user, chatId } = await setup();
    llm = (body) => {
      if (afterToolResult(body)) return { content: "Please check the card." };
      const tools = Array.isArray(body.tools) ? JSON.stringify(body.tools) : "";
      if (tools.includes("choose_food")) return { content: "no idea" };
      return { toolCalls: [{ name: "add_entry", args: { food: "mystery sabzi", quantity: 1, unit: "katori", confidence: 0.9 } }] };
    };
    const turn = await user.action(api.chats.sendMessage, { chatId, submissionId: "m1", text: "mystery sabzi" });
    expect(turn.draftIds).toHaveLength(1);
    expect(await entryRows(t)).toHaveLength(0);
  });
});

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

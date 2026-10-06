import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";

vi.mock("./ai/llm", async () => {
  const actual = await vi.importActual<typeof import("./ai/llm")>("./ai/llm");
  return { ...actual, callAI: vi.fn() };
});

const mockedCallAI = vi.mocked(callAI);
const modules = import.meta.glob("./**/*.*s");

type ExtractedItem = {
  type: "meal" | "workout" | "sleep" | "water" | "mood" | "steps";
  description: string;
  date: string;
};

function promptText(messages: any[]): string {
  const content = messages?.[0]?.content;
  return typeof content === "string" ? content : "";
}

function mockTurn(options: {
  reply?: string;
  extraction?: { isQuestion: boolean; items: ExtractedItem[] } | Error | string;
  failMoodParse?: boolean;
}) {
  mockedCallAI.mockImplementation(async (_ctx, _userId, messages) => {
    const prompt = promptText(messages);
    if (prompt.includes("Generate a short, descriptive title")) return "Turn contract";
    if (prompt.includes("Extract ALL loggable items")) {
      if (options.extraction instanceof Error) throw options.extraction;
      if (typeof options.extraction === "string") return options.extraction;
      return JSON.stringify(options.extraction ?? { isQuestion: true, items: [] });
    }
    if (prompt.includes("Extract water amount in ml")) return "500";
    if (prompt.includes("Extract mood rating")) {
      if (options.failMoodParse) throw new Error("mood parser unavailable");
      return "4";
    }
    return options.reply ?? "Got it.";
  });
}

describe("persisted chat-turn outcome contract", () => {
  beforeEach(() => mockedCallAI.mockReset());

  test("success-sounding prose without valid extraction persists failure without a success claim or domain record", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    mockTurn({
      reply: "Perfect, your breakfast is now tracked and noted.",
      extraction: "not valid structured JSON",
    });

    const result = await asUser.action(api.ai.chat, {
      message: "I ate lunch",
      today: "2026-07-16",
      clientSubmissionId: "failed-success-prose",
    }) as any;

    expect(result.outcome).toBe("failed");
    expect(result.reply).toMatch(/couldn't save/i);
    expect(result.reply).not.toMatch(/\btracked\b|\bnoted\b|\brecorded\b/i);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(0);
    const assistant = (await t.run((ctx) => ctx.db.query("chat_messages").collect()))
      .find((message) => message.role === "ai");
    expect(assistant).toMatchObject({
      content: result.reply,
      turnContractVersion: 1,
      turnOutcome: "failed",
      clientSubmissionId: "failed-success-prose",
    });
  });

  test("truncated structured extraction persists a retriable failed outcome", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    mockTurn({
      reply: "I understood the meal report.",
      extraction: new Error("OpenRouter incomplete response (finish_reason: length); retry the request"),
    });

    const result = await asUser.action(api.ai.chat, {
      message: "I ate lunch",
      today: "2026-07-16",
      clientSubmissionId: "truncated-turn",
    }) as any;

    expect(result.outcome).toBe("failed");
    expect(result.cards).toContainEqual(expect.objectContaining({
      kind: "failure",
      data: expect.objectContaining({
        code: "TRUNCATED_RESPONSE",
        retriable: true,
      }),
    }));
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(0);
    const assistant = (await t.run((ctx) => ctx.db.query("chat_messages").collect())).find((message) => message.role === "ai");
    expect(assistant).toMatchObject({ turnOutcome: "failed", turnCards: result.cards });
  });

  test("a terminal outcome cannot be overwritten by a late finalize", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    mockTurn({ extraction: { isQuestion: false, items: [{ type: "water", description: "500ml water", date: "2026-07-16" }] } });
    const result = await asUser.action(api.ai.chat, { message: "I drank 500ml water", today: "2026-07-16", clientSubmissionId: "terminal-once" }) as any;
    const groupId = result.cards.find((card: any) => card.kind === "result").data.groupId;

    await t.mutation(internal.chat.updateAssistantOutcomeForGroup, { userId: "turn-user", actionGroupId: groupId });
    await t.mutation(internal.chat.updateAssistantOutcomeForGroup, { userId: "turn-user", actionGroupId: groupId });

    const assistant = (await t.run((ctx) => ctx.db.query("chat_messages").collect())).find((message) => message.role === "ai");
    expect(assistant).toMatchObject({ turnOutcome: "committed", content: "Saved 500ml water." });
  });

  test("transport retry reconstructs a persisted failed outcome without rerunning the log", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    const request = {
      message: "I ate lunch",
      today: "2026-07-16",
      clientSubmissionId: "failed-transport-retry",
    };
    mockTurn({ extraction: new Error("provider unavailable") });
    const first = await asUser.action(api.ai.chat, request) as any;

    mockTurn({ extraction: {
      isQuestion: false,
      items: [{ type: "water", description: "500ml water", date: "2026-07-16" }],
    } });
    const retry = await asUser.action(api.ai.chat, request) as any;

    expect(retry).toMatchObject({
      messageId: first.messageId,
      reply: first.reply,
      outcome: "failed",
      cards: first.cards,
    });
    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(0);
    const messages = await t.run((ctx) => ctx.db.query("chat_messages").collect());
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(messages.filter((message) => message.role === "ai")).toHaveLength(1);
    expect(messages.find((message) => message.role === "ai")).toMatchObject({
      turnOutcome: "failed",
      clientSubmissionId: request.clientSubmissionId,
    });
  });

  test("explicit retry can recover a current failed confirmation through the CAS path", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Safe retry" });
    const staged = await t.mutation((internal as any).ai.stageClarificationGroup, {
      userId: "turn-user",
      groupIdempotencyKey: "safe-failed-retry",
      sourceSurface: "chat",
      rawInput: "log an unclear meal",
      createdAt: Date.now(),
      members: [{
        actionType: "meal",
        memberIdempotencyKey: "safe-failed-retry-member",
        payload: { name: "Unclear meal", calories: -1, protein: 10, carbs: 30, fat: 10, date: "2026-07-16", time: "12:00", logSource: "chat" },
        provenance: "ai_extracted",
        confidence: 0.8,
        validation: { status: "valid", messages: [] },
        reversible: true,
        resolvedDate: "2026-07-16",
        resolvedTime: "12:00",
        ordinal: 0,
      }],
    });
    const action = await t.run((ctx) => ctx.db.query("actions").first());
    expect(action).toBeDefined();
    await t.mutation(internal.chat.addMessage, {
      userId: "turn-user",
      sessionId,
      role: "ai",
      content: "1 item needs review.",
      clientSubmissionId: "safe-failed-retry",
      turnContractVersion: 1,
      turnOutcome: "confirmation_required",
      turnCards: [{
        version: 1,
        kind: "confirmation",
        data: {
          groupId: String(staged.groupId),
          expiresAt: Date.now() + 60 * 60 * 1000,
          items: [{
            ordinal: 0,
            actionType: "meal",
            title: "Unclear meal",
            description: "Unclear meal",
            date: "2026-07-16",
            time: "12:00",
            actionId: String(action!._id),
            confidence: 0.8,
            validationMessages: [],
          }],
        },
      }],
      actionGroupId: staged.groupId,
      actionIds: [action!._id],
    });

    const first = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{ ordinal: 0, action: "confirm" }],
    }) as any;
    expect(first.status).toBe("failed");
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(0);

    const retry = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{
        ordinal: 0,
        action: "confirm",
        edits: { payload: { name: "Dal", calories: 220, protein: 12, carbs: 35, fat: 4, date: "2026-07-16", time: "13:00", logSource: "chat" } },
      }],
    }) as any;

    expect(retry.results[0].status).toBe("committed");
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
    const assistant = (await t.run((ctx) => ctx.db.query("chat_messages").collect())).find((message) => message.role === "ai");
    expect(assistant).toMatchObject({ turnOutcome: "committed", content: expect.stringContaining("Saved Dal") });
  });

  test("multi-item turns persist committed and failed per-item outcomes", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    mockTurn({
      reply: "Thanks for the update.",
      extraction: {
        isQuestion: false,
        items: [
          { type: "water", description: "500ml water", date: "2026-07-16" },
          { type: "mood", description: "mood was good", date: "2026-07-16" },
        ],
      },
      failMoodParse: true,
    });

    const result = await asUser.action(api.ai.chat, {
      message: "I drank 500ml water and my mood was good",
      today: "2026-07-16",
      clientSubmissionId: "partial-turn",
    }) as any;

    expect(result.outcome).toBe("committed");
    const resultCard = result.cards.find((card: any) => card.kind === "result");
    expect(resultCard.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "500ml water", status: "committed" }),
      expect.objectContaining({ title: "mood was good", status: "failed", retriable: true }),
    ]));
    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("mood_logs").collect())).toHaveLength(0);
  });

  test("outcome and cards reconstruct from persisted chat history alone", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Reload" });
    mockTurn({
      reply: "Hydration noted.",
      extraction: {
        isQuestion: false,
        items: [{ type: "water", description: "500ml water", date: "2026-07-16" }],
      },
    });

    await asUser.action(api.ai.chat, {
      message: "I drank 500ml water",
      today: "2026-07-16",
      sessionId,
      clientSubmissionId: "reload-turn",
    });

    const messages = await asUser.query(api.chat.getMessages, { sessionId });
    const assistant = messages.find((message) => message.role === "ai") as any;
    expect(assistant).toMatchObject({
      turnContractVersion: 1,
      turnOutcome: "committed",
      clientSubmissionId: "reload-turn",
      actionGroupId: expect.any(String),
      actionIds: [expect.any(String)],
    });
    expect(assistant.turnCards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        version: 1,
        kind: "result",
        data: expect.objectContaining({
          groupId: assistant.actionGroupId,
          items: [expect.objectContaining({
            status: "committed",
            actionId: assistant.actionIds[0],
            record: expect.objectContaining({ table: "water_logs", id: expect.any(String) }),
          })],
        }),
      }),
      expect.objectContaining({ version: 1, kind: "undo" }),
    ]));
  });

  test("retrying the same clientSubmissionId does not duplicate the domain record", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Retry" });
    mockTurn({
      reply: "Hydration noted.",
      extraction: {
        isQuestion: false,
        items: [{ type: "water", description: "500ml water", date: "2026-07-16" }],
      },
    });
    const request = {
      message: "I drank 500ml water",
      today: "2026-07-16",
      sessionId,
      clientSubmissionId: "same-retry",
    };

    await asUser.action(api.ai.chat, request);
    await asUser.action(api.ai.chat, request);

    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("actionGroups").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("actions").collect())).toHaveLength(1);
    const messages = await t.run((ctx) => ctx.db.query("chat_messages").collect());
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(messages.filter((message) => message.role === "ai")).toHaveLength(1);
  });

  test("pre-contract messages remain plain text without a fabricated outcome", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "turn-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "History" });
    await t.mutation(internal.chat.addMessage, {
      userId: "turn-user",
      sessionId,
      role: "ai",
      content: "Logged your old meal.",
    });

    expect(await asUser.query(api.chat.getMessages, { sessionId })).toEqual([{
      role: "ai",
      content: "Logged your old meal.",
    }]);
  });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";

vi.mock("./ai/llm", async () => {
  const actual = await vi.importActual<typeof import("./ai/llm")>("./ai/llm");
  return { ...actual, callAI: vi.fn() };
});

const mockedCallAI = vi.mocked(callAI);
const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

function promptText(messages: any[]): string {
  const content = messages?.[0]?.content;
  return typeof content === "string" ? content : "";
}

function waterExtraction() {
  return JSON.stringify({ isQuestion: false, items: [{ type: "water", description: "500ml water", date: "2026-07-16" }] });
}

function installWaterMock(options: { blocked?: boolean } = {}) {
  let started!: () => void;
  let release!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  let blocked = options.blocked ?? false;
  mockedCallAI.mockImplementation(async (_ctx, _userId, messages) => {
    if (!blocked) {
      blocked = true;
      started();
      await releasePromise;
    }
    const prompt = promptText(messages);
    if (prompt.includes("Extract ALL loggable items")) return waterExtraction();
    if (prompt.includes("Extract water amount in ml")) return "500";
    if (prompt.includes("Generate a short, descriptive title")) return "Water log";
    return "Got it.";
  });
  return { started: startedPromise, release };
}

function mealPayload(name: string, time: string) {
  return { name, calories: 400, protein: 20, carbs: 40, fat: 15, time, date: "2026-07-16", logSource: "test" };
}

async function stageGroup(t: ReturnType<typeof convexTest>, key: string, count = 2) {
  const userId = "concurrency-user";
  const { groupId } = await t.mutation((internal as any).ai.stageClarificationGroup, {
    userId,
    groupIdempotencyKey: key,
    sourceSurface: "chat",
    rawInput: key,
    createdAt: Date.now(),
    members: Array.from({ length: count }, (_, ordinal) => ({
      actionType: "meal",
      memberIdempotencyKey: `${key}-member-${ordinal}`,
      payload: mealPayload(`${key}-${ordinal}`, `${String(8 + ordinal).padStart(2, "0")}:00`),
      provenance: "ai_extracted",
      validation: { status: "valid", messages: [] },
      reversible: true,
      resolvedDate: "2026-07-16",
      resolvedTime: `${String(8 + ordinal).padStart(2, "0")}:00`,
      ordinal,
    })),
  });
  const actions = await t.run((ctx) => ctx.db.query("actions").collect()).then((rows) => rows.filter((row) => row.groupId === groupId));
  const { id: sessionId } = await t.withIdentity({ subject: userId }).mutation(api.chat.createSession, { title: key });
  await t.mutation(internal.chat.addMessage, {
    userId,
    sessionId,
    role: "ai",
    content: `${count} items still need review.`,
    clientSubmissionId: `${key}-submission`,
    turnContractVersion: 1,
    turnOutcome: "confirmation_required",
    turnCards: [{
      version: 1,
      kind: "confirmation",
      data: {
        groupId: String(groupId),
        expiresAt: Date.now() + 60 * 60 * 1000,
        items: actions.map((action) => ({
          ordinal: action.payload._confirmationOrdinal,
          actionType: "meal",
          title: action.payload.name,
          description: action.payload.name,
          date: action.resolvedDate,
          time: action.resolvedTime,
          actionId: String(action._id),
          validationMessages: [],
        })),
      },
    }],
    actionGroupId: groupId,
    actionIds: actions.map((action) => action._id),
  });
  return { userId, groupId, sessionId, actions };
}

async function publicAssistant(t: ReturnType<typeof convexTest>, sessionId: any) {
  const messages = await t.withIdentity({ subject: "concurrency-user" }).query(api.chat.getMessages, { sessionId });
  return messages.find((message) => message.role === "ai") as any;
}

describe("chat logging concurrency invariants", () => {
  beforeEach(() => mockedCallAI.mockReset());
  afterEach(() => {
    delete process.env.HOME_CHAT_AUTO_COMMIT;
  });

  test("overlapping same-ID Coach requests execute one pipeline and persist one outcome", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "coach-overlap-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Coach overlap" });
    const barrier = installWaterMock();
    const request = { message: "I drank 500ml water", sessionId, today: "2026-07-16", clientSubmissionId: "coach-overlap" };
    const first = asUser.action(api.ai.chat, request);
    await barrier.started;
    const callsAtBarrier = mockedCallAI.mock.calls.length;
    await expect(asUser.action(api.ai.chat, request)).rejects.toThrow("already in progress");
    expect(mockedCallAI).toHaveBeenCalledTimes(callsAtBarrier);
    barrier.release();
    const firstResult = await first as any;

    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(1);
    const messages = await asUser.query(api.chat.getMessages, { sessionId });
    expect(messages.filter((message) => message.role === "ai")).toHaveLength(1);
    expect(firstResult.outcome).toBe("committed");
    expect(messages.find((message) => message.role === "ai")?.turnOutcome).toBe("committed");
  });

  test("overlapping same-ID Home requests execute one pipeline and persist one outcome", async () => {
    process.env.HOME_CHAT_AUTO_COMMIT = "true";
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "home-overlap-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Home overlap" });
    const barrier = installWaterMock();
    const request = { message: "I drank 500ml water", sessionId, today: "2026-07-16", clientSubmissionId: "home-overlap" };
    const first = asUser.action(api.ai.homepageInput, request);
    await barrier.started;
    const callsAtBarrier = mockedCallAI.mock.calls.length;
    await expect(asUser.action(api.ai.homepageInput, request)).rejects.toThrow("already in progress");
    expect(mockedCallAI).toHaveBeenCalledTimes(callsAtBarrier);
    barrier.release();
    const firstResult = await first as any;

    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(1);
    const history = await asUser.query(api.chat.getMessages, { sessionId });
    expect(history.filter((message) => message.role === "ai")).toHaveLength(1);
    expect(firstResult.outcome).toBe("committed");
    expect(history.find((message) => message.role === "ai")?.turnOutcome).toBe("committed");
  });

  test("concurrent confirmation of disjoint members reconciles every committed member", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const { groupId, sessionId, actions } = await stageGroup(t, "confirm-disjoint");
    await Promise.all([
      asUser.action(api.ai.confirmGroup, { groupId, decisions: [{ ordinal: 0, action: "confirm" }] }),
      asUser.action(api.ai.confirmGroup, { groupId, decisions: [{ ordinal: 1, action: "confirm" }] }),
    ]);

    expect((await t.run((ctx) => ctx.db.query("meals").collect()))).toHaveLength(2);
    expect((await t.run((ctx) => ctx.db.query("actions").collect()).then((rows) => rows.filter((row) => row.groupId === groupId))).map((action) => action.status)).toEqual(["committed", "committed"]);
    const assistant = await publicAssistant(t, sessionId);
    expect(assistant.turnOutcome).toBe("committed");
    expect(assistant.actionIds).toEqual(expect.arrayContaining(actions.map((action) => action._id)));
    expect(assistant.turnCards.find((card: any) => card.kind === "result").data.items).toHaveLength(2);
  });

  test("concurrent log-anyway and confirmation reconcile all committed members", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const staged = await stageGroup(t, "mixed-recovery");
    const actions = await t.run((ctx) => ctx.db.query("actions").collect()).then((rows) => rows.filter((row) => row.groupId === staged.groupId));
    await Promise.all(actions.map((action) => t.mutation((internal as any).ai.recordConfirmationMemberFailure, { actionId: action._id, error: "Looks like a duplicate" })));
    const duplicateCard = {
      version: 1,
      kind: "duplicate" as const,
      data: {
        groupId: String(staged.groupId),
        items: [{ ordinal: 0, actionType: "meal" as const, title: actions[0].payload.name, description: actions[0].payload.name, date: actions[0].resolvedDate, time: actions[0].resolvedTime, actionId: String(actions[0]._id), reason: "Log anyway" }],
      },
    };
    const failureCard = {
      version: 1,
      kind: "failure" as const,
      data: {
        groupId: String(staged.groupId), code: "TURN_FAILED", message: "No items were saved.", retriable: true,
        items: actions.map((action) => ({ ordinal: action.payload._confirmationOrdinal, actionType: "meal" as const, title: action.payload.name, description: action.payload.name, date: action.resolvedDate, time: action.resolvedTime, actionId: String(action._id), reason: "failed" })),
      },
    };
    const existingMessage = await t.run((ctx) => ctx.db.query("chat_messages").collect()).then((rows) => rows.find((row) => row.actionGroupId === staged.groupId));
    await t.run(async (ctx) => {
      if (!existingMessage) throw new Error("Missing staged assistant message");
      await ctx.db.patch(existingMessage._id, {
        content: "I couldn't save that. Please try again.",
        turnOutcome: "failed",
        turnCards: [duplicateCard, failureCard],
      });
    });
    await t.mutation((internal as any).ai.finalizeConfirmationGroup, { groupId: staged.groupId });

    await Promise.all([
      asUser.action(api.ai.logAnywayForAction, { actionId: actions[0]._id }),
      asUser.action(api.ai.confirmGroup, { groupId: staged.groupId, decisions: [{ ordinal: 1, action: "confirm" }] }),
    ]);

    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(2);
    const assistant = await publicAssistant(t, staged.sessionId);
    expect(assistant.turnOutcome).toBe("committed");
    expect(assistant.turnCards.find((card: any) => card.kind === "result").data.items).toHaveLength(2);
    expect(assistant.turnCards).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "duplicate" })]));
  });

  test("undo interleaved with reconciliation cannot restore an available undo or active result", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const { groupId, sessionId, actions } = await stageGroup(t, "undo-race");
    await asUser.action(api.ai.confirmGroup, { groupId, decisions: actions.map((_, ordinal) => ({ ordinal, action: "confirm" as const })) });

    await Promise.all([
      asUser.mutation((api as any).actions_undo.undoAction, { actionId: actions[0]._id }),
      asUser.action(api.ai.confirmGroup, { groupId, decisions: [{ ordinal: 1, action: "confirm" }] }),
    ]);

    const storedActions = await t.run((ctx) => ctx.db.query("actions").collect()).then((rows) => rows.filter((row) => row.groupId === groupId));
    expect(storedActions.find((action) => action._id === actions[0]._id)?.status).toBe("undone");
    const assistant = await publicAssistant(t, sessionId);
    const resultItems = assistant.turnCards.find((card: any) => card.kind === "result")?.data.items ?? [];
    const undoItems = assistant.turnCards.find((card: any) => card.kind === "undo")?.data.items ?? [];
    expect(resultItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ actionId: String(actions[0]._id) })]));
    expect(undoItems).toEqual(expect.arrayContaining([expect.objectContaining({ actionId: String(actions[0]._id), state: "undone" })]));
    expect(undoItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ actionId: String(actions[0]._id), state: "available" })]));
  });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";
import { CONFIRMATION_TTL_MS } from "./actions_envelope";

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

function installWaterMock() {
  let started!: () => void;
  let release!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  let blocked = false;
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

async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for deterministic test barrier");
}

function mealPayload(name: string, time: string) {
  return { name, calories: 400, protein: 20, carbs: 40, fat: 15, time, date: "2026-07-16", logSource: "test" };
}

async function stageGroup(t: ReturnType<typeof convexTest>, key: string, count = 2, createdAt = Date.now()) {
  const userId = "concurrency-user";
  const { groupId } = await t.mutation((internal as any).ai.stageClarificationGroup, {
    userId,
    groupIdempotencyKey: key,
    sourceSurface: "chat",
    rawInput: key,
    createdAt,
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
  const actions = await t.run((ctx) => ctx.db.query("actions").collect())
    .then((rows) => rows.filter((row) => row.groupId === groupId).sort((a, b) => (a.payload._confirmationOrdinal ?? 0) - (b.payload._confirmationOrdinal ?? 0)));
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
        expiresAt: Date.now() + CONFIRMATION_TTL_MS,
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

function clearTestBarriers() {
  delete process.env.HOME_CHAT_AUTO_COMMIT;
  delete process.env.STRIDE_CHAT_RECONCILE_BARRIER;
  delete process.env.STRIDE_CHAT_CONTEXT_BARRIER;
}

describe("chat logging concurrency invariants", () => {
  beforeEach(() => mockedCallAI.mockReset());
  afterEach(clearTestBarriers);

  test("expired lease takeover fences stale Coach/Home owners and context failure finalizes", async () => {
    for (const surface of ["coach", "home"] as const) {
      if (surface === "home") process.env.HOME_CHAT_AUTO_COMMIT = "true";
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: `${surface}-lease-user` });
      const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: `${surface} lease` });
      const barrier = installWaterMock();
      const request = { message: "I drank 500ml water", sessionId, today: "2026-07-16", clientSubmissionId: `${surface}-lease` };
      const first = surface === "coach" ? asUser.action(api.ai.chat, request) : asUser.action(api.ai.homepageInput, request);
      await barrier.started;
      await waitFor(
        () => t.run((ctx) => ctx.db.query("chat_messages").collect()),
        (rows) => rows.some((row) => row.clientSubmissionId === request.clientSubmissionId && row.role === "user"),
      );
      await t.run(async (ctx) => {
        const row = (await ctx.db.query("chat_messages").collect()).find((candidate) => candidate.clientSubmissionId === request.clientSubmissionId && candidate.role === "user");
        if (!row) throw new Error("Missing claimed user row");
        await ctx.db.patch(row._id, { processingLeaseExpiresAt: Date.now() - 1 } as any);
      });
      process.env.STRIDE_CHAT_RECONCILE_BARRIER = "paused";
      barrier.release();
      await waitFor(() => t.run((ctx) => ctx.db.query("water_logs").collect()), (rows) => rows.length === 1);
      const takeover = surface === "coach" ? asUser.action(api.ai.chat, request) : asUser.action(api.ai.homepageInput, request);
      await waitFor(
        () => t.run((ctx) => ctx.db.query("chat_messages").collect()),
        (rows) => rows.some((row: any) => row.clientSubmissionId === request.clientSubmissionId && row.role === "user" && row.processingLeaseVersion === 2),
      );
      process.env.STRIDE_CHAT_RECONCILE_BARRIER = "released";
      const [staleResult, takeoverResult] = await Promise.allSettled([first, takeover]);
      expect(staleResult.status).toBe("rejected");
      expect(takeoverResult.status).toBe("fulfilled");
      expect((takeoverResult as PromiseFulfilledResult<any>).value.outcome).toBe("committed");
      expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(1);
      const messages = await asUser.query(api.chat.getMessages, { sessionId });
      expect(messages.filter((message) => message.role === "ai")).toHaveLength(1);
      expect(messages.find((message) => message.role === "ai")?.turnOutcome).toBe("committed");
      clearTestBarriers();
    }

    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "context-failure-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Context failure" });
    process.env.STRIDE_CHAT_CONTEXT_BARRIER = "paused";
    const request = { message: "I drank 500ml water", sessionId, today: "2026-07-16", clientSubmissionId: "context-failure" };
    const pending = asUser.action(api.ai.chat, request);
    await waitFor(
      () => t.run((ctx) => ctx.db.query("chat_messages").collect()),
      (rows) => rows.some((row) => row.clientSubmissionId === request.clientSubmissionId && row.role === "user"),
    );
    await t.run((ctx) => ctx.db.insert("chat_messages", { userId: "context-failure-user", sessionId, role: "user", content: "x".repeat(4_001) }));
    process.env.STRIDE_CHAT_CONTEXT_BARRIER = "released";
    const result = await pending as any;
    expect(result.outcome).toBe("failed");
    const messages = await asUser.query(api.chat.getMessages, { sessionId });
    expect(messages.filter((message) => message.role === "ai")).toHaveLength(1);
    expect(messages.find((message) => message.role === "ai")?.turnOutcome).toBe("failed");
  });

  test("submission fingerprints reject image, date, and clarification-group mismatches", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "fingerprint-user" });
    const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Fingerprint" });
    const barrier = installWaterMock();
    const base = { message: "I drank 500ml water", sessionId, today: "2026-07-16", clientSubmissionId: "fingerprint" };
    const first = asUser.action(api.ai.chat, base);
    await barrier.started;
    barrier.release();
    await first;
    const group = await stageGroup(t, "fingerprint-group", 1);
    const image = "data:image/png;base64,AA==";
    await expect(asUser.action(api.ai.chat, { ...base, image })).rejects.toThrow("different request details");
    await expect(asUser.action(api.ai.chat, { ...base, today: "2026-07-17" })).rejects.toThrow("different request details");
    await expect(asUser.action(api.ai.chat, { ...base, clarificationGroupId: group.groupId })).rejects.toThrow("different request details");
    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(1);
  });

  test("disjoint confirmations pause after writes and both return the canonical reload snapshot", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const { groupId, sessionId, actions } = await stageGroup(t, "confirm-disjoint");
    process.env.STRIDE_CHAT_RECONCILE_BARRIER = "paused";
    const first = asUser.action(api.ai.confirmGroup, { groupId, decisions: [{ ordinal: 0, action: "confirm" }] });
    const second = asUser.action(api.ai.confirmGroup, { groupId, decisions: [{ ordinal: 1, action: "confirm" }] });
    await waitFor(() => t.run((ctx) => ctx.db.query("meals").collect()), (rows) => rows.length === 2);
    process.env.STRIDE_CHAT_RECONCILE_BARRIER = "released";
    const [resolvedFirst, resolvedSecond] = await Promise.all([first, second]) as any;
    const assistant = await publicAssistant(t, sessionId);
    for (const result of [resolvedFirst, resolvedSecond]) {
      expect(result.turn).toMatchObject({ content: assistant.content, turnOutcome: assistant.turnOutcome, actionGroupId: groupId, actionIds: assistant.actionIds });
      expect(result.results.map((item: any) => item.status)).toEqual(expect.arrayContaining(["committed", "committed"]));
      expect(result.loggedItems).toHaveLength(2);
    }
    expect((await t.run((ctx) => ctx.db.query("actions").collect()).then((rows) => rows.filter((row) => row.groupId === groupId))).map((action) => action.status)).toEqual(["committed", "committed"]);
    expect(assistant.turnCards.find((card: any) => card.kind === "result").data.items).toHaveLength(actions.length);
    expect((await asUser.query(api.chat.getMessages, { sessionId })).find((message) => message.role === "ai")).toMatchObject({ turnOutcome: "committed", content: assistant.content });
  });

  test("log-anyway and confirmation both return the canonical post-write outcome", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const staged = await stageGroup(t, "mixed-recovery");
    const actions = await t.run((ctx) => ctx.db.query("actions").collect()).then((rows) => rows.filter((row) => row.groupId === staged.groupId));
    await Promise.all(actions.map((action) => t.mutation((internal as any).ai.recordConfirmationMemberFailure, { actionId: action._id, error: "Looks like a duplicate" })));
    const existingMessage = await t.run((ctx) => ctx.db.query("chat_messages").collect()).then((rows) => rows.find((row) => row.actionGroupId === staged.groupId));
    await t.run(async (ctx) => {
      if (!existingMessage) throw new Error("Missing staged assistant message");
      const duplicateCard = {
        version: 1,
        kind: "duplicate",
        data: {
          groupId: String(staged.groupId),
          items: actions.map((action) => ({
            ordinal: action.payload._confirmationOrdinal,
            actionType: "meal",
            title: action.payload.name,
            description: action.payload.name,
            date: action.resolvedDate,
            time: action.resolvedTime,
            actionId: String(action._id),
            reason: "Log anyway",
          })),
        },
      };
      await ctx.db.patch(existingMessage._id, { content: "I couldn't save that. Please try again.", turnOutcome: "failed", turnCards: [duplicateCard] } as any);
    });
    await t.mutation((internal as any).ai.finalizeConfirmationGroup, { groupId: staged.groupId });
    process.env.STRIDE_CHAT_RECONCILE_BARRIER = "paused";
    const logAnyway = asUser.action(api.ai.logAnywayForAction, { actionId: actions[0]._id });
    const confirm = asUser.action(api.ai.confirmGroup, { groupId: staged.groupId, decisions: [{ ordinal: 1, action: "confirm" }] });
    await waitFor(() => t.run((ctx) => ctx.db.query("meals").collect()), (rows) => rows.length === 2);
    process.env.STRIDE_CHAT_RECONCILE_BARRIER = "released";
    const [logResult, confirmResult] = await Promise.all([logAnyway, confirm]) as any;
    const assistant = await publicAssistant(t, staged.sessionId);
    expect(logResult.turn).toMatchObject({ content: assistant.content, turnOutcome: assistant.turnOutcome, actionIds: assistant.actionIds });
    expect(confirmResult.turn).toMatchObject({ content: assistant.content, turnOutcome: assistant.turnOutcome, actionIds: assistant.actionIds });
    expect(assistant.turnCards.some((card: any) => card.kind === "duplicate")).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(2);
  });

  test("clarification/undo interleaving returns only the canonical undone state", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const { groupId, sessionId, actions } = await stageGroup(t, "undo-race");
    await asUser.action(api.ai.confirmGroup, { groupId, decisions: actions.map((_, ordinal) => ({ ordinal, action: "confirm" as const })) });
    process.env.STRIDE_CHAT_RECONCILE_BARRIER = "paused";
    const confirming = asUser.action(api.ai.confirmGroup, { groupId, decisions: [{ ordinal: 1, action: "confirm" }] });
    await waitFor(() => t.run((ctx) => ctx.db.query("actions").collect()), (rows) => rows.some((row) => row._id === actions[1]._id && row.status === "committed"));
    const undo = await asUser.mutation((api as any).actions_undo.undoAction, { actionId: actions[0]._id });
    process.env.STRIDE_CHAT_RECONCILE_BARRIER = "released";
    const confirmed = await confirming as any;
    expect(undo.status).toBe("undone");
    const assistant = await publicAssistant(t, sessionId);
    expect(confirmed.turn).toMatchObject({ content: assistant.content, turnCards: assistant.turnCards });
    const resultItems = assistant.turnCards.find((card: any) => card.kind === "result")?.data.items ?? [];
    const undoItems = assistant.turnCards.find((card: any) => card.kind === "undo")?.data.items ?? [];
    expect(resultItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ actionId: String(actions[0]._id), status: "committed" })]));
    expect(undoItems).toEqual(expect.arrayContaining([expect.objectContaining({ actionId: String(actions[0]._id), state: "undone" })]));
    expect(undoItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ actionId: String(actions[0]._id), state: "available" })]));
  });

  test("mixed discarded/expired and duplicate-expired groups render resolved canonical cards", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "concurrency-user" });
    const mixed = await stageGroup(t, "mixed-resolved", 3);
    await asUser.action(api.ai.confirmGroup, { groupId: mixed.groupId, decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "discard" }] });
    await t.run((ctx) => ctx.db.patch(mixed.groupId, { createdAt: Date.now() - CONFIRMATION_TTL_MS - 1 }));
    const mixedResult = await asUser.action(api.ai.confirmGroup, { groupId: mixed.groupId, decisions: [{ ordinal: 2, action: "confirm" }] }) as any;
    const mixedAssistant = await publicAssistant(t, mixed.sessionId);
    const mixedItems = mixedAssistant.turnCards.find((card: any) => card.kind === "result")?.data.items ?? [];
    expect(mixedResult.turn.turnCards).toEqual(mixedAssistant.turnCards);
    expect(mixedItems.map((item: any) => item.status).sort()).toEqual(["committed", "discarded", "expired"]);
    expect(mixedAssistant.turnCards.some((card: any) => card.kind === "confirmation" && card.data.state !== "resolved")).toBe(false);
    expect(mixedAssistant.turnCards.some((card: any) => card.kind === "duplicate")).toBe(false);

    const expired = await stageGroup(t, "all-expired", 2, Date.now() - CONFIRMATION_TTL_MS - 1);
    const expiredResult = await asUser.action(api.ai.confirmGroup, { groupId: expired.groupId, decisions: [{ ordinal: 0, action: "confirm" }] }) as any;
    const expiredAssistant = await publicAssistant(t, expired.sessionId);
    expect(expiredResult.status).toBe("expired");
    expect(expiredAssistant.turnOutcome).toBe("no_action");
    expect(expiredAssistant.turnCards).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "confirmation", data: expect.objectContaining({ state: "resolved" }) })]));
    expect(expiredAssistant.turnCards).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "duplicate" })]));
  });
});

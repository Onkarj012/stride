import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";
import { deriveGroupKey, deriveMemberKey } from "./actions_idempotency";

vi.mock("./ai/llm", async () => {
  const actual = await vi.importActual<typeof import("./ai/llm")>("./ai/llm");
  return { ...actual, callAI: vi.fn() };
});

const mockedCallAI = vi.mocked(callAI);
const modules = import.meta.glob("./**/*.*s");

async function setupDuplicateTurn(t: ReturnType<typeof convexTest>, userId = "log-anyway-owner") {
  const asUser = t.withIdentity({ subject: userId });
  const date = "2026-07-16";
  await t.run((ctx) => ctx.db.insert("meals", {
    userId,
    date,
    name: "Oats",
    calories: 300,
    protein: 12,
    carbs: 45,
    fat: 8,
    time: "08:00",
    logSource: "manual",
  }));
  const { id: sessionId } = await asUser.mutation(api.chat.createSession, { title: "Duplicate recovery" });
  const clientSubmissionId = `${userId}-duplicate-turn`;
  const rawInput = "I ate oats again";
  const groupIdempotencyKey = deriveGroupKey({
    userId,
    sourceSurface: "chat",
    rawInput,
    clientSubmissionId,
  });
  const payload = {
    name: "Oats",
    calories: 300,
    protein: 12,
    carbs: 45,
    fat: 8,
    time: "08:05",
    date,
    logSource: "chat",
  };
  const memberIdempotencyKey = deriveMemberKey({
    groupKey: groupIdempotencyKey,
    actionType: "meal",
    payloadFingerprint: JSON.stringify(payload),
    ordinal: 0,
  });
  const staged = await t.mutation(internal.ai.stageClarificationGroup, {
    userId,
    groupIdempotencyKey,
    sourceSurface: "chat",
    rawInput,
    clientLocalDate: date,
    createdAt: Date.now(),
    members: [{
      actionType: "meal",
      memberIdempotencyKey,
      payload,
      provenance: "ai_extracted",
      confidence: 0.95,
      validation: { status: "valid", messages: [] },
      reversible: true,
      resolvedDate: date,
      resolvedTime: payload.time,
      ordinal: 0,
    }],
  });
  const action = (await t.run((ctx) => ctx.db.query("actions").collect()))
    .find((candidate) => candidate.groupId === staged.groupId);
  if (!action) throw new Error("Test action was not staged");
  await expect(t.mutation(internal.actions_writer.writeMealAction, {
    group: {
      userId,
      groupIdempotencyKey,
      clientSubmissionId,
      sourceSurface: "chat",
      rawInput,
      clientLocalDate: date,
    },
    member: {
      memberIdempotencyKey,
      payload,
      provenance: "ai_extracted",
      confidence: 0.95,
      validation: { status: "valid", messages: [] },
      reversible: true,
      resolvedDate: date,
      resolvedTime: payload.time,
    },
  })).rejects.toThrow("NEAR_DUPLICATE");
  const reason = "Looks like you already logged this — log anyway?";
  await t.mutation(internal.ai.recordConfirmationMemberFailure, {
    actionId: action._id,
    error: reason,
  });
  await t.mutation(internal.ai.finalizeConfirmationGroup, { groupId: staged.groupId });
  await t.mutation(internal.chat.addMessage, {
    userId,
    sessionId,
    role: "ai",
    content: "I couldn't save that. Please try again.",
    clientSubmissionId,
    turnContractVersion: 1,
    turnOutcome: "failed",
    turnCards: [
      {
        version: 1,
        kind: "duplicate",
        data: {
          groupId: String(staged.groupId),
          items: [{
            ordinal: 0,
            actionType: "meal",
            title: "Oats",
            description: "Oats",
            date,
            time: payload.time,
            actionId: String(action._id),
            reason,
          }],
        },
      },
      {
        version: 1,
        kind: "failure",
        data: {
          groupId: String(staged.groupId),
          code: "TURN_FAILED",
          message: "No items were saved.",
          retriable: true,
          items: [{
            ordinal: 0,
            actionType: "meal",
            title: "Oats",
            description: "Oats",
            date,
            time: payload.time,
            actionId: String(action._id),
            reason,
          }],
        },
      },
    ],
    actionGroupId: staged.groupId,
    actionIds: [action._id],
  });
  return { asUser, sessionId, actionId: action._id, groupId: staged.groupId };
}

describe("duplicate log-anyway recovery", () => {
  beforeEach(() => mockedCallAI.mockReset());

  test("owner can log anyway and exactly one new domain record is committed", async () => {
    const t = convexTest(schema, modules);
    const { asUser, actionId, groupId } = await setupDuplicateTurn(t);

    const result = await asUser.action(api.ai.logAnywayForAction, { actionId }) as any;

    expect(result).toMatchObject({
      actionId,
      actionGroupId: groupId,
      status: "committed",
      record: { table: "meals", id: expect.any(String) },
    });
    const meals = await t.run((ctx) => ctx.db.query("meals").collect());
    expect(meals).toHaveLength(2);
    expect(meals.filter((meal) => meal.sourceActionId === String(actionId))).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(actionId))).toMatchObject({
      status: "committed",
      committedRowRef: result.record,
    });
  });

  test("calling log anyway twice with the same action does not create another domain record", async () => {
    const t = convexTest(schema, modules);
    const { asUser, actionId } = await setupDuplicateTurn(t);

    const first = await asUser.action(api.ai.logAnywayForAction, { actionId }) as any;
    const second = await asUser.action(api.ai.logAnywayForAction, { actionId }) as any;

    expect(second.record).toEqual(first.record);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(2);
    expect((await t.run((ctx) => ctx.db.query("meals").collect()))
      .filter((meal) => meal.sourceActionId === String(actionId))).toHaveLength(1);
  });

  test("a different user is rejected without writing anything", async () => {
    const t = convexTest(schema, modules);
    const { actionId } = await setupDuplicateTurn(t);
    const asOtherUser = t.withIdentity({ subject: "log-anyway-other" });

    await expect(asOtherUser.action(api.ai.logAnywayForAction, { actionId })).rejects.toThrow("Not found");

    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(actionId))).toMatchObject({ status: "failed" });
  });

  test("success persists a reconstructable resolved result turn and returns the same state", async () => {
    const t = convexTest(schema, modules);
    const { asUser, sessionId, actionId, groupId } = await setupDuplicateTurn(t);

    const result = await asUser.action(api.ai.logAnywayForAction, { actionId }) as any;
    const messages = await asUser.query(api.chat.getMessages, { sessionId });
    const assistant = messages.find((message) => message.role === "ai") as any;

    expect(assistant).toMatchObject({
      content: result.turn.content,
      turnContractVersion: 1,
      turnOutcome: "committed",
      actionGroupId: groupId,
      actionIds: [actionId],
    });
    expect(assistant.turnCards).toEqual(result.turn.turnCards);
    expect(assistant.turnCards).not.toContainEqual(expect.objectContaining({ kind: "duplicate" }));
    expect(assistant.turnCards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "result",
        data: expect.objectContaining({
          groupId,
          items: [expect.objectContaining({
            status: "committed",
            actionId,
            record: result.record,
          })],
        }),
      }),
      expect.objectContaining({ kind: "undo" }),
    ]));
  });
});

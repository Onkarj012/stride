import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { callAI } from "./ai/llm";
import { AUTO_WRITE_MAX_ACTIONS, CONFIRMATION_TTL_MS } from "./actions_envelope";

vi.mock("./ai/llm", async () => {
  const actual = await vi.importActual<typeof import("./ai/llm")>("./ai/llm");
  return { ...actual, callAI: vi.fn() };
});

const mockedCallAI = vi.mocked(callAI);
const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

function waterMarker(count: number) {
  return `⟦LOG_WATER⟧${JSON.stringify({ ml: count, date: "2026-07-16" })}⟦/LOG_WATER⟧`;
}

function mealPayload(name: string, date = "2026-07-16") {
  return { name, calories: 400, protein: 20, carbs: 40, fat: 15, time: "08:00", date, logSource: "test" };
}

async function stageGroup(t: ReturnType<typeof convexTest>, key: string, payloads: any[], createdAt = Date.now()) {
  return t.mutation((internal as any).ai.stageClarificationGroup, {
    userId: "confirm-user",
    groupIdempotencyKey: key,
    sourceSurface: "chat",
    rawInput: key,
    createdAt,
    members: payloads.map((payload, ordinal) => ({
      actionType: "meal",
      memberIdempotencyKey: `${key}-${ordinal}`,
      payload,
      provenance: "ai_extracted",
      validation: { status: "valid", messages: [] },
      reversible: true,
      resolvedDate: payload.date,
      resolvedTime: payload.time,
      ordinal,
    })),
  });
}

describe("large-batch confirmation", () => {
  beforeEach(() => mockedCallAI.mockReset());

  test("writes exactly the four-action boundary automatically", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    mockedCallAI.mockResolvedValue([
      "Logged it.",
      waterMarker(500),
      "⟦LOG_SLEEP⟧{\"hours\":7,\"quality\":\"good\",\"date\":\"2026-07-16\"}⟦/LOG_SLEEP⟧",
      "⟦LOG_MOOD⟧{\"rating\":4,\"date\":\"2026-07-16\"}⟦/LOG_MOOD⟧",
      "⟦LOG_STEPS⟧{\"count\":8000,\"date\":\"2026-07-16\"}⟦/LOG_STEPS⟧",
    ].join(""));

    const result = await asUser.action(api.ai.chat, { message: `four ${AUTO_WRITE_MAX_ACTIONS}`, today: "2026-07-16" }) as any;
    expect(result.confirmation).toBeUndefined();
    expect(result.loggedItem.type).toBe("multiple");
    expect(await t.run((ctx) => ctx.db.query("actions").collect())).toHaveLength(AUTO_WRITE_MAX_ACTIONS);
    expect(await t.run((ctx) => ctx.db.query("actionGroups").collect())).toMatchObject([ { status: "committed" } ]);
  });

  test("stages five valid actions without writing any domain rows", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    mockedCallAI.mockResolvedValue(Array.from({ length: AUTO_WRITE_MAX_ACTIONS + 1 }, (_, i) => waterMarker(500 + i)).join(""));

    const result = await asUser.action(api.ai.chat, { message: "five logs", today: "2026-07-16" }) as any;
    expect(result.confirmation.items).toHaveLength(AUTO_WRITE_MAX_ACTIONS + 1);
    expect(result.confirmation.items[0]).toEqual(expect.objectContaining({ ordinal: 0, provenance: "ai_extracted", validation: { status: "valid", messages: [] } }));
    expect(await t.run((ctx) => ctx.db.query("actions").collect())).toHaveLength(AUTO_WRITE_MAX_ACTIONS + 1);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("water_logs").collect())).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.query("actionGroups").collect()))[0].status).toBe("pending");
  });

  test("confirm-all commits every member through canonical writers", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "confirm-all", [mealPayload("one"), mealPayload("two", "2026-07-15")]);
    const result = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [0, 1].map((ordinal) => ({ ordinal, action: "confirm" })),
    }) as any;
    expect(result.status).toBe("committed");
    expect(result.results.map((item: any) => item.status)).toEqual(["committed", "committed"]);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(2);
  });

  test("supports partial confirmation and discard decisions", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "partial-decisions", [mealPayload("keep"), mealPayload("discard")]);
    const result = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "discard" }],
    }) as any;
    expect(result.status).toBe("partial");
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.query("actions").collect())).map((action) => action.status).sort()).toEqual(["committed", "discarded"]);
  });

  test("records one member failure and continues sibling commits", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "partial-failure", [mealPayload("good"), { name: "bad" }]);
    const result = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "confirm" }],
    }) as any;
    expect(result.status).toBe("partial");
    expect(result.unresolvedItems).toEqual([expect.objectContaining({ ordinal: 1, status: "failed" })]);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
    const failed = (await t.run((ctx) => ctx.db.query("actions").collect())).find((action) => action.status === "failed");
    expect(failed?.validation).toMatchObject({ status: "error" });
    expect(failed?.validation.messages.length).toBeGreaterThan(0);
  });

  test("reconfirming an already committed member is a no-op", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "reconfirm", [mealPayload("once")]);
    const decision = { groupId: staged.groupId, decisions: [{ ordinal: 0, action: "confirm" as const }] };
    await asUser.action((api as any).ai.confirmGroup, decision);
    const repeated = await asUser.action((api as any).ai.confirmGroup, decision) as any;
    expect(repeated.results[0].status).toBe("already_committed");
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
  });

  test("reconfirming an undone member keeps the terminal group committed", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "reconfirm-undone", [mealPayload("once")]);
    const decision = { groupId: staged.groupId, decisions: [{ ordinal: 0, action: "confirm" as const }] };
    await asUser.action((api as any).ai.confirmGroup, decision);
    const action = await t.run((ctx) => ctx.db.query("actions").first());
    await asUser.mutation((api as any).actions_undo.undoAction, { actionId: action!._id });
    const repeated = await asUser.action((api as any).ai.confirmGroup, decision) as any;
    expect(repeated.status).toBe("committed");
    expect(await t.run((ctx) => ctx.db.get(staged.groupId))).toMatchObject({ status: "committed" });
  });

  test("confirmation edits cannot inject server-only undo metadata", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await t.mutation((internal as any).ai.stageClarificationGroup, {
      userId: "confirm-user",
      groupIdempotencyKey: "forged-previous",
      sourceSurface: "chat",
      rawInput: "water",
      createdAt: Date.now(),
      members: [{
        actionType: "recovery",
        memberIdempotencyKey: "forged-previous-member",
        payload: { kind: "water", ml: 500, time: "08:00", date: "2026-07-16" },
        provenance: "ai_extracted",
        validation: { status: "valid", messages: [] },
        reversible: true,
        ordinal: 0,
      }],
    });
    const result = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{
        ordinal: 0,
        action: "confirm",
        edits: {
          payload: {
            ml: 750,
            previous: { userId: "confirm-user", date: "2026-07-16", ml: 999, time: "00:00", source: "forged" },
          },
        },
      }],
    }) as any;
    expect(result.status).toBe("committed");
    const action = await t.run((ctx) => ctx.db.query("actions").first());
    expect(action?.payload?.previous).toBeUndefined();
    const undone = await asUser.mutation((api as any).actions_undo.undoAction, { actionId: action!._id });
    expect(undone.status).toBe("undone");
    expect(await t.run((ctx) => ctx.db.query("water_logs").first())).toMatchObject({ ml: 750, undoneAt: expect.any(Number) });
  });

  test("expires stale confirmation groups and refuses commits", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "expired", [mealPayload("too late")], Date.now() - CONFIRMATION_TTL_MS - 1);
    const result = await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{ ordinal: 0, action: "confirm" }],
    }) as any;
    expect(result.status).toBe("expired");
    expect(await t.run((ctx) => ctx.db.get(staged.groupId))).toMatchObject({ status: "expired" });
    expect((await t.run((ctx) => ctx.db.query("actions").collect()))[0].status).toBe("expired");
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(0);
  });

  test("expires stale partial groups before resolving clarification", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "expired-partial", [mealPayload("saved"), { name: "failed" }]);
    await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "confirm" }],
    });
    await t.run((ctx) => ctx.db.patch(staged.groupId, { createdAt: Date.now() - CONFIRMATION_TTL_MS - 1 }));

    await expect(asUser.action((api as any).ai.resolveClarification, {
      groupId: staged.groupId,
      date: "2026-07-16",
    })).rejects.toThrow("This confirmation has expired");
    expect(await t.run((ctx) => ctx.db.get(staged.groupId))).toMatchObject({ status: "expired" });
    expect((await t.run((ctx) => ctx.db.query("actions").collect())).map((action) => action.status).sort()).toEqual(["committed", "expired"]);
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
  });

  test("group undo after partial confirmation reverses only committed members", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "confirm-user" });
    const staged = await stageGroup(t, "partial-undo", [mealPayload("undo me"), { name: "still failed" }]);
    await asUser.action((api as any).ai.confirmGroup, {
      groupId: staged.groupId,
      decisions: [{ ordinal: 0, action: "confirm" }, { ordinal: 1, action: "confirm" }],
    });
    const actions = await t.run((ctx) => ctx.db.query("actions").collect());
    const undo = await asUser.mutation((api as any).actions_undo.undoGroup, { groupId: staged.groupId });
    expect(undo.results).toHaveLength(2);
    expect(undo.results.find((item: any) => item.status === "undone")).toBeDefined();
    expect(undo.results.find((item: any) => item.status === "skipped")).toBeDefined();
    expect((await t.run((ctx) => ctx.db.get(actions[0]._id)))?.status).toBe("undone");
    expect(await t.run((ctx) => ctx.db.query("meals").collect())).toHaveLength(1);
    expect(await asUser.query(api.meals.getMeals, { date: "2026-07-16" })).toHaveLength(0);
  });
});

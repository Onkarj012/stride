import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import {
  actionValidator,
  assertTransition,
  assertValidActionEnvelope,
  buildActionGroup,
  buildActionMembers,
  type ActionEnvelope,
} from "./actions_envelope";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const group = {
  userId: "user-1",
  groupIdempotencyKey: "group-1",
  sourceSurface: "chat" as const,
  rawInput: "I had oats",
  createdAt: 1_000,
};

const candidate = {
  actionType: "meal" as const,
  memberIdempotencyKey: "member-1",
  payload: { name: "Oats" },
  provenance: "ai_extracted" as const,
  validation: { status: "valid" as const, messages: [] },
  reversible: true,
};

describe("action envelope", () => {
  test("builds a pending group and pending members with stable keys", () => {
    const builtGroup = buildActionGroup(group);
    const members = buildActionMembers({ groupId: "action-group-1" as ActionEnvelope["groupId"], userId: group.userId, candidates: [candidate] });

    expect(builtGroup).toMatchObject({ ...group, status: "pending" });
    expect(members[0]).toMatchObject({ ...candidate, groupId: "action-group-1", userId: "user-1", status: "pending" });
  });

  test("accepts the schema shape through Convex table validation", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("actionGroups", buildActionGroup(group));
      await ctx.db.insert("actions", buildActionMembers({ groupId, userId: group.userId, candidates: [candidate] })[0]);
    });

    const stored = await t.run(async (ctx) => ctx.db.query("actions").withIndex("by_group").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("pending");
  });

  test("rejects invalid confidence before an action is built", () => {
    expect(() => assertValidActionEnvelope({
      groupId: "action-group-1" as ActionEnvelope["groupId"],
      userId: "user-1",
      actionType: "meal",
      memberIdempotencyKey: "member-1",
      payload: {},
      provenance: "ai_estimated",
      confidence: 1.1,
      validation: { status: "warning", messages: ["estimated"] },
      status: "pending",
      reversible: true,
    })).toThrow(/between 0 and 1/);
  });

  test("preserves warning validation and optional reversal metadata", () => {
    const action: ActionEnvelope = {
      ...buildActionMembers({
        groupId: "action-group-1" as ActionEnvelope["groupId"],
        userId: "user-1",
        candidates: [{ ...candidate, validation: { status: "warning", messages: ["Needs portion"] } }],
      })[0],
      committedRowRef: { table: "meals", id: "meal-1" },
      undoneAt: 2_000,
      status: "undone",
    };

    expect(action.validation).toEqual({ status: "warning", messages: ["Needs portion"] });
    expect(action.committedRowRef).toEqual({ table: "meals", id: "meal-1" });
    expect(action.undoneAt).toBe(2_000);
  });

  test("allows the canonical pending and committed transitions", () => {
    expect(() => assertTransition("pending", "committed")).not.toThrow();
    expect(() => assertTransition("pending", "failed")).not.toThrow();
    expect(() => assertTransition("pending", "discarded")).not.toThrow();
    expect(() => assertTransition("pending", "expired")).not.toThrow();
    expect(() => assertTransition("committed", "undone")).not.toThrow();
    expect(() => assertTransition("failed", "pending")).not.toThrow();
  });

  test("rejects every non-canonical status transition", () => {
    const invalid = [
      ["pending", "pending"],
      ["failed", "committed"],
      ["discarded", "undone"],
      ["expired", "pending"],
      ["committed", "committed"],
    ] as const;

    for (const [from, to] of invalid) {
      expect(() => assertTransition(from, to)).toThrow(/Invalid action status transition/);
    }
  });

  test("exposes the shared Convex action validator", () => {
    expect(actionValidator).toMatchObject({ isConvexValidator: true });
  });
});

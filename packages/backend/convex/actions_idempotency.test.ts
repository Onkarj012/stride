import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import {
  deriveGroupKey,
  deriveMemberKey,
  ensureGroup,
  ensureMember,
  type ActionMemberInput,
} from "./actions_idempotency";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const groupFields = {
  userId: "user-1",
  groupIdempotencyKey: deriveGroupKey({ userId: "user-1", sourceSurface: "chat", rawInput: "I had oats" }),
  sourceSurface: "chat" as const,
  rawInput: "I had oats",
  createdAt: 1_000,
};

function memberFields(groupId: ActionMemberInput["groupId"], memberIdempotencyKey: string): ActionMemberInput {
  return {
    groupId,
    userId: "user-1",
    actionType: "meal",
    memberIdempotencyKey,
    payload: { name: "Oats" },
    provenance: "ai_extracted",
    validation: { status: "valid", messages: [] },
    reversible: true,
  };
}

describe("two-level action idempotency", () => {
  test("clean retry returns the same group without a duplicate", async () => {
    const t = convexTest(schema, modules);
    const first = await t.run((ctx) => ensureGroup(ctx, groupFields));
    const second = await t.run((ctx) => ensureGroup(ctx, groupFields));
    const groups = await t.run((ctx) => ctx.db.query("actionGroups").collect());

    expect(first.state).toBe("created");
    expect(second).toMatchObject({ state: "existing", group: { _id: first.group._id }, members: [] });
    expect(groups).toHaveLength(1);
  });

  test("retry after partial commit re-executes only non-committed members", async () => {
    const t = convexTest(schema, modules);
    const group = await t.run((ctx) => ensureGroup(ctx, groupFields));
    const committedKey = deriveMemberKey({ groupKey: group.group.groupIdempotencyKey, actionType: "meal", payloadFingerprint: "oats", ordinal: 0 });
    const pendingKey = deriveMemberKey({ groupKey: group.group.groupIdempotencyKey, actionType: "meal", payloadFingerprint: "eggs", ordinal: 1 });
    const committed = await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, committedKey)));
    await t.run((ctx) => ctx.db.patch(committed.member._id, { status: "committed" }));
    await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, pendingKey)));

    const retryCommitted = await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, committedKey)));
    const retryPending = await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, pendingKey)));

    expect(retryCommitted).toMatchObject({ state: "already_committed", shouldExecute: false });
    expect(retryPending).toMatchObject({ state: "reexecute", shouldExecute: true });
  });

  test("double confirmation of a committed member is a no-op", async () => {
    const t = convexTest(schema, modules);
    const group = await t.run((ctx) => ensureGroup(ctx, groupFields));
    const key = deriveMemberKey({ groupKey: group.group.groupIdempotencyKey, actionType: "meal", payloadFingerprint: "oats", ordinal: 0 });
    const created = await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, key)));
    await t.run((ctx) => ctx.db.patch(created.member._id, { status: "committed" }));

    const firstConfirmation = await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, key)));
    const secondConfirmation = await t.run((ctx) => ensureMember(ctx, memberFields(group.group._id, key)));
    const members = await t.run((ctx) => ctx.db.query("actions").collect());

    expect(firstConfirmation.state).toBe("already_committed");
    expect(secondConfirmation.state).toBe("already_committed");
    expect(members).toHaveLength(1);
  });

  test("duplicate submissions racing on one key yield one group", async () => {
    const t = convexTest(schema, modules);
    const [first, second] = await Promise.all([
      t.run((ctx) => ensureGroup(ctx, groupFields)),
      t.run((ctx) => ensureGroup(ctx, groupFields)),
    ]);
    const groups = await t.run((ctx) => ctx.db.query("actionGroups").collect());

    expect(new Set([first.group._id, second.group._id]).size).toBe(1);
    expect(groups).toHaveLength(1);
  });

  test("relog token mapping is stable and changes with the submission token", () => {
    const token = "relog-request-1";
    const contentHash = "workout-content";
    const groupKey = deriveGroupKey({
      userId: "user-1",
      sourceSurface: "direct_ui",
      rawInput: `2026-07-16|${contentHash}`,
      clientSubmissionId: token,
    });
    const key = deriveMemberKey({ groupKey, actionType: "workout", payloadFingerprint: contentHash, ordinal: 0 });

    expect(key).toBe(deriveMemberKey({
      groupKey: deriveGroupKey({
        userId: "user-1",
        sourceSurface: "direct_ui",
        rawInput: `2026-07-16|${contentHash}`,
        clientSubmissionId: token,
      }),
      actionType: "workout",
      payloadFingerprint: contentHash,
      ordinal: 0,
    }));
    expect(key).not.toBe(deriveMemberKey({
      groupKey: deriveGroupKey({
        userId: "user-1",
        sourceSurface: "direct_ui",
        rawInput: `2026-07-16|${contentHash}`,
        clientSubmissionId: "relog-request-2",
      }),
      actionType: "workout",
      payloadFingerprint: contentHash,
      ordinal: 0,
    }));
  });
});

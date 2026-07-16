import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  buildRecoveryDraft,
  recoveryPayloadFromDraft,
} from "./recovery_draft";

const modules = (import.meta as ImportMeta & {
  glob: (pattern: string) => Record<string, () => Promise<any>>;
}).glob("./**/*.*s");

const writer = (name: "writeRecoveryAction") => (internal as any).actions_writer[name];

function group(key: string, userId = "recovery-user") {
  return { userId, groupIdempotencyKey: key, sourceSurface: "direct_ui" as const, rawInput: key };
}

function member(payload: any, key: string) {
  return {
    memberIdempotencyKey: key,
    payload,
    provenance: "user_reported" as const,
    validation: { status: "valid" as const, messages: [] },
    reversible: true,
    resolvedDate: payload.date,
    resolvedTime: payload.time,
  };
}

describe("canonical recovery draft", () => {
  test("AI, direct UI, and check-in inputs converge on one draft shape", () => {
    const ai = buildRecoveryDraft({ kind: "sleep", date: "2026-07-16", hours: 7, source: "ai_extracted" });
    const direct = buildRecoveryDraft({ kind: "sleep", date: "2026-07-16", hours: 7, source: "direct_ui" });
    const checkin = buildRecoveryDraft({ kind: "sleep", date: "2026-07-16", band: "six_to_eight", source: "checkin" });
    expect(Object.keys(ai).sort()).toEqual(Object.keys(direct).sort());
    expect(Object.keys(ai).sort()).toEqual(Object.keys(checkin).sort());
    expect(ai.kind).toBe("recovery");
  });

  test("sleep bands persist without a fabricated point estimate", async () => {
    const t = convexTest(schema, modules);
    const payload = recoveryPayloadFromDraft(buildRecoveryDraft({
      kind: "sleep",
      date: "2026-07-16",
      band: "under_6",
      source: "checkin",
    }));
    await t.mutation(writer("writeRecoveryAction"), { group: group("band"), member: member(payload, "band-member") });
    const row = await t.run((ctx) => ctx.db.query("sleep_logs").first());
    expect(row).toMatchObject({ band: "under_6" });
    expect(row?.hours).toBeUndefined();
  });

  test("missing steps stay unknown while reported zero remains zero", () => {
    expect(buildRecoveryDraft({ kind: "steps", date: "2026-07-16" }).steps).toBeUndefined();
    expect(buildRecoveryDraft({ kind: "steps", date: "2026-07-16", count: 0 }).steps).toBe(0);
  });

  test("planned rest and missed logging remain distinct states", () => {
    expect(buildRecoveryDraft({ kind: "rest", date: "2026-07-16", state: "planned_rest" }).state).toBe("planned_rest");
    expect(buildRecoveryDraft({ kind: "rest", date: "2026-07-16", state: "missed_logging" }).state).toBe("missed_logging");
  });

  test("illness and travel states persist independently", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("illness"),
      member: member(recoveryPayloadFromDraft(buildRecoveryDraft({ kind: "rest", date: "2026-07-16", state: "illness", illness: "fever" })), "illness-member"),
    });
    await t.mutation(writer("writeRecoveryAction"), {
      group: group("travel"),
      member: member(recoveryPayloadFromDraft(buildRecoveryDraft({ kind: "rest", date: "2026-07-17", state: "travel", travel: "flight" })), "travel-member"),
    });
    const rows = await t.run((ctx) => ctx.db.query("sleep_logs").collect());
    expect(rows.map((row) => row.state)).toEqual(["illness", "travel"]);
  });

  test("sleep intervals resolve the user-local wake-up day across midnight", () => {
    const draft = buildRecoveryDraft({
      kind: "sleep",
      date: "2026-07-16",
      timezone: "Asia/Kolkata",
      intervalStart: "2026-07-16T17:00:00.000Z",
      intervalEnd: "2026-07-17T01:30:00.000Z",
    });
    expect(draft.date).toBe("2026-07-17");
    expect(draft.sleep?.intervalDay).toBe("2026-07-17");
  });

  test("submitAnswer rejects a value outside the server question definition", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "recovery-user" });
    await expect(asUser.mutation(api.checkins.submitAnswer, {
      questionId: "sleep_quality_morning",
      date: "2026-07-16",
      window: "morning",
      source: "registry",
      answerType: "choice",
      value: "made_up_value",
    })).rejects.toThrow("server-defined options");
  });

  test("getRecoveryState reports missing required inputs", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "recovery-user" });
    const state = await asUser.query(api.wellness.getRecoveryState, { date: "2026-07-16" });
    expect(state.insufficient_data).toBe(true);
    expect(state.missingInputs).toEqual(["sleep", "water", "mood", "stress", "steps"]);
  });

  test("today brief gates precise recovery language when data is incomplete", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "recovery-user" });
    const brief = await asUser.query(api.insights.getTodayBrief, { today: "2026-07-16", window: "morning" });
    expect(brief.recoveryState.insufficient_data).toBe(true);
    expect(brief.priority).toContain("Recovery guidance is limited");
    expect(brief.priority).not.toMatch(/\d+(\.\d+)?h/);
  });

  test("recovery action writes through the canonical writer and undoes end to end", async () => {
    const t = convexTest(schema, modules);
    const payload = recoveryPayloadFromDraft(buildRecoveryDraft({ kind: "steps", date: "2026-07-16", count: 0 }));
    const rowId = await t.mutation(writer("writeRecoveryAction"), {
      group: group("undo"),
      member: member(payload, "undo-member"),
    });
    const action = await t.run((ctx) => ctx.db.query("actions").first());
    const asUser = t.withIdentity({ subject: "recovery-user" });
    await asUser.mutation(api.actions_undo.undoAction, { actionId: action!._id });
    const row = await t.run((ctx) => ctx.db.get(rowId.id)) as any;
    expect(row?.count).toBe(0);
    expect(row?.undoneAt).toBeTypeOf("number");
  });
});

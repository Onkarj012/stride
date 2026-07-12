import { describe, it, expect } from "vitest";
import {
  normalizeDraft,
  normalizeDrafts,
  mergeDrafts,
  splitActions,
  stageActions,
  promoteOnMessages,
  promoteOnTimeout,
  loadPendingDrafts,
  savePendingDrafts,
} from "@/components/home/logDraftFlow";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
}

describe("normalizeDraft / normalizeDrafts", () => {
  it("assigns a stable _clientId derived from draft content", () => {
    const a = normalizeDraft({ kind: "meal", description: "Eggs", kcal: 200 });
    const b = normalizeDraft({ kind: "meal", description: "Eggs", kcal: 200 });
    expect(a?._clientId).toBeTruthy();
    expect(a?._clientId).toBe(b?._clientId);
  });

  it("preserves an existing _clientId instead of recomputing", () => {
    const draft = normalizeDraft({ kind: "meal", description: "Eggs", kcal: 200, _clientId: "keep-me" });
    expect(draft?._clientId).toBe("keep-me");
  });

  it("returns null for non-object drafts", () => {
    expect(normalizeDraft(null)).toBeNull();
    expect(normalizeDraft(undefined)).toBeNull();
    expect(normalizeDraft("nope")).toBeNull();
  });

  it("normalizeDrafts filters out invalid entries and dedupes by index", () => {
    const drafts = normalizeDrafts([
      { kind: "meal", description: "Eggs", kcal: 200 },
      null,
      { kind: "workout", description: "Run", kcal: 300 },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].kind).toBe("meal");
    expect(drafts[1].kind).toBe("workout");
  });
});

describe("mergeDrafts (bug B — multi-draft data loss)", () => {
  it("appends a new draft instead of replacing the existing list", () => {
    const existing = normalizeDrafts([{ kind: "workout", description: "Run", kcal: 300 }]);
    const merged = mergeDrafts(existing, [{ kind: "water", description: "Water", ml: 1000 }]);
    expect(merged).toHaveLength(2);
    expect(merged.map((d) => d.kind)).toEqual(["workout", "water"]);
  });

  it("merging two drafts from one response keeps both", () => {
    const merged = mergeDrafts([], [
      { kind: "workout", description: "30 min run", kcal: 300 },
      { kind: "water", description: "1L water", ml: 1000 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("updates an existing draft in place by _clientId rather than duplicating it", () => {
    const existing = normalizeDrafts([{ kind: "meal", description: "Eggs", kcal: 200 }]);
    const updated = { ...existing[0], kcal: 250, submitting: true };
    const merged = mergeDrafts(existing, [updated]);
    expect(merged).toHaveLength(1);
    expect(merged[0].kcal).toBe(250);
    expect(merged[0].submitting).toBe(true);
  });

  it("confirming (removing) one draft by _clientId leaves the others untouched", () => {
    const merged = mergeDrafts([], [
      { kind: "workout", description: "30 min run", kcal: 300 },
      { kind: "water", description: "1L water", ml: 1000 },
    ]);
    const [toRemove, toKeep] = merged;
    const afterConfirm = merged.filter((d) => d._clientId !== toRemove._clientId);
    expect(afterConfirm).toHaveLength(1);
    expect(afterConfirm[0]._clientId).toBe(toKeep._clientId);
  });

  it("returns the same array reference when there is nothing to merge", () => {
    const existing = normalizeDrafts([{ kind: "meal", description: "Eggs", kcal: 200 }]);
    expect(mergeDrafts(existing, [])).toBe(existing);
    expect(mergeDrafts(existing, undefined)).toBe(existing);
  });
});

describe("splitActions (bug A — single-step log confirm)", () => {
  it("extracts log_draft drafts separately from other action types", () => {
    const actions = [
      { type: "log_draft", draft: { kind: "meal", description: "Eggs", kcal: 200 } },
      { type: "coach_note", text: "Nice work" },
    ];
    const { drafts, rest } = splitActions(actions as any);
    expect(drafts).toEqual([{ kind: "meal", description: "Eggs", kcal: 200 }]);
    expect(rest).toEqual([{ type: "coach_note", text: "Nice work" }]);
  });

  it("extracts multiple log_draft actions from one response", () => {
    const actions = [
      { type: "log_draft", draft: { kind: "workout", description: "Run", kcal: 300 } },
      { type: "log_draft", draft: { kind: "water", description: "Water", ml: 1000 } },
    ];
    const { drafts, rest } = splitActions(actions as any);
    expect(drafts).toHaveLength(2);
    expect(rest).toHaveLength(0);
  });

  it("returns an empty drafts array when there are no log_draft actions", () => {
    const actions = [{ type: "button_row", buttons: [] }];
    const { drafts, rest } = splitActions(actions as any);
    expect(drafts).toHaveLength(0);
    expect(rest).toHaveLength(1);
  });
});

describe("staged actions (bug C — race-free card ordering)", () => {
  it("stageActions returns null for an empty actions array", () => {
    expect(stageActions([], 3)).toBeNull();
  });

  it("does not promote while the messages query hasn't caught up", () => {
    const staged = stageActions([{ type: "log_draft", draft: {} }], 2);
    const result = promoteOnMessages(staged, 2);
    expect(result.promote).toBeNull();
    expect(result.staged).toBe(staged);
  });

  it("promotes once the messages length passes the count captured at send", () => {
    const actions = [{ type: "log_draft", draft: {} }];
    const staged = stageActions(actions, 2);
    const result = promoteOnMessages(staged, 4);
    expect(result.promote).toBe(actions);
    expect(result.staged).toBeNull();
  });

  it("is a no-op when nothing is staged", () => {
    expect(promoteOnMessages(null, 10)).toEqual({ staged: null, promote: null });
    expect(promoteOnTimeout(null)).toEqual({ staged: null, promote: null });
  });

  it("fallback timeout promotes staged actions unconditionally", () => {
    const actions = [{ type: "log_draft", draft: {} }];
    const staged = stageActions(actions, 2);
    // messages never advanced (write may have failed) — the timeout still renders it
    const stillWaiting = promoteOnMessages(staged, 2);
    expect(stillWaiting.promote).toBeNull();
    const timedOut = promoteOnTimeout(staged);
    expect(timedOut.promote).toBe(actions);
    expect(timedOut.staged).toBeNull();
  });
});

describe("date-scoped pending-draft persistence (bug D — sessionStorage leak)", () => {
  it("restores drafts saved under today's date", () => {
    const storage = fakeStorage();
    savePendingDrafts(storage, "2026-07-11", [{ kind: "meal", description: "Eggs", kcal: 200 }]);
    const restored = loadPendingDrafts(storage, "2026-07-11");
    expect(restored).toHaveLength(1);
    expect(restored[0].description).toBe("Eggs");
  });

  it("drops drafts left over from a previous day", () => {
    const storage = fakeStorage();
    savePendingDrafts(storage, "2026-07-10", [{ kind: "meal", description: "Eggs", kcal: 200 }]);
    const restored = loadPendingDrafts(storage, "2026-07-11");
    expect(restored).toEqual([]);
  });

  it("handles a missing or malformed payload gracefully", () => {
    const storage = fakeStorage({ stride_pending_drafts: "not json" });
    expect(loadPendingDrafts(storage, "2026-07-11")).toEqual([]);
    expect(loadPendingDrafts(fakeStorage(), "2026-07-11")).toEqual([]);
  });

  it("handles the legacy un-scoped array format by dropping it", () => {
    const storage = fakeStorage({ stride_pending_drafts: JSON.stringify([{ kind: "meal" }]) });
    expect(loadPendingDrafts(storage, "2026-07-11")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  loadPendingDrafts,
  mergeDrafts,
  normalizeDrafts,
  promoteOnMessages,
  promoteOnTimeout,
  savePendingDrafts,
  splitActions,
  stageActions,
} from "@/components/home/logDraftFlow";

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("home logging flow helpers", () => {
  it("keeps identical drafts distinct while merging updates by client id", () => {
    const existing = normalizeDrafts([
      { kind: "water", description: "1L water", ml: 1000 },
      { kind: "water", description: "1L water", ml: 1000 },
    ]);
    expect(existing[0]._clientId).not.toBe(existing[1]._clientId);

    const merged = mergeDrafts(existing, [{ ...existing[0], ml: 1200 }]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ ml: 1200 });
    expect(merged[1]).toMatchObject({ ml: 1000 });
  });

  it("splits every log draft for direct confirm cards without dropping other actions", () => {
    const { drafts, rest } = splitActions([
      { type: "log_draft", draft: { kind: "water", ml: 1000 } },
      { type: "log_draft", draft: { kind: "steps", count: 8000 } },
      { type: "coach_note", text: "Nice work" },
    ]);
    expect(drafts).toHaveLength(2);
    expect(rest).toEqual([{ type: "coach_note", text: "Nice work" }]);
  });

  it("promotes only the message-correlated batch, with an id-checked timeout fallback", () => {
    const actions = [{ type: "log_draft", draft: { kind: "water" } }];
    const staged = stageActions(actions, "ai-1");
    expect(promoteOnMessages(staged, [{ role: "user", id: "user-1", ts: 1 }]).promote).toBeNull();

    const promoted = promoteOnMessages(staged, [{ role: "ai", id: "ai-1", ts: 2 }]);
    expect(promoted.promote).toEqual(actions);
    expect(promoted.staged).toEqual([]);

    const fallback = stageActions(actions, "ai-late")!;
    expect(promoteOnTimeout(fallback, "wrong-batch").promote).toBeNull();
    expect(promoteOnTimeout(fallback, fallback[0].batchId).promote).toEqual(actions);
  });

  it("restores only today’s pending drafts and migrates the legacy array format", () => {
    const storage = fakeStorage({
      stride_pending_drafts: JSON.stringify([{ kind: "meal", description: "Eggs", kcal: 200 }]),
    });
    const restored = loadPendingDrafts(storage, "2026-07-18");
    expect(restored).toHaveLength(1);
    expect(restored[0]._clientId).toBeTruthy();

    savePendingDrafts(storage, "2026-07-18", restored);
    expect(loadPendingDrafts(storage, "2026-07-17")).toEqual([]);
    expect(JSON.parse(storage.getItem("stride_pending_drafts")!)).toEqual({ date: "2026-07-18", drafts: restored });
  });
});

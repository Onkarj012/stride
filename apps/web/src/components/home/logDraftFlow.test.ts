import { describe, expect, it } from "vitest";
import {
  promoteOnMessages,
  promoteOnTimeout,
  splitActions,
  stageActions,
} from "@/components/home/logDraftFlow";

describe("home logging flow helpers", () => {
  it("separates log drafts from the conversational actions that still render inline", () => {
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
});

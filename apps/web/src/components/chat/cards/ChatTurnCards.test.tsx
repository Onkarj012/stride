import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatTurnCard, ConfirmationCardData } from "@stride/shared";
import { ChatTurnCards, type ChatCardHandlers } from "./ChatTurnCards";
import { ChatTurnMessage, type PersistedChatMessage } from "./ChatTurnMessage";
import { hasMinimumTouchTarget } from "./cardSizing";

const HOUR = 60 * 60 * 1000;

function confirmationData(): ConfirmationCardData {
  return {
    groupId: "group-1",
    expiresAt: Date.now() + HOUR,
    items: [{
      ordinal: 0,
      actionType: "meal",
      title: "Chicken bowl",
      description: "Chicken bowl",
      date: "2026-07-31",
      actionId: "action-1",
      confidence: 0.9,
      validationMessages: ["Portion estimated"],
    }],
  };
}

function confirmationCard(): ChatTurnCard {
  return { version: 1, kind: "confirmation", data: confirmationData() };
}

function allCardKinds(): ChatTurnCard[] {
  return [
    confirmationCard(),
    {
      version: 1,
      kind: "clarification",
      data: {
        groupId: "group-2",
        prompt: "Which day was this?",
        items: [{ ordinal: 0, actionType: "workout", title: "5k run", actionId: "action-2", reason: "No date given" }],
      },
    },
    {
      version: 1,
      kind: "duplicate",
      data: {
        groupId: "group-3",
        items: [{ ordinal: 0, actionType: "meal", title: "Oatmeal", actionId: "action-3", reason: "Looks like an entry from 30 minutes ago" }],
      },
    },
    {
      version: 1,
      kind: "result",
      data: {
        groupId: "group-4",
        items: [{
          ordinal: 0,
          actionType: "meal",
          title: "Chicken bowl",
          date: "2026-07-31",
          time: "12:30",
          status: "committed",
          actionId: "action-4",
          record: { table: "meals", id: "meal-1" },
        }],
      },
    },
    {
      version: 1,
      kind: "failure",
      data: {
        groupId: "group-5",
        code: "TURN_FAILED",
        message: "No items were saved.",
        retriable: true,
        items: [{ ordinal: 0, actionType: "meal", title: "Mystery snack", reason: "Could not read the portion" }],
      },
    },
    {
      version: 1,
      kind: "undo",
      data: {
        groupId: "group-6",
        items: [{
          ordinal: 0,
          actionType: "meal",
          title: "Chicken bowl",
          actionId: "action-6",
          record: { table: "meals", id: "meal-1" },
          state: "available",
        }],
      },
    },
  ];
}

const handlers: ChatCardHandlers = {
  onConfirm: vi.fn(),
  onClarify: vi.fn(),
  onUndoItem: vi.fn(),
  onUndoAll: vi.fn(),
};

/** Persisted message as it comes back from Convex, JSON round-tripped. */
function persistedMessage(cards: ChatTurnCard[]): PersistedChatMessage {
  return JSON.parse(JSON.stringify({
    role: "ai",
    content: "Saved chicken bowl.",
    turnOutcome: "committed",
    turnCards: cards,
    clientSubmissionId: "submission-1",
  })) as PersistedChatMessage;
}

describe("chat turn cards", () => {
  it("renders the expected structure for every card kind in the contract", () => {
    render(<ChatTurnCards cards={allCardKinds()} handlers={handlers} />);

    expect(screen.getByRole("region", { name: "Review these actions" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Needs one more detail" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Possible duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Logged" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Log failed" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Undo logged items" })).toBeInTheDocument();

    // A successful log leaves a durable record: what was saved, when, and where.
    const result = screen.getByRole("region", { name: "Logged" });
    expect(within(result).getByText("Chicken bowl")).toBeInTheDocument();
    expect(within(result).getByText(/2026-07-31 · 12:30 · saved to meals/)).toBeInTheDocument();
    expect(within(result).getByText("Logged 1 item")).toBeInTheDocument();

    // …and it is reachable from the undo control for the same action.
    expect(screen.getByRole("button", { name: "Undo Chicken bowl" })).toBeEnabled();

    // Failures say what failed and that a retry is safe.
    const failure = screen.getByRole("region", { name: "Log failed" });
    expect(within(failure).getByText("No items were saved.")).toBeInTheDocument();
    expect(within(failure).getByText(/retries are safe/i)).toBeInTheDocument();
  });

  it("shows no active confirm or discard controls once a card is resolved", () => {
    const expired: ChatTurnCard = {
      version: 1,
      kind: "confirmation",
      data: { ...confirmationData(), expiresAt: Date.now() - HOUR },
    };
    const committedUndo: ChatTurnCard = {
      version: 1,
      kind: "undo",
      data: {
        groupId: "group-6",
        items: [{
          ordinal: 0,
          actionType: "meal",
          title: "Chicken bowl",
          actionId: "action-6",
          record: { table: "meals", id: "meal-1" },
          state: "undone",
        }],
      },
    };

    const { rerender } = render(<ChatTurnCards cards={[expired, committedUndo]} handlers={handlers} />);
    expect(screen.getByRole("region", { name: "Review these actions" })).toHaveAttribute("data-card-state", "resolved");
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /discard/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Chicken bowl reversed" })).toBeDisabled();

    // Discarded/committed groups resolve the same way before the query catches up.
    rerender(
      <ChatTurnCards
        cards={[confirmationCard()]}
        handlers={handlers}
        state={{ resolvedGroupIds: new Set(["group-1"]) }}
      />,
    );
    expect(screen.getByRole("region", { name: "Review these actions" })).toHaveAttribute("data-card-state", "resolved");
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /discard/i })).toBeNull();
  });

  it("reconstructs cards from persisted message state after a reload", () => {
    const stored = persistedMessage(allCardKinds());

    const first = render(<ChatTurnMessage message={stored} handlers={handlers} />);
    const before = first.container.querySelector("[data-chat-cards]")!.innerHTML;
    first.unmount();

    // Simulated reload: nothing but the persisted message is available.
    expect(window.sessionStorage.getItem("stride_pending_drafts")).toBeNull();
    const second = render(<ChatTurnMessage message={JSON.parse(JSON.stringify(stored))} handlers={handlers} />);
    const after = second.container.querySelector("[data-chat-cards]")!.innerHTML;

    expect(after).toBe(before);
    expect(screen.getByRole("region", { name: "Logged" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Review these actions" })).toHaveAttribute("data-card-state", "active");
  });

  it("gives every card control at least a 44px touch target", () => {
    const { container } = render(<ChatTurnCards cards={allCardKinds()} handlers={handlers} />);

    const controls = container.querySelectorAll("[data-card-kind] button, [data-card-kind] input");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(
        hasMinimumTouchTarget(control),
        `${control.tagName} "${control.getAttribute("aria-label") ?? control.textContent}" is below the 44px minimum`,
      ).toBe(true);
    }
  });

  it("renders the same contract data to the same structure on Home and Coach", () => {
    const cards = allCardKinds();
    const message = persistedMessage(cards);

    // Home renders a persisted homepage message…
    const home = render(<ChatTurnMessage message={message} handlers={handlers} />);
    const homeCards = home.container.querySelector("[data-chat-cards]")!.innerHTML;
    home.unmount();

    // …Coach renders the same persisted message, plus its agent badge.
    const coach = render(
      <ChatTurnMessage message={message} handlers={handlers} badge={<span>coach</span>} />,
    );
    const coachCards = coach.container.querySelector("[data-chat-cards]")!.innerHTML;

    expect(coachCards).toBe(homeCards);
  });
});

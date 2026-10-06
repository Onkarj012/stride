import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatTurnCard, ConfirmationCardData } from "@stride/shared";
import { ChatTurnCards, type ChatCardHandlers } from "./ChatTurnCards";
import { ChatTurnMessage, type PersistedChatMessage } from "./ChatTurnMessage";
import { hasMinimumTouchTarget } from "./cardSizing";
import { useChatCardActions } from "./useChatCardActions";

const { logAnywayForAction, resolveClarification, undoAction, undoGroup, toastError, toastSuccess } = vi.hoisted(() => ({
  logAnywayForAction: vi.fn(),
  resolveClarification: vi.fn(),
  undoAction: vi.fn(),
  undoGroup: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@convex/_generated/api", () => {
  const node = (path: string[]): any => new Proxy({}, {
    get: (_target, prop) => prop === "toString" || prop === Symbol.toPrimitive
      ? () => path.join(".")
      : node([...path, String(prop)]),
  });
  return { api: node([]) };
});

vi.mock("convex/react", () => ({
  useAction: (ref: unknown) => String(ref) === "ai.logAnywayForAction"
    ? logAnywayForAction
    : String(ref) === "ai.resolveClarification"
      ? resolveClarification
      : vi.fn(),
  useMutation: (ref: unknown) => String(ref) === "actions_undo.undoAction"
    ? undoAction
    : String(ref) === "actions_undo.undoGroup"
      ? undoGroup
      : vi.fn(),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ error: toastError, success: toastSuccess }),
}));

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

function duplicateMessage(): PersistedChatMessage {
  return {
    role: "ai",
    content: "I found possible duplicates.",
    turnCards: [{
      version: 1,
      kind: "duplicate",
      data: {
        groupId: "group-duplicate",
        items: [
          { ordinal: 0, actionType: "meal", title: "Oatmeal", actionId: "action-oatmeal", reason: "Looks similar" },
          { ordinal: 1, actionType: "workout", title: "5k run", actionId: "action-run", reason: "Looks similar" },
        ],
      },
    }],
  };
}

function ActionHarness({ message }: { message: PersistedChatMessage }) {
  const { handlers, state } = useChatCardActions();
  return <ChatTurnMessage message={message} handlers={handlers} state={state} />;
}

describe("chat turn cards", () => {
  it("commits log-anyway and renders the resolved state from the returned turn", async () => {
    logAnywayForAction.mockResolvedValue({
      actionId: "action-run",
      actionGroupId: "group-duplicate",
      status: "committed",
      record: { table: "workouts", id: "workout-1" },
      turn: {
        content: "Saved 5k run.",
        turnContractVersion: 1,
        turnOutcome: "committed",
        turnCards: [
          {
            version: 1,
            kind: "result",
            data: {
              groupId: "group-duplicate",
              items: [{
                ordinal: 1,
                actionType: "workout",
                title: "5k run",
                actionId: "action-run",
                status: "committed",
                record: { table: "workouts", id: "workout-1" },
              }],
            },
          },
          {
            version: 1,
            kind: "undo",
            data: {
              groupId: "group-duplicate",
              items: [{
                ordinal: 1,
                actionType: "workout",
                title: "5k run",
                actionId: "action-run",
                record: { table: "workouts", id: "workout-1" },
                state: "available",
              }],
            },
          },
        ],
        actionGroupId: "group-duplicate",
        actionIds: ["action-run"],
      },
    });

    render(<ActionHarness message={duplicateMessage()} />);
    fireEvent.click(within(screen.getByRole("region", { name: "Possible duplicate" })).getAllByRole("button", { name: "Log anyway" })[1]);

    await waitFor(() => expect(logAnywayForAction).toHaveBeenCalledWith({ actionId: "action-run" }));
    expect(await screen.findByRole("region", { name: "Logged" })).toHaveAttribute("data-card-state", "resolved");
    expect(screen.getByText("Saved 5k run.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo 5k run" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Possible duplicate" })).toBeNull();
  });

  it("leaves the duplicate unresolved and surfaces the error when log-anyway fails", async () => {
    logAnywayForAction.mockRejectedValue(new Error("Action unavailable"));

    render(<ActionHarness message={duplicateMessage()} />);
    fireEvent.click(within(screen.getByRole("region", { name: "Possible duplicate" })).getAllByRole("button", { name: "Log anyway" })[0]);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save", "Action unavailable"));
    const duplicate = screen.getByRole("region", { name: "Possible duplicate" });
    expect(duplicate).toHaveAttribute("data-card-state", "active");
    expect(within(duplicate).getAllByRole("button", { name: "Log anyway" })[0]).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Logged" })).toBeNull();
  });

  it("treats canonical already-undone as success while skipped undo stays active with an error", async () => {
    toastError.mockClear();
    toastSuccess.mockClear();
    const message = persistedMessage([allCardKinds()[3], allCardKinds()[5]]);
    const alreadyUndoneCards = JSON.parse(JSON.stringify(message.turnCards)) as ChatTurnCard[];
    const alreadyUndoCard = alreadyUndoneCards.find((card) => card.kind === "undo");
    if (!alreadyUndoCard || alreadyUndoCard.kind !== "undo") throw new Error("Missing undo fixture");
    alreadyUndoCard.data.items[0].state = "undone";
    undoAction.mockResolvedValue({
      actionId: "action-6",
      groupId: "group-6",
      status: "already_undone",
      turn: {
        content: "That log was undone.",
        turnContractVersion: 1,
        turnOutcome: "no_action",
        turnCards: alreadyUndoneCards,
        actionGroupId: "group-6",
        actionIds: ["action-6"],
      },
    });

    const already = render(<ActionHarness message={message} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo Chicken bowl" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Already undone", "That entry was already reversed"));
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Chicken bowl reversed" })).toBeDisabled();
    already.unmount();

    undoAction.mockClear();
    toastError.mockClear();
    toastSuccess.mockClear();
    undoAction.mockResolvedValue({
      actionId: "action-6",
      groupId: "group-6",
      status: "skipped",
      reason: "Row has changed since the action was committed",
      turn: {
        content: message.content,
        turnContractVersion: 1,
        turnOutcome: "committed",
        turnCards: message.turnCards,
        actionGroupId: "group-6",
        actionIds: ["action-6"],
      },
    });

    const skippedRender = render(<ActionHarness message={message} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo Chicken bowl" }));

    await waitFor(() => expect(undoAction).toHaveBeenCalledWith({ actionId: "action-6" }));
    expect(toastError).toHaveBeenCalledWith("Couldn't undo", "Row has changed since the action was committed");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo Chicken bowl" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /reversed/i })).toBeNull();
    skippedRender.unmount();

    undoGroup.mockClear();
    toastError.mockClear();
    toastSuccess.mockClear();
    const groupMessage = persistedMessage([{
      version: 1,
      kind: "undo",
      data: {
        groupId: "group-mixed-undo",
        items: [
          { ordinal: 0, actionType: "meal", title: "Oatmeal", actionId: "action-oatmeal", record: { table: "meals", id: "meal-oatmeal" }, state: "available" },
          { ordinal: 1, actionType: "workout", title: "5k run", actionId: "action-run", record: { table: "workouts", id: "workout-run" }, state: "available" },
        ],
      },
    }]);
    const groupTurnCards = JSON.parse(JSON.stringify(groupMessage.turnCards)) as ChatTurnCard[];
    const groupUndoCard = groupTurnCards.find((card) => card.kind === "undo");
    if (!groupUndoCard || groupUndoCard.kind !== "undo") throw new Error("Missing group undo fixture");
    groupUndoCard.data.items[0].state = "undone";
    undoGroup.mockResolvedValue({
      groupId: "group-mixed-undo",
      results: [
        { actionId: "action-oatmeal", status: "already_undone" },
        { actionId: "action-run", status: "skipped", reason: "Workout row changed" },
      ],
      turn: {
        content: "One entry was already undone; one could not be reversed.",
        turnContractVersion: 1,
        turnOutcome: "committed",
        turnCards: groupTurnCards,
        actionGroupId: "group-mixed-undo",
        actionIds: ["action-oatmeal", "action-run"],
      },
    });

    render(<ActionHarness message={groupMessage} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo all" }));

    await waitFor(() => expect(undoGroup).toHaveBeenCalledWith({ groupId: "group-mixed-undo" }));
    expect(toastSuccess).toHaveBeenCalledWith("Already undone", "1 saved item was already reversed");
    expect(toastError).toHaveBeenCalledWith("Couldn't undo", "Workout row changed");
    expect(screen.getByRole("button", { name: "Oatmeal reversed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo 5k run" })).toBeEnabled();
  });

  it("shows an error instead of Saved when a clarification comes back expired", async () => {
    toastError.mockClear();
    toastSuccess.mockClear();
    resolveClarification.mockResolvedValue({
      groupId: "group-expired",
      loggedItems: [],
      memoryApprovals: [],
      content: "This confirmation expired. Nothing was saved.",
      turnOutcome: "no_action",
      turnCards: [],
      actionIds: [],
    });

    const { result } = renderHook(() => useChatCardActions());
    result.current.handlers.onClarify?.("group-expired", "2026-07-30");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save", "This confirmation expired. Nothing was saved."));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

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

    rerender(
      <ChatTurnCards
        cards={[allCardKinds()[1]]}
        handlers={handlers}
        state={{ resolvedGroupIds: new Set(["group-2"]) }}
      />,
    );
    const clarification = screen.getByRole("region", { name: "Needs one more detail" });
    expect(clarification).toHaveAttribute("data-card-state", "resolved");
    expect(within(clarification).getByText("Clarification resolved")).toBeInTheDocument();
    expect(within(clarification).queryByText("Discarded")).toBeNull();
    expect(within(clarification).queryByRole("button", { name: /continue/i })).toBeNull();
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

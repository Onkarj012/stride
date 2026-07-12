import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { homepageInputMock, mutationMock } = vi.hoisted(() => {
  // useTypewriter reads matchMedia at module load; jsdom doesn't provide it
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return {
    homepageInputMock: vi.fn(),
    mutationMock: vi.fn().mockResolvedValue(undefined),
  };
});

let messagesValue: { messages: Array<{ role: string; content: string; ts: number }> } = { messages: [] };

vi.mock("convex/react", () => ({
  // Two useQuery call sites: getNextCheckIn (args have `window`) and getHomepageMessages.
  useQuery: (_ref: unknown, args?: Record<string, unknown>) =>
    args && "window" in args ? null : messagesValue,
  useMutation: () => mutationMock,
  useAction: () => homepageInputMock,
}));
vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { firstName: "Sam" } }) }));
vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({ recording: false, transcribing: false, error: null, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/hooks/useBehavior", () => ({ useBehavior: () => ({ recordEngagement: vi.fn() }) }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ show: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/components/coach/BarcodeModal", () => ({ BarcodeModal: () => null }));
vi.mock("@/components/coach/EditLogModal", () => ({ EditLogModal: () => null }));
vi.mock("@/components/chat/MessageBubble", () => ({
  MessageBubble: ({ content, role }: { content: string; role: string }) => (
    <div data-testid={`bubble-${role}`}>{content}</div>
  ),
}));

import { AssistantConsole } from "@/components/home/AssistantConsole";
import { STAGED_FALLBACK_MS } from "@/components/home/logDraftFlow";

const waterAction = {
  type: "log_draft",
  draft: { kind: "water", description: "1L of water", ml: 1000 },
};
const stepsAction = {
  type: "log_draft",
  draft: { kind: "steps", description: "8k steps", count: 8000 },
};

// Stable prop identity — the component's initialActions sync effect keys on
// prop identity, so an inline [] default would recompute every render.
// consoleUi() returns a fresh element each call (identical elements make
// React bail out of re-rendering on rerender()).
const NO_ACTIONS: never[] = [];
const consoleUi = () => <AssistantConsole initialActions={NO_ACTIONS} />;

async function sendMessage(text: string) {
  fireEvent.change(screen.getByLabelText("Ask Stry"), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Send"));
  });
}

function deliverMessages(rerender: (ui: React.ReactElement) => void, msgs: Array<{ role: string; content: string; ts: number }>) {
  messagesValue = { messages: msgs };
  rerender(consoleUi());
}

describe("AssistantConsole logging flow", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mutationMock.mockClear();
    homepageInputMock.mockReset();
    messagesValue = { messages: [] };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a log_draft action directly as a single LogConfirmCard whose Confirm saves and removes it (bug A)", async () => {
    homepageInputMock.mockResolvedValue({ actions: [waterAction] });
    const { rerender } = render(consoleUi());

    await sendMessage("drank a litre of water");
    deliverMessages(rerender, [
      { role: "user", content: "drank a litre of water", ts: 1 },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2 },
    ]);

    // One LogConfirmCard, no intermediate two-tier card: exactly one Confirm button
    const confirmButtons = await screen.findAllByRole("button", { name: /confirm/i });
    expect(confirmButtons).toHaveLength(1);
    expect(screen.getByText("1L of water")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(confirmButtons[0]);
    });
    // The save mutation ran with the water payload and the card is gone
    expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({ ml: 1000 }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
    });
  });

  it("renders all drafts from a multi-item response; confirming one leaves the others (bug B)", async () => {
    homepageInputMock.mockResolvedValue({ actions: [waterAction, stepsAction] });
    const { rerender } = render(consoleUi());

    await sendMessage("1L water and 8k steps");
    deliverMessages(rerender, [
      { role: "user", content: "1L water and 8k steps", ts: 1 },
      { role: "ai", content: "Water: 1L · Steps: 8,000. Confirm to log.", ts: 2 },
    ]);

    expect(await screen.findByText("1L of water")).toBeInTheDocument();
    expect(screen.getByText("8k steps")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /confirm/i })).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /confirm/i })[0]);
    });
    expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({ ml: 1000 }));
    await waitFor(() => {
      expect(screen.queryByText("1L of water")).not.toBeInTheDocument();
    });
    // The second draft is untouched
    expect(screen.getByText("8k steps")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /confirm/i })).toHaveLength(1);
  });

  it("stages actions until the AI message arrives so the text bubble renders first (bug C)", async () => {
    homepageInputMock.mockResolvedValue({ actions: [waterAction] });
    const { rerender } = render(consoleUi());

    await sendMessage("drank a litre of water");
    // Action resolved but the messages query hasn't delivered the AI reply yet
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    // The user's own message arriving is not enough — still no card
    deliverMessages(rerender, [{ role: "user", content: "drank a litre of water", ts: 1 }]);
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    // Once the AI reply lands, the card appears
    deliverMessages(rerender, [
      { role: "user", content: "drank a litre of water", ts: 1 },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2 },
    ]);
    expect(await screen.findByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByTestId("bubble-ai")).toBeInTheDocument();
  });

  it("falls back to rendering staged actions after the timeout even if the message never arrives (bug C)", async () => {
    vi.useFakeTimers();
    homepageInputMock.mockResolvedValue({ actions: [waterAction] });
    render(consoleUi());

    await sendMessage("drank a litre of water");
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAGED_FALLBACK_MS + 50);
    });
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("does not restore pending drafts persisted under a previous date (bug D)", () => {
    sessionStorage.setItem(
      "stride_pending_drafts",
      JSON.stringify({ date: "2000-01-01", drafts: [{ kind: "water", description: "stale water", ml: 500 }] }),
    );
    render(consoleUi());
    expect(screen.queryByText("stale water")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });
});

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

let messagesValue: { messages: Array<{ role: string; content: string; ts: number; id?: string }> } = { messages: [] };

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

function sendMessageWithEnter(text: string) {
  const input = screen.getByLabelText("Ask Stry");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
}

function deliverMessages(rerender: (ui: React.ReactElement) => void, msgs: Array<{ role: string; content: string; ts: number; id?: string }>) {
  messagesValue = { messages: msgs };
  rerender(consoleUi());
}

function deferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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
    homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-1" });
    const { rerender } = render(consoleUi());

    await sendMessage("drank a litre of water");
    deliverMessages(rerender, [
      { role: "user", content: "drank a litre of water", ts: 1, id: "user-1" },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-1" },
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
    homepageInputMock.mockResolvedValue({ actions: [waterAction, stepsAction], messageId: "ai-1" });
    const { rerender } = render(consoleUi());

    await sendMessage("1L water and 8k steps");
    deliverMessages(rerender, [
      { role: "user", content: "1L water and 8k steps", ts: 1, id: "user-1" },
      { role: "ai", content: "Water: 1L · Steps: 8,000. Confirm to log.", ts: 2, id: "ai-1" },
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
    homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-1" });
    const { rerender } = render(consoleUi());

    await sendMessage("drank a litre of water");
    // Action resolved but the messages query hasn't delivered the AI reply yet
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    // The user's own message arriving is not enough — still no card
    deliverMessages(rerender, [{ role: "user", content: "drank a litre of water", ts: 1, id: "user-1" }]);
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    // Once the AI reply lands, the card appears
    deliverMessages(rerender, [
      { role: "user", content: "drank a litre of water", ts: 1, id: "user-1" },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-1" },
    ]);
    expect(await screen.findByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByTestId("bubble-ai")).toBeInTheDocument();
  });

  it("falls back to rendering staged actions after the timeout even if the message never arrives (bug C)", async () => {
    vi.useFakeTimers();
    homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-1" });
    render(consoleUi());

    await sendMessage("drank a litre of water");
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAGED_FALLBACK_MS + 50);
    });
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("a stale fallback timer firing after message-promotion does not resurrect a confirmed draft", async () => {
    vi.useFakeTimers();
    // Simulate the exact-simultaneity race: the timer macrotask is already
    // dequeued when promotion clears `staged`, so the effect cleanup's
    // clearTimeout can't stop it. No-op clearTimeout to keep the stale
    // callback alive past the cleanup.
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {});
    try {
      homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-1" });
      const { rerender } = render(consoleUi());

      await sendMessage("drank a litre of water");
      // AI message arrives → staged batch promotes, staged cleared
      deliverMessages(rerender, [
        { role: "user", content: "drank a litre of water", ts: 1, id: "user-1" },
        { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-1" },
      ]);
      // Promotion happens synchronously on rerender (findBy* hangs under
      // fake timers when clearTimeout is stubbed out)
      const confirm = screen.getByRole("button", { name: /confirm/i });

      // User confirms; the card is removed (mutation mock resolves in-act)
      await act(async () => {
        fireEvent.click(confirm);
      });
      expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

      // The stale timer finally fires — it must not re-promote the old batch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STAGED_FALLBACK_MS + 50);
      });
      expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
      expect(screen.queryByText("1L of water")).not.toBeInTheDocument();
    } finally {
      clearTimeoutSpy.mockRestore();
    }
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

  it("queues overlapping request batches instead of dropping either one", async () => {
    const a = deferredPromise<{ actions: typeof waterAction[]; messageId: string }>();
    const b = deferredPromise<{ actions: typeof stepsAction[]; messageId: string }>();
    homepageInputMock.mockImplementation(async ({ message }: { message?: string }) => {
      return message?.includes("steps") ? b.promise : a.promise;
    });

    const { rerender } = render(consoleUi());

    sendMessageWithEnter("drank water");
    sendMessageWithEnter("walked 8k steps");
    expect(homepageInputMock).toHaveBeenCalledTimes(2);

    a.resolve({ actions: [waterAction], messageId: "ai-a" });
    b.resolve({ actions: [stepsAction], messageId: "ai-b" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument());

    // Deliver B's bubble first — only B's card appears
    deliverMessages(rerender, [
      { role: "user", content: "walked 8k steps", ts: 3, id: "user-b" },
      { role: "ai", content: "Steps: 8k. Confirm to log.", ts: 4, id: "ai-b" },
    ]);
    expect(await screen.findByText("8k steps")).toBeInTheDocument();
    expect(screen.queryByText("1L of water")).not.toBeInTheDocument();

    // Then A's bubble — A's card appears alongside B
    deliverMessages(rerender, [
      { role: "user", content: "drank water", ts: 1, id: "user-a" },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-a" },
      { role: "user", content: "walked 8k steps", ts: 3, id: "user-b" },
      { role: "ai", content: "Steps: 8k. Confirm to log.", ts: 4, id: "ai-b" },
    ]);
    expect(await screen.findByText("1L of water")).toBeInTheDocument();
    expect(screen.getByText("8k steps")).toBeInTheDocument();
  });

  it("promotes the correct batch when AI replies arrive out of order", async () => {
    const a = deferredPromise<{ actions: typeof waterAction[]; messageId: string }>();
    const b = deferredPromise<{ actions: typeof stepsAction[]; messageId: string }>();
    homepageInputMock.mockImplementation(async ({ message }: { message?: string }) => {
      return message?.includes("steps") ? b.promise : a.promise;
    });

    const { rerender } = render(consoleUi());

    sendMessageWithEnter("drank water");
    sendMessageWithEnter("walked 8k steps");
    expect(homepageInputMock).toHaveBeenCalledTimes(2);

    // Resolve B first to exercise concurrent response settlement as well as
    // out-of-order query delivery.
    b.resolve({ actions: [stepsAction], messageId: "ai-b" });
    a.resolve({ actions: [waterAction], messageId: "ai-a" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument());

    // Reply for B arrives first, so only B's cards should promote.
    deliverMessages(rerender, [
      { role: "user", content: "walked 8k steps", ts: 3, id: "user-b" },
      { role: "ai", content: "Steps: 8k. Confirm to log.", ts: 4, id: "ai-b" },
    ]);

    expect(await screen.findByText("8k steps")).toBeInTheDocument();
    expect(screen.queryByText("1L of water")).not.toBeInTheDocument();

    deliverMessages(rerender, [
      { role: "user", content: "drank water", ts: 1, id: "user-a" },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-a" },
      { role: "user", content: "walked 8k steps", ts: 3, id: "user-b" },
      { role: "ai", content: "Steps: 8k. Confirm to log.", ts: 4, id: "ai-b" },
    ]);
    expect(await screen.findByText("1L of water")).toBeInTheDocument();
  });

  it("timeout promotes a batch even if its AI message arrives later", async () => {
    vi.useFakeTimers();
    homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-late" });
    const { rerender } = render(consoleUi());

    await sendMessage("drank water");
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAGED_FALLBACK_MS + 50);
    });
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();

    // The late AI message now arrives — it must not re-promote or duplicate
    deliverMessages(rerender, [
      { role: "user", content: "drank water", ts: 1, id: "user-1" },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-late" },
    ]);
    expect(screen.getAllByRole("button", { name: /confirm/i })).toHaveLength(1);
  });

  it("prevents discard of a draft while its confirm mutation is in flight", async () => {
    const finishMutation = deferredPromise<void>();
    mutationMock.mockReturnValue(finishMutation.promise);
    homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-1" });
    const { rerender } = render(consoleUi());

    await sendMessage("drank a litre of water");
    deliverMessages(rerender, [
      { role: "user", content: "drank a litre of water", ts: 1, id: "user-1" },
      { role: "ai", content: "Water: 1L. Confirm to log.", ts: 2, id: "ai-1" },
    ]);

    const confirm = await screen.findByRole("button", { name: /confirm/i });
    await act(async () => {
      fireEvent.click(confirm);
    });

    // While the mutation is pending, the discard button should be disabled and guarded
    const discard = screen.getByLabelText("Discard");
    expect(discard).toBeDisabled();
    await act(async () => {
      fireEvent.click(discard);
    });
    expect(screen.getByText("1L of water")).toBeInTheDocument();

    // Once the mutation resolves, the card is removed normally
    await act(async () => {
      finishMutation.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText("1L of water")).not.toBeInTheDocument();
    });
  });

  it("keeps identical drafts as separate confirm cards instead of merging them", async () => {
    const identical = { type: "log_draft", draft: { kind: "water", description: "1L of water", ml: 1000 } };
    homepageInputMock.mockResolvedValue({ actions: [identical, identical], messageId: "ai-1" });
    const { rerender } = render(consoleUi());

    await sendMessage("drank two litres");
    deliverMessages(rerender, [
      { role: "user", content: "drank two litres", ts: 1, id: "user-1" },
      { role: "ai", content: "Water. Confirm to log.", ts: 2, id: "ai-1" },
    ]);

    expect(await screen.findAllByText("1L of water")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /confirm/i })).toHaveLength(2);
  });

  it("clears pending and staged state when the local date rolls over while mounted", async () => {
    const base = new Date("2026-07-16T23:59:59.900");
    vi.useFakeTimers({ now: base });
    sessionStorage.setItem(
      "stride_pending_drafts",
      JSON.stringify({ date: "2026-07-16", drafts: [{ kind: "water", description: "today water", ml: 1000 }] }),
    );

    homepageInputMock.mockResolvedValue({ actions: [waterAction], messageId: "ai-1" });
    render(consoleUi());

    // Today's pending draft is restored on mount
    expect(screen.getByText("today water")).toBeInTheDocument();

    await sendMessage("drank water");
    expect(screen.queryByText("1L of water")).not.toBeInTheDocument();

    // Cross midnight before the staged fallback fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.queryByText("today water")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAGED_FALLBACK_MS + 50);
    });
    expect(screen.queryByText("1L of water")).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("stride_pending_drafts")!)).toEqual({
      date: "2026-07-17",
      drafts: [],
    });
  });
});

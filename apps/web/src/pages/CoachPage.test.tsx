import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  sendToAI: vi.fn(),
  parseNutritionImage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  noop: vi.fn(),
  sessions: [] as Array<{ id: string; title: string; updatedAt: number }>,
  messagesBySession: {} as Record<string, Array<{ role: "user" | "ai"; content: string }>>,
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
  useMutation: (...args: unknown[]) => mocks.useMutation(...args),
  useAction: (...args: unknown[]) => mocks.useAction(...args),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/coach/BarcodeModal", () => ({ BarcodeModal: () => null }));
vi.mock("@/components/coach/ConfirmationCard", () => ({
  ConfirmationCard: () => <div>confirmation card</div>,
}));
vi.mock("@/components/ui-kit/AgentBadge", () => ({ AgentBadge: () => null }));
vi.mock("@/components/chat/MessageBubble", () => ({
  MessageBubble: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock("@/components/ui-kit/ChatMessage", () => ({
  ThinkingBubble: () => <div>thinking</div>,
}));
vi.mock("@/components/primitives/Skeleton", () => ({ Skeleton: () => <div>loading sessions</div> }));
vi.mock("@/components/mobile/MobileKit", () => ({ MobileIcon: () => null }));
vi.mock("@/components/ui-kit", () => ({
  CoachBubble: () => <div>coach greeting</div>,
  InputBar: ({
    value,
    onValueChange,
    onSubmit,
    submitEnabled,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: () => void;
    submitEnabled: boolean;
  }) => (
    <div>
      <input
        aria-label="Message Stry"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button type="button" disabled={!submitEnabled} onClick={onSubmit}>Send</button>
    </div>
  ),
}));
vi.mock("@/hooks/usePrefs", () => ({
  usePrefs: () => ({ prefs: { coachingStyle: "gentle" } }),
}));
vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    recording: false,
    transcribing: false,
    error: null,
    start: mocks.noop,
    stop: mocks.noop,
  }),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
}));
vi.mock("@/lib/observability", () => ({ reportException: mocks.noop }));

import { CoachPage } from "@/pages/CoachPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderCoach() {
  return render(
    <MemoryRouter>
      <CoachPage />
    </MemoryRouter>,
  );
}

async function openSession(title: string, expectedMessage: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(title, "i") }));
  await screen.findByText(expectedMessage);
}

function submitMessage(message: string) {
  fireEvent.change(screen.getByLabelText("Message Stry"), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("CoachPage session-bound sends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    localStorage.clear();
    mocks.sessions = [
      { id: "session-a", title: "Session A", updatedAt: 2 },
      { id: "session-b", title: "Session B", updatedAt: 1 },
    ];
    mocks.messagesBySession = {
      "session-a": [{ role: "user", content: "Existing A" }],
      "session-b": [{ role: "user", content: "Existing B" }],
    };
    mocks.createSession.mockResolvedValue({ id: "created-session", title: "Created" });
    mocks.deleteSession.mockResolvedValue(null);
    mocks.parseNutritionImage.mockResolvedValue({});

    mocks.useQuery.mockImplementation((reference: unknown, args?: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === "chat:getSessions") return mocks.sessions;
      if (name === "chat:getMessages") {
        if (args === "skip") return undefined;
        const sessionId = (args as { sessionId: string }).sessionId;
        return mocks.messagesBySession[sessionId] ?? [];
      }
      return undefined;
    });
    mocks.useMutation.mockImplementation((reference: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === "chat:createSession") return mocks.createSession;
      if (name === "chat:deleteSession") return mocks.deleteSession;
      return mocks.noop;
    });
    mocks.useAction.mockImplementation((reference: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === "ai:chat") return mocks.sendToAI;
      if (name === "ai:parseNutritionImage") return mocks.parseNutritionImage;
      return mocks.noop;
    });
  });

  it("does not append a delayed response after switching sessions", async () => {
    const response = deferred<Record<string, unknown>>();
    mocks.sendToAI.mockReturnValueOnce(response.promise);
    renderCoach();

    await openSession("Session A", "Existing A");
    submitMessage("Question for A");
    await openSession("Session B", "Existing B");

    await act(async () => {
      response.resolve({
        reply: "Reply for A",
        clarification: {
          groupId: "group-a",
          items: [{ actionType: "meal", description: "A meal", reason: "Need date" }],
          question: "Which date for A?",
        },
      });
      await response.promise;
    });

    expect(screen.getByText("Existing B")).toBeInTheDocument();
    expect(screen.queryByText("Reply for A")).not.toBeInTheDocument();
    expect(screen.queryByText("Which date for A?")).not.toBeInTheDocument();
  });

  it("does not show a stale error after switching sessions", async () => {
    const response = deferred<Record<string, unknown>>();
    mocks.sendToAI.mockReturnValueOnce(response.promise);
    renderCoach();

    await openSession("Session A", "Existing A");
    submitMessage("Fail in A");
    await openSession("Session B", "Existing B");

    await act(async () => {
      response.reject(new Error("A failed"));
      await response.promise.catch(() => undefined);
    });

    expect(screen.getByText("Existing B")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't reach Stry/i)).not.toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("keeps a newly created request in its backend session without stealing focus", async () => {
    const created = deferred<{ id: string; title: string }>();
    const response = deferred<Record<string, unknown>>();
    mocks.createSession.mockReturnValueOnce(created.promise);
    mocks.sendToAI.mockReturnValueOnce(response.promise);
    renderCoach();

    submitMessage("New conversation");
    await openSession("Session B", "Existing B");

    await act(async () => {
      created.resolve({ id: "created-session", title: "Created" });
      await created.promise;
    });
    await waitFor(() => expect(mocks.sendToAI).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "created-session" }),
    ));

    await act(async () => {
      response.resolve({ reply: "Created reply" });
      await response.promise;
    });

    expect(screen.getByText("Existing B")).toBeInTheDocument();
    expect(screen.queryByText("Created reply")).not.toBeInTheDocument();
  });

  it("keeps normal same-session replies", async () => {
    mocks.sendToAI.mockResolvedValueOnce({ reply: "Reply for A" });
    renderCoach();

    await openSession("Session A", "Existing A");
    submitMessage("Question for A");

    expect(await screen.findByText("Reply for A")).toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

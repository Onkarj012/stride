import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { confirmGroup, homepageInput, noop } = vi.hoisted(() => ({
  confirmGroup: vi.fn().mockResolvedValue({ status: "committed", results: [{ ordinal: 0, status: "committed" }] }),
  homepageInput: vi.fn().mockResolvedValue({ actions: [] }),
  noop: vi.fn().mockResolvedValue(undefined),
}));

// Convex is addressed by name so each hook can hand back the right stub.
vi.mock("@convex/_generated/api", () => {
  const node = (path: string[]): any => new Proxy({}, {
    get: (_target, prop) => prop === "toString" || prop === Symbol.toPrimitive
      ? () => path.join(".")
      : node([...path, String(prop)]),
  });
  return { api: node([]), internal: node([]) };
});

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => String(ref) === "chat.getHomepageMessages" ? {
    sessionId: "session-1",
    messages: [{
      role: "ai",
      content: "Review this meal before saving.",
      ts: 1,
      turnOutcome: "confirmation_required",
      actionGroupId: "group-1",
      turnCards: [{
        version: 1,
        kind: "confirmation",
        data: {
          groupId: "group-1",
          expiresAt: Date.now() + 60_000,
          items: [{
            ordinal: 0,
            actionType: "meal",
            title: "Protein shake",
            description: "Protein shake",
            date: "2026-07-31",
            actionId: "action-1",
            confidence: 0.9,
            validationMessages: [],
            macros: {
              calories: 400,
              protein: 40,
              carbs: 20,
              fat: 10,
              conflict: true,
              estimate: { calories: 260, protein: 30, carbs: 12, fat: 6 },
            },
          }],
        },
      }],
    }],
  } : null,
  useAction: (ref: unknown) => String(ref) === "ai.homepageInput" ? homepageInput : String(ref) === "ai.confirmGroup" ? confirmGroup : noop,
  useMutation: () => noop,
}));

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { firstName: "Sam" } }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/hooks/useBehavior", () => ({ useBehavior: () => ({ recordEngagement: vi.fn() }) }));
vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({ recording: false, transcribing: false, error: null, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

import { AssistantConsole } from "@/components/home/AssistantConsole";

const emptyInitialActions: never[] = [];

describe("AssistantConsole macro conflict", () => {
  beforeEach(() => {
    confirmGroup.mockClear();
  });

  it("renders one durable editable confirmation path for a macro conflict", () => {
    render(<AssistantConsole initialActions={emptyInitialActions} />);

    expect(screen.getByText("Macro check")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Protein shake")).toBeInTheDocument();
    // The user's own numbers are shown first, with the estimate offered as a swap.
    expect(screen.getByDisplayValue("400")).toBeInTheDocument();
    expect(screen.getByText("Macro check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use my estimate" })).toBeEnabled();

    expect(screen.getByDisplayValue("400")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Review these actions" })).toHaveLength(1);
  });

  it("commits the resolved macros when the draft is confirmed", async () => {
    render(<AssistantConsole initialActions={emptyInitialActions} />);

    fireEvent.click(screen.getByRole("button", { name: "Use my estimate" }));
    expect(screen.getByDisplayValue("260")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));

    await waitFor(() => expect(confirmGroup).toHaveBeenCalledWith({
      groupId: "group-1",
      decisions: [{
        ordinal: 0,
        action: "confirm",
        edits: { date: "2026-07-31", description: undefined, macros: { calories: 260, protein: 30, carbs: 12, fat: 6 } },
      }],
    }));
  });
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { addMeal, homepageInput, noop } = vi.hoisted(() => ({
  addMeal: vi.fn().mockResolvedValue(undefined),
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
  useQuery: (ref: unknown) => String(ref) === "chat.getHomepageMessages" ? { sessionId: null, messages: [] } : null,
  useAction: (ref: unknown) => String(ref) === "ai.homepageInput" ? homepageInput : noop,
  useMutation: (ref: unknown) => String(ref) === "meals.addMeal" ? addMeal : noop,
}));

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { firstName: "Sam" } }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/hooks/useBehavior", () => ({ useBehavior: () => ({ recordEngagement: vi.fn() }) }));
vi.mock("@/hooks/useAudioRecorder", () => ({
  useAudioRecorder: () => ({ recording: false, transcribing: false, error: null, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

import { AssistantConsole } from "@/components/home/AssistantConsole";

const macroConflictAction = {
  type: "macro_conflict" as const,
  title: "Macro check",
  body: "Your numbers differ significantly — which should I use?",
  draft: {
    kind: "meal",
    description: "Protein shake",
    kcal: 400,
    protein: 40,
    carbs: 20,
    fat: 10,
    items: ["whey", "milk"],
    nutritionSource: "macro_conflict",
    engineEstimate: { kcal: 260, protein: 30, carbs: 12, fat: 6 },
    date: "2026-07-31",
  },
  buttons: [],
};

describe("AssistantConsole macro conflict", () => {
  beforeEach(() => {
    addMeal.mockClear();
  });

  it("renders an editable card for a macro_conflict action instead of dropping it", () => {
    render(<AssistantConsole initialActions={[macroConflictAction as never]} />);

    expect(screen.getByText("Macro check")).toBeInTheDocument();
    expect(screen.getByText("Protein shake")).toBeInTheDocument();
    // The user's own numbers are shown first, with the estimate offered as a swap.
    expect(screen.getByText("400")).toBeInTheDocument();
    expect(screen.getByText(/My estimate is ~260 kcal/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use my estimate" })).toBeEnabled();

    // …and the macros are editable in place.
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByDisplayValue("400")).toBeInTheDocument();
  });

  it("commits the resolved macros when the draft is confirmed", async () => {
    render(<AssistantConsole initialActions={[macroConflictAction as never]} />);

    fireEvent.click(screen.getByRole("button", { name: "Use my estimate" }));
    expect(screen.getByText("260")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(addMeal).toHaveBeenCalledTimes(1));
    expect(addMeal).toHaveBeenCalledWith(expect.objectContaining({
      name: "Protein shake",
      calories: 260,
      protein: 30,
      carbs: 12,
      fat: 6,
      date: "2026-07-31",
      logSource: "home",
      nutritionSource: "engine",
    }));
    // The card leaves the transcript once it is logged.
    await waitFor(() => expect(screen.queryByText("Macro check")).toBeNull());
  });
});

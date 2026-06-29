import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const dismissMock = vi.fn().mockResolvedValue(undefined);
let nudges: unknown = [];

vi.mock("convex/react", () => ({
  useQuery: () => nudges,
  useMutation: () => dismissMock,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

import { NudgeInbox } from "@/components/home/NudgeInbox";

describe("NudgeInbox", () => {
  beforeEach(() => { dismissMock.mockClear(); });

  it("renders nothing when there are no active nudges", () => {
    nudges = [];
    const { container } = render(<NudgeInbox />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders active nudges and dismisses them", () => {
    nudges = [{ _id: "n1", title: "Drink water", body: "You're behind", deepLink: "/?log=water" }];
    render(<NudgeInbox />);
    expect(screen.getByText("Drink water")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss: Drink water/ }));
    expect(dismissMock).toHaveBeenCalledWith({ id: "n1" });
  });
});

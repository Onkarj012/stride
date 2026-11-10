import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntryRow } from "./EntryRow";
import type { EntryView } from "@/lib/log";

const mocks = vi.hoisted(() => ({ editEntry: vi.fn(), mutation: vi.fn(), toast: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: (name: unknown) => name === "edit" ? mocks.editEntry : mocks.mutation }));
vi.mock("@convex/_generated/api", () => ({ api: { entries: { editEntry: "edit", deleteEntry: "delete", undoRevision: "undo" } } }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }));
vi.mock("motion/react", () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: "div", button: "button" } }));

describe("EntryRow keyboard controls", () => {
  beforeEach(() => { mocks.editEntry.mockReset(); mocks.mutation.mockReset(); });

  it("closes the editor on Escape without saving and restores row focus", () => {
    const nutrients = { protein: 2, carbs: 28, fat: 0, fiber: 1, sugar: 0, sodiumMg: 2, kcal: 130 };
    const entry: EntryView = { _id: "entry" as EntryView["_id"], entryKey: "entry" as EntryView["entryKey"], foodId: "food" as EntryView["foodId"], foodName: "Rice", grams: 100, slot: "lunch", nutrients, mealNutrients: nutrients, flags: [], revision: 1, localDate: "2026-11-11", loggedAt: 1, source: "db", confidence: 1, createdBy: "user" };
    render(<EntryRow entry={entry} />);
    const rowButton = screen.getByRole("button", { name: /Rice/ });
    fireEvent.click(rowButton);
    fireEvent.keyDown(screen.getByLabelText("Grams"), { key: "Escape" });
    expect(screen.queryByLabelText("Grams")).not.toBeInTheDocument();
    expect(mocks.editEntry).not.toHaveBeenCalled();
    expect(rowButton).toHaveFocus();
  });
});

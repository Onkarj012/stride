import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddFood } from "./AddFood";

const mocks = vi.hoisted(() => ({ addEntries: vi.fn(), useQuery: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.addEntries, useQuery: (...args: unknown[]) => mocks.useQuery(...args) }));
vi.mock("./toasts", () => ({ useLogToast: () => vi.fn() }));
vi.mock("./FoodPicker", () => ({ FoodPicker: ({ onPick }: { onPick: (id: string, name: string) => void }) => <div><input aria-label="Search foods" type="search" /><button type="button" onClick={() => onPick("food", "Rice")}>Rice</button></div> }));

describe("AddFood keyboard controls", () => {
  beforeEach(() => { mocks.addEntries.mockReset().mockResolvedValue([]); mocks.useQuery.mockReturnValue([]); });

  it("submits grams with Enter but not when Enter is in food search", async () => {
    render(<AddFood localDate="2026-11-11" />);
    fireEvent.click(screen.getByRole("button", { name: /Add food/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Rice/ }));
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search foods" }), { key: "Enter" });
    expect(mocks.addEntries).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Grams"), { target: { value: "0" } });
    fireEvent.submit(screen.getByLabelText("Grams").closest("form")!);
    expect(mocks.addEntries).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Grams"), { target: { value: "100" } });
    fireEvent.keyDown(screen.getByLabelText("Grams"), { key: "Enter" });
    fireEvent.submit(screen.getByLabelText("Grams").closest("form")!);
    await waitFor(() => expect(mocks.addEntries).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ grams: 100 })] })));
  });

  it("closes on Escape and restores focus to Add food", () => {
    render(<AddFood localDate="2026-11-11" />);
    const opener = screen.getByRole("button", { name: /Add food/ });
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByLabelText("Grams"), { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Add food" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add food/ })).toHaveFocus();
  });
});

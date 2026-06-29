import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const { searchFn, recent } = vi.hoisted(() => ({
  searchFn: vi.fn().mockResolvedValue([]),
  recent: [{ name: "Banana", caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 23, fatPer100g: 0.3 }],
}));

vi.mock("convex/react", () => ({
  useAction: () => searchFn,
  useQuery: () => recent,
}));

import { FoodSearch } from "@/components/food/FoodSearch";

describe("FoodSearch", () => {
  it("exposes accessible combobox semantics and recent-food chips", () => {
    render(<FoodSearch onAdd={() => {}} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Banana" })).toBeInTheDocument();
  });

  it("picking a recent food shows a labeled grams input and computed macros", () => {
    const onAdd = vi.fn();
    render(<FoodSearch onAdd={onAdd} ctaLabel="Add ingredient" />);
    fireEvent.click(screen.getByRole("button", { name: "Banana" }));
    expect(screen.getByText(/89 kcal/)).toBeInTheDocument(); // 100g of banana
    fireEvent.click(screen.getByRole("button", { name: /Add ingredient/ }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "Banana", grams: 100 }));
  });
});

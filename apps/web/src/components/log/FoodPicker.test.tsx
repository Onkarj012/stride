import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodId } from "@/lib/log";
import { FoodPicker, foodSearchStatus, stepFoodHighlight } from "./FoodPicker";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (name: unknown, args: unknown) => mocks.useQuery(name, args) }));
vi.mock("@convex/_generated/api", () => ({ api: { foods_db: { searchFoods: "searchFoods" } } }));

const dal = "dal" as FoodId;
const roti = "roti" as FoodId;

describe("stepFoodHighlight", () => {
  it("starts at the top on ArrowDown and the bottom on ArrowUp when nothing is highlighted", () => {
    expect(stepFoodHighlight(-1, "ArrowDown", 3)).toBe(0);
    expect(stepFoodHighlight(-1, "ArrowUp", 3)).toBe(2);
  });

  it("stays inside the list", () => {
    expect(stepFoodHighlight(0, "ArrowUp", 3)).toBe(0);
    expect(stepFoodHighlight(2, "ArrowDown", 3)).toBe(2);
    expect(stepFoodHighlight(1, "ArrowDown", 3)).toBe(2);
  });

  it("does nothing when the list is empty", () => {
    expect(stepFoodHighlight(-1, "ArrowDown", 0)).toBe(-1);
    expect(stepFoodHighlight(0, "ArrowUp", 0)).toBe(-1);
  });
});

describe("foodSearchStatus", () => {
  it("counts one food in the singular and several in the plural", () => {
    expect(foodSearchStatus(0)).toBe("No foods found. Try another word.");
    expect(foodSearchStatus(1)).toBe("1 food");
    expect(foodSearchStatus(4)).toBe("4 foods");
  });
});

describe("FoodPicker", () => {
  beforeAll(() => {
    // jsdom does not implement scrolling. The picker calls it to keep the highlight in view.
    if (typeof HTMLElement.prototype.scrollIntoView !== "function") {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => {
    mocks.useQuery.mockReset();
    mocks.useQuery.mockImplementation((_name: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const text = typeof args === "object" && args !== null && "query" in args ? String(args.query) : "";
      if (text === "rice") {
        return [
          { _id: "rice-raw", name: "Rice, raw", per100g: { kcal: 360.4 } },
          { _id: "rice-cooked", name: "Rice, cooked", per100g: { kcal: 130 } },
        ];
      }
      if (text === "dal") return [{ _id: "toor", name: "Toor dal", per100g: { kcal: 340 } }];
      if (text === "same") {
        return [
          { _id: dal, name: "Dal", per100g: { kcal: 100 } },
          { _id: roti, name: "Roti", per100g: { kcal: 80 } },
        ];
      }
      return [];
    });
  });

  // Renders the picker with two suggestions and returns the pick callback.
  function renderPicker(onPick = vi.fn()) {
    render(
      <FoodPicker
        candidates={[
          { _id: dal, name: "Dal" },
          { _id: roti, name: "Roti" },
        ]}
        chosen={null}
        heading="Which food?"
        onPick={onPick}
      />,
    );
    return onPick;
  }

  // The search box the arrow keys and Enter act on.
  function searchBox() {
    return screen.getByRole("combobox", { name: "Search foods" });
  }

  it("does not pick a suggestion on Enter until an arrow key highlights one", () => {
    const onPick = renderPicker();
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText(/to pick/)).toBeInTheDocument();

    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).toHaveBeenCalledExactlyOnceWith(dal, "Dal");
    expect(screen.getByText(/to pick/)).toBeInTheDocument();
  });

  it("moves through suggestions and stops at the ends", () => {
    const onPick = renderPicker();
    fireEvent.keyDown(searchBox(), { key: "ArrowUp" });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).toHaveBeenCalledExactlyOnceWith(roti, "Roti");

    onPick.mockClear();
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).toHaveBeenCalledExactlyOnceWith(roti, "Roti");
  });

  it("still picks a food on click", () => {
    const onPick = renderPicker();
    fireEvent.click(screen.getByRole("option", { name: "Roti" }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith(roti, "Roti");
  });

  it("highlights the top search match so Enter picks it, and says how many came back", async () => {
    const onPick = renderPicker();
    fireEvent.change(searchBox(), { target: { value: "rice" } });

    const top = await screen.findByRole("option", { name: /Rice, raw/ });
    expect(top).toHaveTextContent("360 kcal / 100 g");
    expect(searchBox()).toHaveAttribute("aria-activedescendant", top.id);
    expect(screen.getByRole("status")).toHaveTextContent("2 foods");
    expect(screen.getByText(/to pick/)).toBeInTheDocument();

    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).toHaveBeenCalledExactlyOnceWith("rice-raw", "Rice, raw");
  });

  it("moves to the next search match with ArrowDown", async () => {
    const onPick = renderPicker();
    fireEvent.change(searchBox(), { target: { value: "rice" } });
    await screen.findByRole("option", { name: /Rice, raw/ });

    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    const next = screen.getByRole("option", { name: /Rice, cooked/ });
    expect(searchBox()).toHaveAttribute("aria-activedescendant", next.id);
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).toHaveBeenCalledExactlyOnceWith("rice-cooked", "Rice, cooked");
  });

  it("starts a new search on its top match, and drops that highlight when the search is cleared", async () => {
    const onPick = renderPicker();
    fireEvent.change(searchBox(), { target: { value: "rice" } });
    await screen.findByRole("option", { name: /Rice, raw/ });
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    expect(searchBox()).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Rice, cooked/ }).id);

    fireEvent.change(searchBox(), { target: { value: "dal" } });
    const toor = await screen.findByRole("option", { name: /Toor dal/ });
    expect(searchBox()).toHaveAttribute("aria-activedescendant", toor.id);

    fireEvent.change(searchBox(), { target: { value: "" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Dal" })).toBeInTheDocument());
    expect(searchBox()).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("does not pick the previous match when Enter comes before the search catches up", async () => {
    const onPick = renderPicker();
    fireEvent.change(searchBox(), { target: { value: "rice" } });
    await screen.findByRole("option", { name: /Rice, raw/ });
    fireEvent.change(searchBox(), { target: { value: "rice x" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("drops a search highlight when the same foods return as suggestions", async () => {
    const onPick = renderPicker();
    fireEvent.change(searchBox(), { target: { value: "same" } });
    await screen.findByRole("option", { name: /Dal/ });
    fireEvent.change(searchBox(), { target: { value: "" } });
    await waitFor(() => expect(searchBox()).not.toHaveAttribute("aria-activedescendant"));
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("announces an empty search and does not pick on Enter", async () => {
    const onPick = renderPicker();
    fireEvent.change(searchBox(), { target: { value: "zz" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No foods found. Try another word."));
    expect(screen.queryByText("Type at least two letters to search.")).not.toBeInTheDocument();
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("ignores Enter while a composition is in progress", () => {
    const onPick = renderPicker();
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    fireEvent.keyDown(searchBox(), { key: "Enter", isComposing: true });
    expect(onPick).not.toHaveBeenCalled();
  });
});

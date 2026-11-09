import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DayHeader, dayForKey } from "./DayHeader";

const TODAY = "2026-11-10";

// Prints the current path so tests can see where a key press went.
function Where() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

// Renders the header for one day inside a router, with a text field elsewhere on the page.
function renderAt(localDate: string) {
  const path = localDate === TODAY ? "/day" : `/day/${localDate}`;
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <DayHeader localDate={localDate} today={TODAY} />
              <textarea aria-label="What did you eat?" />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// The path the router is on now.
function path() {
  return screen.getByTestId("path").textContent;
}

describe("dayForKey", () => {
  it("steps back from any day", () => {
    expect(dayForKey("ArrowLeft", TODAY, TODAY)).toBe("2026-11-09");
  });

  it("does not step past today", () => {
    expect(dayForKey("ArrowRight", TODAY, TODAY)).toBeNull();
    expect(dayForKey("ArrowRight", "2026-11-08", TODAY)).toBe("2026-11-09");
  });

  it("jumps to today only from a past day", () => {
    expect(dayForKey("t", "2026-11-01", TODAY)).toBe(TODAY);
    expect(dayForKey("t", TODAY, TODAY)).toBeNull();
  });

  it("ignores other keys", () => {
    expect(dayForKey("ArrowUp", "2026-11-01", TODAY)).toBeNull();
  });
});

describe("DayHeader keyboard", () => {
  it("moves to yesterday on the left arrow", () => {
    renderAt(TODAY);
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(path()).toBe("/day/2026-11-09");
  });

  it("moves to the next day on the right arrow, and to /day when that is today", () => {
    renderAt("2026-11-09");
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(path()).toBe("/day");
  });

  it("goes back to today on T", () => {
    renderAt("2026-11-01");
    fireEvent.keyDown(document.body, { key: "t" });
    expect(path()).toBe("/day");
  });

  it("leaves the keys alone while typing in a field", () => {
    renderAt(TODAY);
    fireEvent.keyDown(screen.getByLabelText("What did you eat?"), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByLabelText("What did you eat?"), { key: "t" });
    expect(path()).toBe("/day");
  });

  it("leaves the keys alone with a modifier held", () => {
    renderAt(TODAY);
    fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(document.body, { key: "ArrowLeft", metaKey: true });
    expect(path()).toBe("/day");
  });

  it("names the shortcuts on the buttons", () => {
    renderAt("2026-11-01");
    expect(screen.getByRole("button", { name: "Previous day" })).toHaveAttribute("aria-keyshortcuts", "ArrowLeft");
    expect(screen.getByRole("button", { name: "Next day" })).toHaveAttribute("aria-keyshortcuts", "ArrowRight");
    expect(screen.getByRole("button", { name: "Back to today" })).toHaveAttribute("aria-keyshortcuts", "T");
  });
});

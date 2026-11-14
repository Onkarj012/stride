import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatDayLabel } from "./date";
import { dayPageName, pageTitle, usePageTitle } from "./usePageTitle";

describe("day page name", () => {
  it("returns Today for the current day", () => {
    expect(dayPageName("2026-11-15", "2026-11-15")).toBe("Today");
  });

  it("formats a past day as its date label", () => {
    const localDate = "2026-11-10";
    expect(dayPageName(localDate, "2026-11-15")).toBe(formatDayLabel(localDate));
  });
});

// Mounts the page title hook for the tests.
function TitleSetter({ name }: { name: string }) {
  usePageTitle(name);
  return null;
}

describe("page title", () => {
  it("formats a name with the Stride suffix", () => {
    expect(pageTitle("Today")).toBe("Today · Stride");
  });

  it("sets the document title and updates it when the name changes", () => {
    const view = render(<TitleSetter name="Today" />);
    expect(document.title).toBe("Today · Stride");

    view.rerender(<TitleSetter name="Progress" />);
    expect(document.title).toBe("Progress · Stride");
  });
});

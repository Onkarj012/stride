import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pageTitle, usePageTitle } from "./usePageTitle";

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

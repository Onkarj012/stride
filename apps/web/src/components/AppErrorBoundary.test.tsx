import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenChild(): ReactNode {
  throw new Error("test failure");
}

describe("AppErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders a reload fallback when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong — reload");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogWeightCard } from "./LogWeightCard";

const { logWeight, useQuery } = vi.hoisted(() => ({
  logWeight: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery,
  useMutation: () => logWeight,
}));

// Gets the actual form so tests also exercise submissions that bypass the disabled button.
function weightForm(): HTMLFormElement {
  const form = screen.getByRole("spinbutton").closest("form");
  if (form === null) throw new Error("Weight input has no form");
  return form;
}

// Holds the mutation open so tests can interact with the pending and failed states.
function pendingSave() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("LogWeightCard", () => {
  beforeEach(() => {
    logWeight.mockReset();
    useQuery.mockReset();
    useQuery.mockReturnValue(null);
  });

  it("locks the field until a successful save finishes, then clears it", async () => {
    const pending = pendingSave();
    logWeight.mockReturnValue(pending.promise);
    render(<LogWeightCard localDate="2026-11-17" units="metric" />);
    const input = screen.getByRole("spinbutton", { name: "Weight in kg" });
    fireEvent.change(input, { target: { value: "78.4" } });
    fireEvent.submit(weightForm());

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(logWeight).toHaveBeenCalledExactlyOnceWith({ kg: 78.4, localDate: "2026-11-17" });

    await act(async () => pending.resolve());

    expect(input).toBeEnabled();
    expect(input).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("ignores repeated form submissions while the first request is pending", async () => {
    const pending = pendingSave();
    logWeight.mockReturnValue(pending.promise);
    render(<LogWeightCard localDate="2026-11-17" units="metric" />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "78.4" } });
    const form = weightForm();

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    expect(logWeight).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
  });

  it("keeps a failed replacement editable and lets the corrected value retry", async () => {
    const pending = pendingSave();
    useQuery.mockReturnValue({ kg: 79 });
    logWeight.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(undefined);
    render(<LogWeightCard localDate="2026-11-17" units="metric" />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "78.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await act(async () => pending.reject(new Error("Network unavailable")));

    expect(screen.getByRole("alert")).toHaveTextContent("No connection. Check your internet and try again.");
    expect(input).toBeEnabled();
    expect(input).toHaveValue(78.4);
    fireEvent.change(input, { target: { value: "78.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await waitFor(() => expect(input).toHaveValue(null));
    expect(logWeight).toHaveBeenLastCalledWith({ kg: 78.5, localDate: "2026-11-17" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still converts pounds to kilograms for storage", async () => {
    logWeight.mockResolvedValue(undefined);
    render(<LogWeightCard localDate="2026-11-17" units="imperial" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Weight in lb" }), { target: { value: "173" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(null));
    expect(logWeight).toHaveBeenCalledExactlyOnceWith({ kg: 78.5, localDate: "2026-11-17" });
  });

  it("does not submit before the profile units are available", () => {
    render(<LogWeightCard localDate="2026-11-17" units={undefined} />);

    expect(screen.getByRole("spinbutton")).toBeDisabled();
    fireEvent.submit(weightForm());
    expect(logWeight).not.toHaveBeenCalled();
  });
});

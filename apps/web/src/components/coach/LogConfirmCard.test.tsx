import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import type { WorkoutDraft } from "@/data/mock";

const workoutDraft: WorkoutDraft = {
  kind: "workout",
  description: "30 min run",
  type: "run",
  duration: 30,
  kcal: 300,
  intensity: "medium",
  calorieResult: {
    total_kcal: 300,
    confidence: 0.8,
    range_low: 260,
    range_high: 340,
    breakdown: { base: 300 },
  },
};

describe("LogConfirmCard", () => {
  it("clears stale workout calories after an editable input changes", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={workoutDraft} onConfirm={onConfirm} onDiscard={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByDisplayValue("30"), { target: { value: "45" } });
    expect(screen.getByRole("button", { name: /enter kcal/i })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ duration: 45, kcal: 400, calorieResult: null }));
  });

  it("disables editing, discard, and duplicate confirm while submitting", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={{ ...workoutDraft, submitting: true }} onConfirm={onConfirm} onDiscard={() => {}} />);

    expect(screen.getByRole("button", { name: /^refine$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeDisabled();
    expect(screen.getByLabelText("Discard")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /logging/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import type { MealDraft, WorkoutDraft } from "@/data/mock";

const mealDraft: MealDraft = {
  kind: "meal",
  description: "2 eggs",
  kcal: 150,
  protein: 12,
  carbs: 1,
  fat: 10,
  items: ["2 eggs"],
};

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
  it("renders as a single, directly-actionable confirm card (bug A)", () => {
    render(<LogConfirmCard draft={mealDraft} onConfirm={() => {}} onDiscard={() => {}} />);
    expect(screen.getAllByText("2 eggs").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("Confirm invokes onConfirm with the current draft so the caller can save it", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={mealDraft} onConfirm={onConfirm} onDiscard={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "meal", description: "2 eggs", kcal: 150 }));
  });

  it("Discard invokes onDiscard without touching onConfirm", () => {
    const onConfirm = vi.fn();
    const onDiscard = vi.fn();
    render(<LogConfirmCard draft={mealDraft} onConfirm={onConfirm} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByLabelText("Discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("bug E: manually editing workout kcal clears the stale calorieResult before confirming", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={workoutDraft} onConfirm={onConfirm} onDiscard={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const kcalInput = screen.getByDisplayValue("300");
    fireEvent.change(kcalInput, { target: { value: "200" } });

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ kcal: 200, calorieResult: null }));
  });

  it("leaves calorieResult untouched when kcal is not edited", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={workoutDraft} onConfirm={onConfirm} onDiscard={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      calorieResult: expect.objectContaining({ range_low: 260, range_high: 340 }),
    }));
  });

  it("clears stale calories after a duration edit and requires replacement kcal", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={workoutDraft} onConfirm={onConfirm} onDiscard={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const durationInput = screen.getByDisplayValue("30");
    fireEvent.change(durationInput, { target: { value: "45" } });
    expect(screen.getByRole("button", { name: /enter kcal/i })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ duration: 45, kcal: 400, calorieResult: null }));
  });

  it("clears stale calories after an intensity edit and requires replacement kcal", () => {
    const onConfirm = vi.fn();
    render(<LogConfirmCard draft={workoutDraft} onConfirm={onConfirm} onDiscard={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const intensitySelect = screen.getByDisplayValue("medium");
    fireEvent.change(intensitySelect, { target: { value: "high" } });
    expect(screen.getByRole("button", { name: /enter kcal/i })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "375" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ intensity: "high", kcal: 375, calorieResult: null }));
  });

  it("disables Edit and Discard while the draft is submitting", () => {
    const submittingDraft = { ...workoutDraft, submitting: true };
    render(<LogConfirmCard draft={submittingDraft} onConfirm={() => {}} onDiscard={() => {}} />);
    expect(screen.getByRole("button", { name: /^refine$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeDisabled();
    expect(screen.getByLabelText("Discard")).toBeDisabled();
  });
});

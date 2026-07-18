import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const addWaterMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => addWaterMock,
}));

import { requireMealNutrition } from "./useLogs";
import { useLogs } from "./useLogs";

describe("requireMealNutrition", () => {
  test("requires positive calories and non-negative macros", () => {
    const valid = { kcal: 300, protein: 20, carbs: 30, fat: 8 };
    expect(requireMealNutrition(valid)).toBe(valid);
    expect(() => requireMealNutrition({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toThrow();
    expect(() => requireMealNutrition({ ...valid, protein: -1 })).toThrow();
  });
});

describe("useLogs water intents", () => {
  test("uses a distinct idempotency token for overlapping water logs", async () => {
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const calls: Array<{ idempotencyToken: string }> = [];
    addWaterMock
      .mockImplementationOnce(async (args: { idempotencyToken: string }) => {
        calls.push(args);
        await firstPending;
      })
      .mockImplementationOnce(async (args: { idempotencyToken: string }) => {
        calls.push(args);
      });

    const { result } = renderHook(() => useLogs("2026-07-16"));
    let firstPromise!: Promise<unknown>;
    act(() => {
      firstPromise = result.current.add("water", "", { water: { ml: 250 } });
    });
    await act(async () => {
      await result.current.add("water", "", { water: { ml: 250 } });
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].idempotencyToken).not.toBe(calls[1].idempotencyToken);
    releaseFirst();
    await act(async () => {
      await firstPromise;
    });
  });
});

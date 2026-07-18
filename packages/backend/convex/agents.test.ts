import { describe, expect, test, vi } from "vitest";
import { MEMORY_AUTO_PERSIST, runMemoryAgent } from "./agents";

describe("memory agent beta gate", () => {
  test("does not persist extracted facts while automatic memory is disabled", async () => {
    const runMutation = vi.fn();
    const callAI = vi.fn().mockResolvedValue(JSON.stringify([
      { kind: "ingredient_fact", name: "homemade paneer", per100g: { kcal: 260 } },
      { kind: "meal_fact", name: "dal", kcal: 350, protein: 20, carbs: 40, fat: 10 },
    ]));

    await runMemoryAgent(
      { runMutation },
      { userId: "memory-user", message: "my homemade paneer has 260 kcal", today: "2026-07-18", knownFoods: [], knownWorkouts: [] },
      callAI as any,
    );

    expect(MEMORY_AUTO_PERSIST).toBe(false);
    expect(runMutation).not.toHaveBeenCalled();
  });
});

import { describe, expect, test } from "vitest";
import {
  disambiguateCardTitles,
  isUnusablePlaceholderMeal,
  trimHomepageHistory,
} from "./ai";

describe("homepage meal pipeline helpers", () => {
  test("keeps bounded prior meal context and excludes the persisted current turn", () => {
    const history = [
      { role: "user", content: "Breakfast was oats and yogurt" },
      { role: "ai", content: "Got it." },
      { role: "user", content: "Lunch was paneer with rice" },
      { role: "user", content: "log those 2 meals" },
    ];

    expect(trimHomepageHistory(history)).toEqual([
      { role: "user", content: "Breakfast was oats and yogurt" },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "Lunch was paneer with rice" },
    ]);
  });

  test("classifies generic all-zero parse failures for skipping", () => {
    const failedParse = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      parseError: "Couldn't parse reliably",
    };

    expect(isUnusablePlaceholderMeal("meal 2", failedParse)).toBe(true);
    expect(isUnusablePlaceholderMeal("", failedParse)).toBe(true);
    expect(isUnusablePlaceholderMeal("oats and yogurt", failedParse)).toBe(false);
    expect(isUnusablePlaceholderMeal("meal", { ...failedParse, calories: 300 })).toBe(false);
  });

  test("indexes duplicate confirmation titles while preserving unique titles", () => {
    expect(disambiguateCardTitles(["Paneer Rice", "Paneer Rice", "Fruit Bowl"]))
      .toEqual(["Paneer Rice (1)", "Paneer Rice (2)", "Fruit Bowl"]);
  });
});

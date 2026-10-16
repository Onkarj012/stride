import { describe, expect, it } from "vitest";
import { resolvePortion, type PortionResult, type UnresolvedReason } from "./units.ts";

/** What a phrase must give: grams, or the reason it must stay unresolved. */
type Expected = { grams: number } | { reason: UnresolvedReason };

/** One everyday phrase as extraction hands it over: quantity, unit and the matched food name. */
interface Phrase {
  phrase: string;
  quantity: number;
  unit: string | null;
  food: string;
  expected: Expected;
}

/** Everyday Indian and common phrasings. Unresolved cases must stay unresolved: the app asks the user. */
const PHRASES: readonly Phrase[] = [
  // Breads: piece weights from the household table.
  { phrase: "2 chapati", quantity: 2, unit: "chapati", food: "chapati", expected: { grams: 80 } },
  { phrase: "2 chapatis", quantity: 2, unit: "chapatis", food: "chapati", expected: { grams: 80 } },
  { phrase: "1 phulka", quantity: 1, unit: "phulka", food: "phulka", expected: { grams: 30 } },
  { phrase: "1 paratha", quantity: 1, unit: "paratha", food: "paratha", expected: { grams: 80 } },
  { phrase: "1 aloo paratha", quantity: 1, unit: null, food: "aloo paratha", expected: { reason: "missing_piece_weight" } },
  { phrase: "1 dosa", quantity: 1, unit: null, food: "dosa", expected: { reason: "missing_piece_weight" } },
  { phrase: "1 masala dosa", quantity: 1, unit: null, food: "masala dosa", expected: { reason: "missing_piece_weight" } },
  { phrase: "3 idli", quantity: 3, unit: null, food: "idli", expected: { grams: 120 } },
  { phrase: "1 vada", quantity: 1, unit: null, food: "vada", expected: { reason: "missing_piece_weight" } },
  { phrase: "2 puri", quantity: 2, unit: null, food: "puri", expected: { reason: "missing_piece_weight" } },
  { phrase: "1 samosa", quantity: 1, unit: null, food: "samosa", expected: { reason: "missing_piece_weight" } },

  // Sweets: no citable piece weight yet.
  { phrase: "1 besan ladoo", quantity: 1, unit: null, food: "besan ladoo", expected: { reason: "missing_piece_weight" } },
  { phrase: "1 gulab jamun", quantity: 1, unit: null, food: "gulab jamun", expected: { reason: "missing_piece_weight" } },

  // Rice, dal and drinks: volume through a vessel and a food density.
  { phrase: "half katori rice", quantity: 0.5, unit: "katori", food: "cooked rice", expected: { grams: 0.5 * 150 * 0.668 } },
  { phrase: "1/2 katori dal", quantity: 0.5, unit: "katori", food: "dal", expected: { grams: 0.5 * 150 * 0.837 } },
  { phrase: "1.5 katori dal", quantity: 1.5, unit: "katori", food: "dal", expected: { grams: 1.5 * 150 * 0.837 } },
  { phrase: "1 katori rice (no cooked/raw)", quantity: 1, unit: "katori", food: "rice", expected: { reason: "missing_density" } },
  { phrase: "1 glass milk", quantity: 1, unit: "glass", food: "milk", expected: { grams: 250 * 1.031 } },
  { phrase: "1 glass chaas", quantity: 1, unit: "glass", food: "chaas", expected: { reason: "missing_density" } },
  { phrase: "1 cup chai", quantity: 1, unit: "cup", food: "chai", expected: { reason: "missing_density" } },

  // Fats and sugar: standard kitchen spoons with FDC densities.
  { phrase: "1 tbsp ghee", quantity: 1, unit: "tbsp", food: "ghee", expected: { grams: 15 * 0.866 } },
  { phrase: "1 tsp sugar", quantity: 1, unit: "tsp", food: "sugar", expected: { grams: 5 * 0.845 } },

  // Protein and fruit: one piece weight each, from the SR Legacy household measure.
  { phrase: "2 boiled eggs", quantity: 2, unit: null, food: "boiled egg", expected: { grams: 100 } },
  { phrase: "1 banana", quantity: 1, unit: "banana", food: "banana", expected: { grams: 118 } },
  { phrase: "2 bananas", quantity: 2, unit: "bananas", food: "Bananas, raw", expected: { grams: 236 } },
  { phrase: "1 apple", quantity: 1, unit: "apple", food: "Apples, raw, with skin", expected: { grams: 182 } },

  // Vague or food-specific measures: never guessed.
  { phrase: "a handful of peanuts", quantity: 1, unit: "handful", food: "peanuts", expected: { reason: "unknown_unit" } },
  { phrase: "1 scoop whey", quantity: 1, unit: "scoop", food: "whey protein", expected: { reason: "unknown_unit" } },
  { phrase: "1 slice bread", quantity: 1, unit: "slice", food: "bread", expected: { reason: "food_specific_measure" } },
  { phrase: "1 plate poha", quantity: 1, unit: "plate", food: "poha", expected: { reason: "food_specific_measure" } },
];

/** Grams from a result that must be resolved. */
function gramsOf(result: PortionResult): number {
  if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.reason}`);
  return result.grams;
}

describe("everyday Indian portions", () => {
  it.each(PHRASES)("$phrase", (p) => {
    const result = resolvePortion({ quantity: p.quantity, unit: p.unit }, { foodName: p.food });
    if ("reason" in p.expected) {
      expect(result).toEqual({ status: "unresolved", reason: p.expected.reason });
    } else {
      expect(gramsOf(result)).toBeCloseTo(p.expected.grams, 6);
    }
  });
});

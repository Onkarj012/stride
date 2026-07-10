import { describe, test, expect } from "vitest";
import {
  looksLikeLog,
  looksLikeFoodEstimate,
  extractUserMacros,
  applyUserMacros,
  isNegatedLogItem,
} from "./intent";

describe("looksLikeLog", () => {
  test("first-person past action is a log", () => {
    expect(looksLikeLog("I had two eggs and toast")).toBe(true);
    expect(looksLikeLog("just ate a banana")).toBe(true);
    expect(looksLikeLog("ran 5km this morning")).toBe(true);
  });

  test("sleep / water / steps reports are logs", () => {
    expect(looksLikeLog("slept 7 hours last night")).toBe(true);
    expect(looksLikeLog("drank 500ml water")).toBe(true);
    expect(looksLikeLog("8000 steps today")).toBe(true);
  });

  test("logging shortcuts are logs", () => {
    expect(looksLikeLog("log 30g whey")).toBe(true);
    expect(looksLikeLog("track 2 rotis")).toBe(true);
  });

  test("questions are never logs", () => {
    expect(looksLikeLog("how many calories in a banana?")).toBe(false);
    expect(looksLikeLog("what should I eat for lunch?")).toBe(false);
    expect(looksLikeLog("can you suggest a workout")).toBe(false);
  });

  test("empty / whitespace is not a log", () => {
    expect(looksLikeLog("")).toBe(false);
    expect(looksLikeLog("   ")).toBe(false);
  });
});

describe("looksLikeFoodEstimate", () => {
  test("food word + estimate intent", () => {
    expect(looksLikeFoodEstimate("how many calories in a banana?")).toBe(true);
    expect(looksLikeFoodEstimate("can i eat a banana and stay under target")).toBe(true);
  });

  test("requires both a food word and an estimate cue", () => {
    expect(looksLikeFoodEstimate("how many calories did I burn?")).toBe(false); // no food word
    expect(looksLikeFoodEstimate("I love chicken")).toBe(false); // no estimate cue
  });
});

describe("isNegatedLogItem", () => {
  test("does not drop a meal after a negated cooking clause", () => {
    expect(isNegatedLogItem("Didn't feel like cooking so I ate a burger", {
      type: "meal",
      description: "burger",
    })).toBe(false);
  });

  test("does not drop steps after a negated gym clause", () => {
    expect(isNegatedLogItem("No gym today but I walked 8000 steps", {
      type: "steps",
      description: "8000 steps",
    })).toBe(false);
  });

  test("drops a workout negated in the same clause", () => {
    expect(isNegatedLogItem("I haven't worked out today", {
      type: "workout",
      description: "worked out",
    })).toBe(true);
  });
});

describe("extractUserMacros", () => {
  test("pulls calories", () => {
    expect(extractUserMacros("about 350 kcal").calories).toBe(350);
    expect(extractUserMacros("around 500 calories").calories).toBe(500);
  });

  test("pulls protein / carbs / fat in grams", () => {
    const m = extractUserMacros("30g protein, 40g carbs, 10g fat");
    expect(m.protein).toBe(30);
    expect(m.carbs).toBe(40);
    expect(m.fat).toBe(10);
  });

  test("returns empty object when nothing stated", () => {
    expect(extractUserMacros("had a nice lunch")).toEqual({});
  });
});

describe("applyUserMacros", () => {
  const engineDraft = { kcal: 300, protein: 20, carbs: 30, fat: 8 };

  test("user values override engine, marked user_provided when consistent", () => {
    const r = applyUserMacros(engineDraft, { calories: 310, protein: 22, carbs: 28, fat: 9 });
    expect(r.draft.kcal).toBe(310);
    expect(r.draft.protein).toBe(22);
    expect(r.draft.nutritionSource).toBe("user_provided");
    expect(r.conflict).toBe(false);
  });

  test("large calorie divergence flags a conflict", () => {
    const r = applyUserMacros(engineDraft, { calories: 800 });
    expect(r.conflict).toBe(true);
    expect(r.draft.nutritionSource).toBe("macro_conflict");
    expect(r.reason).toMatch(/differs from my estimate/i);
  });

  test("macro grams that don't reconcile with calories flag a conflict", () => {
    // 50/50/50 g → 50*4 + 50*4 + 50*9 = 850 kcal, but user says 200 kcal
    const r = applyUserMacros(engineDraft, { calories: 200, protein: 50, carbs: 50, fat: 50 });
    expect(r.conflict).toBe(true);
  });

  test("preserves original engine estimate for reference", () => {
    const r = applyUserMacros(engineDraft, { calories: 305 });
    expect(r.draft.engineEstimate).toEqual({ kcal: 300, protein: 20, carbs: 30, fat: 8 });
  });
});

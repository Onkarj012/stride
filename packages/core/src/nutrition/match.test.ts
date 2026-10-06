import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  expandSynonyms,
  MATCH_MIN_SCORE,
  MATCH_RUNNER_UP_GAP,
  MATCH_SCORES,
  rankCandidates,
  scoreCandidate,
  scoreName,
  selectMatch,
} from "./match.ts";

describe("scoreName", () => {
  it("scores exact, prefix and contains at the fixed values", () => {
    expect(scoreName("Paneer", "paneer")).toBe(MATCH_SCORES.exact);
    expect(scoreName("paneer", "paneer tikka")).toBe(MATCH_SCORES.prefix);
    expect(scoreName("tikka", "paneer tikka masala")).toBe(MATCH_SCORES.contains);
  });

  it("matches at word boundaries only", () => {
    expect(scoreName("egg", "eggplant raw")).toBeLessThan(MATCH_MIN_SCORE);
  });

  it("falls back to token Jaccard", () => {
    expect(scoreName("white rice cooked", "rice white long grain cooked")).toBeCloseTo(3 / 5, 9);
  });

  it("ignores plurals and punctuation", () => {
    expect(scoreName("Rotis!", "roti")).toBe(MATCH_SCORES.exact);
  });
});

describe("selectMatch", () => {
  const foods = [{ name: "Chapati" }, { name: "Chapati, with ghee" }, { name: "Rice, cooked" }];

  it("matches when the best clears the threshold and the gap", () => {
    const result = selectMatch(rankCandidates("chapati", foods));
    expect(result).toMatchObject({ status: "matched", score: 1, candidate: { name: "Chapati" } });
  });

  it("reports ambiguity when two candidates are within the gap", () => {
    const result = selectMatch(rankCandidates("dal", [{ name: "Dal tadka" }, { name: "Dal makhani" }]));
    expect(result.status).toBe("ambiguous");
  });

  it("reports no match below the threshold", () => {
    expect(selectMatch(rankCandidates("pizza", foods))).toEqual({ status: "no_match" });
    expect(selectMatch([])).toEqual({ status: "no_match" });
  });
});

describe("synonyms", () => {
  it("expands each synonym spelling for search", () => {
    expect(expandSynonyms("2 roti")).toEqual(expect.arrayContaining(["2 roti", "2 chapati", "2 phulka"]));
  });
});

describe("properties", () => {
  const words = fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 1, maxLength: 4 }).map((w) => w.join(" "));

  it("scores are between 0 and 1 and a name always matches itself exactly", () => {
    fc.assert(
      fc.property(words, words, (a, b) => {
        const s = scoreName(a, b);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
        expect(scoreName(a, a)).toBe(1);
      }),
    );
  });

  it("is symmetric for names without numbers", () => {
    fc.assert(
      fc.property(words, words, (a, b) => {
        expect(scoreName(a, b)).toBe(scoreName(b, a));
      }),
    );
  });

  it("adding aliases never lowers a candidate's score", () => {
    fc.assert(
      fc.property(words, words, fc.array(words, { maxLength: 3 }), (q, name, aliases) => {
        expect(scoreCandidate(q, { name, aliases })).toBeGreaterThanOrEqual(scoreCandidate(q, { name }));
      }),
    );
  });

  it("a match always leads its runner-up by the gap", () => {
    fc.assert(
      fc.property(words, fc.array(words, { maxLength: 6 }), (q, names) => {
        const ranked = rankCandidates(q, names.map((name) => ({ name })));
        const result = selectMatch(ranked);
        if (result.status !== "matched") return;
        expect(result.score).toBeGreaterThanOrEqual(MATCH_MIN_SCORE);
        const runnerUp = ranked[1];
        if (runnerUp) expect(result.score - runnerUp.score).toBeGreaterThanOrEqual(MATCH_RUNNER_UP_GAP);
      }),
    );
  });
});

import { FOOD_SPECIFIC_MEASURES, HOUSEHOLD_VESSELS, MASS_UNITS_G, VOLUME_UNITS_ML } from "./household_measures.ts";
import { tokenize } from "./text.ts";
import { normalizeUnit, UNIT_ALIASES } from "./units.ts";

/** Scores for each kind of name agreement. Anything weaker falls back to token Jaccard. */
export const MATCH_SCORES = { exact: 1, prefix: 0.88, contains: 0.78 } as const;

/** A candidate below this score is not a match at all. */
export const MATCH_MIN_SCORE = 0.7;

/** The best candidate must lead the runner-up by at least this much, or the match is ambiguous. */
export const MATCH_RUNNER_UP_GAP = 0.1;

/**
 * Words that name the same food. Each group maps to its first word, on both the query and candidate side,
 * so retrieval and ranking cannot disagree about "roti" and "chapati".
 */
export const FOOD_SYNONYMS: readonly (readonly string[])[] = [
  ["roti", "chapati", "chapatti", "phulka"],
  ["dal", "dhal", "daal", "lentil"],
  ["curd", "dahi", "yogurt", "yoghurt"],
  ["rice", "chawal"],
  ["potato", "aloo", "alu"],
  ["okra", "bhindi"],
  ["egg", "anda"],
  ["milk", "doodh"],
  ["chickpea", "chana", "chole"],
  ["spinach", "palak"],
];

const CANONICAL: ReadonlyMap<string, string> = new Map(
  FOOD_SYNONYMS.flatMap((group) => {
    const canonical = tokenize(group[0] ?? "")[0] ?? "";
    return group.map((word): [string, string] => [tokenize(word)[0] ?? word, canonical]);
  }),
);

/** Normalized tokens with synonyms collapsed to one canonical word. */
export function canonicalTokens(text: string): string[] {
  return tokenize(text).map((t) => CANONICAL.get(t) ?? t);
}

/** Every synonym spelling of a query, for search indexes that cannot canonicalize at query time. */
export function expandSynonyms(query: string): string[] {
  const tokens = tokenize(query);
  const variants = new Set([tokens.join(" ")]);
  tokens.forEach((token, i) => {
    const canonical = CANONICAL.get(token);
    if (canonical === undefined) return;
    for (const group of FOOD_SYNONYMS) {
      if (tokenize(group[0] ?? "")[0] !== canonical) continue;
      for (const word of group) variants.add([...tokens.slice(0, i), ...tokenize(word), ...tokens.slice(i + 1)].join(" "));
    }
  });
  return [...variants];
}

/** True when a token is a number such as "2" or "1.5". */
function isNumber(token: string): boolean {
  return /^\d/.test(token);
}

/** Unit words that can sit between a number and its food, as in "2 cups rice". */
const UNIT_WORDS: ReadonlySet<string> = new Set(
  [
    ...Object.keys(MASS_UNITS_G),
    ...Object.keys(VOLUME_UNITS_ML),
    ...Object.keys(HOUSEHOLD_VESSELS),
    ...FOOD_SPECIFIC_MEASURES,
    ...Object.keys(UNIT_ALIASES),
  ].flatMap(tokenize),
);

/** Each number with its normalized units and first food word, sorted, so amount, unit and food stay together. */
function quantityKey(tokens: readonly string[]): string {
  return tokens
    .flatMap((t, i) => {
      if (!isNumber(t)) return [];
      const units: string[] = [];
      let food = "";
      for (const word of tokens.slice(i + 1)) {
        if (word === "of") continue;
        if (!UNIT_WORDS.has(word)) {
          food = word;
          break;
        }
        units.push(normalizeUnit(word));
      }
      return [[t, ...units, food].join(" ")];
    })
    .sort()
    .join("|");
}

/** Scores one query against one name. Word-boundary prefix and containment, in either direction. */
export function scoreName(query: string, name: string): number {
  const q = canonicalTokens(query);
  const n = canonicalTokens(name);
  if (q.length === 0 || n.length === 0) return 0;

  // "2 rotis and dal" must never match a saved "4 rotis and dal", and "2 rotis and 1 dal" never "1 roti and 2 dal".
  const qQuantities = quantityKey(q);
  if (qQuantities !== "" && qQuantities !== quantityKey(n)) return 0;

  const qs = q.join(" ");
  const ns = n.join(" ");
  if (qs === ns) return MATCH_SCORES.exact;
  if (ns.startsWith(`${qs} `) || qs.startsWith(`${ns} `)) return MATCH_SCORES.prefix;
  if (` ${ns} `.includes(` ${qs} `) || ` ${qs} `.includes(` ${ns} `)) return MATCH_SCORES.contains;

  const qSet = new Set(q);
  const nSet = new Set(n);
  const shared = [...qSet].filter((t) => nSet.has(t)).length;
  return shared / (qSet.size + nSet.size - shared);
}

/** Anything the matcher can rank: a food record, a user food or a food memory. */
export interface MatchCandidate {
  name: string;
  aliases?: readonly string[];
}

/** Best score of a query against a candidate's name and every alias. Aliases count at ranking time, not only at search. */
export function scoreCandidate(query: string, candidate: MatchCandidate): number {
  return Math.max(scoreName(query, candidate.name), ...(candidate.aliases ?? []).map((a) => scoreName(query, a)));
}

/** A candidate with its score. */
export interface RankedCandidate<T extends MatchCandidate> {
  candidate: T;
  score: number;
}

/** Scores and sorts candidates, best first. Ties sort by name so results are stable. */
export function rankCandidates<T extends MatchCandidate>(query: string, candidates: readonly T[]): RankedCandidate<T>[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(query, candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
}

/** Outcome of picking one candidate from a ranked list. */
export type MatchSelection<T extends MatchCandidate> =
  | { status: "matched"; candidate: T; score: number }
  | { status: "ambiguous"; ranked: RankedCandidate<T>[] }
  | { status: "no_match" };

/** Picks the top candidate when it clears `MATCH_MIN_SCORE` and leads the runner-up by `MATCH_RUNNER_UP_GAP`. */
export function selectMatch<T extends MatchCandidate>(ranked: readonly RankedCandidate<T>[]): MatchSelection<T> {
  const [best, runnerUp] = ranked;
  if (best === undefined || best.score < MATCH_MIN_SCORE) return { status: "no_match" };
  if (runnerUp !== undefined && best.score - runnerUp.score < MATCH_RUNNER_UP_GAP) {
    return { status: "ambiguous", ranked: ranked.filter((r) => r.score >= MATCH_MIN_SCORE) };
  }
  return { status: "matched", candidate: best.candidate, score: best.score };
}

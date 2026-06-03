/**
 * food_memory_match.ts
 * Pure deterministic matching — no LLM, no Convex deps.
 * Keeps latency near zero on the auto-apply path.
 */

const FILLER = new Set([
  "my", "usual", "regular", "same", "some", "a", "an", "the",
  "little", "bit", "small", "big", "large", "medium",
  "had", "ate", "have", "homemade", "home", "made",
]);

/** Lowercase + strip filler words + normalise whitespace */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w))
    .join(" ")
    .trim();
}

export interface FoodMemoryEntry {
  _id: string;
  normalizedName: string;
  displayName: string;
  aliases: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  components?: string;
  timesLogged: number;
  source: string;
}

export interface MatchResult {
  entry: FoodMemoryEntry;
  score: number; // 0–1
}

/**
 * Word-overlap Jaccard similarity between two normalised name strings.
 */
function jaccardWords(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Score a query against one memory entry.
 * Checks primary normalizedName and all aliases, returns best.
 */
function scoreEntry(query: string, entry: FoodMemoryEntry): number {
  const candidates = [entry.normalizedName, ...entry.aliases.map(normalizeName)];
  let best = 0;
  for (const c of candidates) {
    const s = jaccardWords(query, c);
    if (s > best) best = s;
  }
  return best;
}

/** Minimum score to consider a match. Tune if too loose/strict. */
export const MATCH_THRESHOLD = 0.55;

/** Minimum timesLogged before we auto-apply (skip confirm modal). */
export const AUTO_APPLY_MIN_LOGGED = 2;

/**
 * Find the best matching memory entry for a query string.
 * Returns null if nothing clears the threshold.
 */
export function findBestMatch(
  query: string,
  entries: FoodMemoryEntry[],
): MatchResult | null {
  const normalized = normalizeName(query);
  if (!normalized) return null;

  let best: MatchResult | null = null;
  for (const entry of entries) {
    const score = scoreEntry(normalized, entry);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  return best;
}

import {
  COUNT_MEASURES,
  DENSITIES,
  type DensityEntry,
  FLATBREAD_KEYS,
  FOOD_SPECIFIC_MEASURES,
  GENERIC_BREAD_PARTS,
  HOUSEHOLD_VESSELS,
  MASS_UNITS_G,
  PIECE_ALIASES,
  PIECE_UNIT,
  PIECE_WEIGHTS,
  type PieceWeight,
  VOLUME_UNITS_ML,
} from "./household_measures.ts";
import { normalizeText, tokenize } from "./text.ts";

/** Confidence of each resolution method. The gate combines these with match and extraction confidence. */
export const PORTION_CONFIDENCE = {
  mass: 1,
  userMeasure: 0.95,
  foodPortion: 0.9,
  volumeRecordDensity: 0.85,
  volumeTableDensity: 0.8,
  householdVessel: 0.6,
  pieceTable: 0.7,
} as const;

/** Spellings that map to a canonical unit. Keys and values are already in `normalizeText` form. */
export const UNIT_ALIASES: Readonly<Record<string, string>> = {
  gram: "g", gm: "g", gms: "g", gr: "g", grm: "g",
  kilogram: "kg", kgs: "kg", kilo: "kg",
  milligram: "mg",
  ounce: "oz",
  pound: "lb", lbs: "lb",
  milliliter: "ml", millilitre: "ml", mls: "ml",
  liter: "l", litre: "l", ltr: "l",
  teaspoon: "tsp", tsps: "tsp",
  // "spoon" has no size. Treated as a teaspoon so the draft shows an estimate for review.
  spoon: "tsp", chamach: "tsp",
  tablespoon: "tbsp", tbsps: "tbsp", tbs: "tbsp",
  "fluid ounce": "fl oz", floz: "fl oz",
  vati: "katori", wati: "katori",
  tumbler: "glass",
  karchi: "ladle",
  pc: PIECE_UNIT, pcs: PIECE_UNIT, each: PIECE_UNIT, whole: PIECE_UNIT, nos: PIECE_UNIT, no: PIECE_UNIT,
};

/** A user's own measure, e.g. "my katori = 180 ml" or "my roti = 45 g". */
export type UserMeasure = { measure: string; grams: number } | { measure: string; ml: number };

/** What the resolver knows about the matched food. */
export interface PortionContext {
  foodName: string;
  /** Density from the food record or barcode product, preferred over the seed table. */
  densityGPerMl?: number | null;
  /** That food's `food_portions` rows. */
  portions?: readonly { measure: string; gramsPerMeasure: number }[];
  userMeasures?: readonly UserMeasure[];
  /** Skips the PIECE_WEIGHTS seeds. A count then uses the food's own "piece" row, so an AI estimate's grams hold. */
  skipSeedPieceWeights?: boolean;
}

/** How a resolved portion got its grams. */
export type PortionMethod = "mass" | "user_measure" | "food_portion" | "volume" | "piece";

/** Why a portion could not be turned into grams. */
export type UnresolvedReason =
  | "invalid_quantity"
  | "unknown_unit"
  | "missing_density"
  | "missing_piece_weight"
  | "food_specific_measure"
  | "conflicting_portions";

/** Grams for a portion, or the reason there are none. Unresolved results never carry a guessed weight. */
export type PortionResult =
  | { status: "resolved"; grams: number; confidence: number; method: PortionMethod }
  | { status: "unresolved"; reason: UnresolvedReason };

/** Own-property lookup, so input like "constructor" never reaches Object.prototype. */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Maps any spelling of a unit to its canonical name. Empty input means a bare count, which is a piece. */
export function normalizeUnit(unit: string | null | undefined): string {
  const text = normalizeText(unit ?? "");
  if (text === "") return PIECE_UNIT;
  return own(UNIT_ALIASES, text) ?? own(UNIT_ALIASES, text.replace(/ /g, "")) ?? text;
}

/** True when every key token appears in the name and no excluded token does. */
function tokensMatch(nameTokens: ReadonlySet<string>, keys: readonly string[], excludes: readonly string[] = []): boolean {
  const keyTokens = keys.flatMap(tokenize);
  const excludeTokens = excludes.flatMap(tokenize);
  return keyTokens.every((t) => nameTokens.has(t)) && !excludeTokens.some((t) => nameTokens.has(t));
}

/** Picks the entry with the most matching key tokens, so specific keys beat generic ones. */
function longestMatch<T extends { keys: readonly string[]; excludes?: readonly string[] }>(
  name: string,
  entries: readonly T[],
): T | null {
  const nameTokens = new Set(tokenize(name));
  let best: T | null = null;
  for (const entry of entries) {
    if (!tokensMatch(nameTokens, entry.keys, entry.excludes)) continue;
    if (best === null || entry.keys.length > best.keys.length) best = entry;
  }
  return best;
}

/** Comma parts that name a food group rather than the food, so "Beverages, tea" is headed by "tea". */
const CATEGORY_PARTS: ReadonlySet<string> = new Set(["beverage"]);

/** Last word of the name's first non-category comma part, without parentheses: "Milk, whole" gives "milk", "Milk chocolate" gives "chocolate". */
function headToken(foodName: string): string | undefined {
  const parts = foodName.replace(/\(.*?\)/g, "").split(",").map(normalizeText);
  const head = parts.find((part) => part !== "" && !CATEGORY_PARTS.has(part));
  return head?.split(" ").at(-1);
}

/** Words that say a drink was made, so "ground" there means the grounds it came from ("brewed from grounds"). */
const MADE_DRINK_WORDS: ReadonlySet<string> = new Set(["brewed", "prepared"]);

/** Looks up a density in g/ml for a food name from the seed table, or null when none applies. */
export function densityFor(foodName: string): number | null {
  // Only entries naming the food's head word apply, so "milk chocolate" never gets liquid milk's density.
  const head = headToken(foodName);
  const made = tokenize(foodName).some((t) => MADE_DRINK_WORDS.has(t)) || normalizeText(foodName).includes("from ground");
  // "ground" blocks a drink only when nothing says it was made. "Coffee, brewed from grounds" is a made drink.
  const entries = DENSITIES.filter((d) => head !== undefined && d.keys.flatMap(tokenize).includes(head))
    .map((d): DensityEntry => (made && d.excludes ? { ...d, excludes: d.excludes.filter((t) => t !== "ground") } : d));
  return longestMatch(foodName, entries)?.gPerMl ?? null;
}

/** Looks up grams per piece for a food name from the seed table, or null when none applies. */
export function pieceWeightFor(foodName: string): number | null {
  return longestMatch(foodName, PIECE_WEIGHTS)?.grams ?? null;
}

/** Piece rows whose keys all appear in the food name, ignoring excludes. */
function pieceRowsFor(foodName: string): PieceWeight[] {
  const nameTokens = new Set(tokenize(foodName));
  return PIECE_WEIGHTS.filter((p) => tokensMatch(nameTokens, p.keys));
}

/** Key tokens of a piece row as a set. */
function keyTokenSet(row: PieceWeight): Set<string> {
  return new Set(row.keys.flatMap(tokenize));
}

/**
 * The piece rows that decide a food name's weight. Any excluded word vetoes. Otherwise the rows must agree on grams,
 * or one row must have strictly more key tokens than the others and contain all of theirs.
 */
function pieceRowsForName(foodName: string): PieceWeight[] {
  const nameTokens = new Set(tokenize(foodName));
  const rows = pieceRowsFor(foodName);
  if (rows.length === 0 || rows.some((r) => !tokensMatch(nameTokens, r.keys, r.excludes))) return [];
  const [first] = rows;
  if (first === undefined) return [];
  if (rows.every((r) => r.grams === first.grams)) return rows;
  const specific = rows.find((r) => {
    const keys = keyTokenSet(r);
    return rows.every((o) => {
      if (o === r) return true;
      const otherKeys = keyTokenSet(o);
      return keys.size > otherKeys.size && [...otherKeys].every((t) => keys.has(t));
    });
  });
  return specific ? [specific] : [];
}

/** Last word of a normalized phrase. */
function lastWord(phrase: string): string | undefined {
  return phrase.split(" ").at(-1);
}

/**
 * Head words of a food name: the last word of its head part and of each "or" alternative. The head part is the first
 * comma part, except "Bread, paratha": a generic bread class hands the head to a flatbread second part.
 */
function headWords(foodName: string): Set<string> {
  const parts = foodName.replace(/\(.*?\)/g, "").split(",").map(normalizeText).filter((part) => part !== "");
  const [first, ...rest] = parts;
  if (first === undefined) return new Set();
  const [second] = rest;
  const breadClass = GENERIC_BREAD_PARTS.includes(first) && second !== undefined && FLATBREAD_KEYS.includes(lastWord(second) ?? "");
  const headPart = breadClass ? second : first;
  const alternatives = headPart.split(" or ");
  return new Set(alternatives.map(lastWord).filter((word): word is string => word !== undefined));
}

/** The piece name an alias stands for. "chapati" and "roti" are one piece. */
function pieceName(name: string): string {
  return own(PIECE_ALIASES, name) ?? name;
}

/** True when every word of a unit appears in the food name, so "paratha" names "Masala paratha" but "slice" not "Pizza". */
export function unitNamesFood(unit: string, foodName: string): boolean {
  const nameTokens = new Set(tokenize(foodName).map(pieceName));
  const unitTokens = tokenize(unit).map(pieceName);
  return unitTokens.length > 0 && unitTokens.every((t) => nameTokens.has(t));
}

/** Seed for a food whose head word names a piece row: grams, and the piece names it answers to. Null when none. */
function headedPieceSeed(foodName: string): { grams: number; names: ReadonlySet<string> } | null {
  const heads = headWords(foodName);
  const rows = pieceRowsForName(foodName).filter((r) => r.keys.flatMap(tokenize).some((t) => heads.has(t)));
  const [first] = rows;
  if (first === undefined) return null;
  return { grams: first.grams, names: new Set(rows.flatMap((r) => r.keys.flatMap(tokenize)).map(pieceName)) };
}

/** Grams from the food's portion rows whose measure passes `matches`: null when none, or "conflict" when they disagree. */
function portionGrams(portions: PortionContext["portions"], matches: (measure: string) => boolean): number | "conflict" | null {
  const grams = new Set(
    (portions ?? []).filter((p) => matches(normalizeUnit(p.measure)) && p.gramsPerMeasure > 0).map((p) => p.gramsPerMeasure),
  );
  // Two different weights for one measure (banana "cup, mashed" vs "cup, sliced") is ambiguous, so do not pick one.
  if (grams.size > 1) return "conflict";
  const [only] = grams;
  return only ?? null;
}

/**
 * Grams for a count. A seed whose key is the food's head word wins. Otherwise the food's own count row decides:
 * any count label for a bare count, only "piece" for an explicit unit. A named unit ("roti") never borrows a seed.
 */
function pieceGrams(quantity: number, rawUnit: string, isBare: boolean, ctx: PortionContext): PortionResult {
  if (!isBare && rawUnit === PIECE_UNIT) {
    const explicitPiece = portionGrams(ctx.portions, (measure) => measure === PIECE_UNIT);
    if (explicitPiece === "conflict") return { status: "unresolved", reason: "conflicting_portions" };
    if (explicitPiece !== null) return resolved(quantity * explicitPiece, PORTION_CONFIDENCE.foodPortion, "food_portion");
  }
  const seed = ctx.skipSeedPieceWeights === true ? null : headedPieceSeed(ctx.foodName);
  if (seed !== null) {
    // A named unit must name this food's seed, so "roti" never counts a banana.
    if (rawUnit === PIECE_UNIT || tokenize(rawUnit).every((w) => seed.names.has(pieceName(w)))) {
      return resolved(quantity * seed.grams, PORTION_CONFIDENCE.pieceTable, "piece");
    }
    return { status: "unresolved", reason: "missing_piece_weight" };
  }
  if (rawUnit !== PIECE_UNIT) return { status: "unresolved", reason: "missing_piece_weight" };
  const matches = isBare ? (measure: string) => COUNT_MEASURES.includes(measure) : (measure: string) => measure === PIECE_UNIT;
  const perCount = portionGrams(ctx.portions, matches);
  if (perCount === "conflict") return { status: "unresolved", reason: "conflicting_portions" };
  if (perCount !== null) return resolved(quantity * perCount, PORTION_CONFIDENCE.foodPortion, "food_portion");
  return { status: "unresolved", reason: "missing_piece_weight" };
}

/** Usable density: a positive finite number from the record, else the seed table, else null. */
function resolveDensity(ctx: PortionContext): { gPerMl: number; fromRecord: boolean } | null {
  const fromRecord = ctx.densityGPerMl;
  if (typeof fromRecord === "number" && Number.isFinite(fromRecord) && fromRecord > 0) {
    return { gPerMl: fromRecord, fromRecord: true };
  }
  const fromTable = densityFor(ctx.foodName);
  return fromTable === null ? null : { gPerMl: fromTable, fromRecord: false };
}

/** Builds a resolved result. */
function resolved(grams: number, confidence: number, method: PortionMethod): PortionResult {
  return { status: "resolved", grams, confidence, method };
}

/** Turns `{quantity, unit}` from extraction into grams. Unknown units or missing data return `unresolved`, never a guess. */
export function resolvePortion(
  input: { quantity: number; unit: string | null | undefined },
  ctx: PortionContext,
): PortionResult {
  const { quantity } = input;
  if (!Number.isFinite(quantity) || quantity <= 0) return { status: "unresolved", reason: "invalid_quantity" };
  const rawUnit = normalizeUnit(input.unit);
  const isBare = normalizeText(input.unit ?? "") === "";
  // "1 phulka" arrives with the food name as its unit; treat it as one piece of that food.
  const unit = ctx.skipSeedPieceWeights !== true && pieceWeightFor(rawUnit) !== null ? PIECE_UNIT : rawUnit;

  const directMeasureNames = new Set([rawUnit, unit]);
  if (unit === PIECE_UNIT) directMeasureNames.add(normalizeText(ctx.foodName));
  const userMeasures = ctx.userMeasures ?? [];
  let userMeasure = userMeasures.find((m) => directMeasureNames.has(normalizeUnit(m.measure)));
  if (isBare) {
    const inferredMeasureNames = new Set<string>();
    for (const portion of ctx.portions ?? []) {
      const measure = normalizeUnit(portion.measure);
      if (COUNT_MEASURES.includes(measure) && !directMeasureNames.has(measure)) inferredMeasureNames.add(measure);
    }
    if (userMeasure === undefined) {
      const density = resolveDensity(ctx);
      const inferred: { measure: UserMeasure; grams: number }[] = [];
      for (const m of userMeasures) {
        if (!inferredMeasureNames.has(normalizeUnit(m.measure))) continue;
        if ("grams" in m && Number.isFinite(m.grams) && m.grams > 0) {
          inferred.push({ measure: m, grams: m.grams });
          continue;
        }
        if ("ml" in m && Number.isFinite(m.ml) && m.ml > 0 && density !== null) {
          inferred.push({ measure: m, grams: m.ml * density.gPerMl });
        }
      }
      const inferredWeights = new Set(inferred.map(({ grams }) => grams));
      if (inferredWeights.size > 1) return { status: "unresolved", reason: "conflicting_portions" };
      inferred.sort((a, b) => normalizeUnit(a.measure.measure).localeCompare(normalizeUnit(b.measure.measure)));
      userMeasure = inferred[0]?.measure;
    }
  }
  if (userMeasure && "grams" in userMeasure && userMeasure.grams > 0) {
    return resolved(quantity * userMeasure.grams, PORTION_CONFIDENCE.userMeasure, "user_measure");
  }

  const gramsPerMass = own(MASS_UNITS_G, unit);
  if (gramsPerMass !== undefined) return resolved(quantity * gramsPerMass, PORTION_CONFIDENCE.mass, "mass");

  // The user's own volume for a measure beats the food's portion row for that measure.
  const userMl = userMeasure && "ml" in userMeasure && userMeasure.ml > 0 ? userMeasure.ml : undefined;
  // Counts skip this step, so a packaged "piece" row cannot beat the vetted piece weight.
  if (userMl === undefined && unit !== PIECE_UNIT) {
    const perMeasure = portionGrams(ctx.portions, (measure) => measure === unit);
    if (perMeasure === "conflict") return { status: "unresolved", reason: "conflicting_portions" };
    if (perMeasure !== null) return resolved(quantity * perMeasure, PORTION_CONFIDENCE.foodPortion, "food_portion");
  }

  const vessel = own(HOUSEHOLD_VESSELS, unit);
  const mlPerUnit = userMl ?? own(VOLUME_UNITS_ML, unit) ?? vessel?.ml;
  if (mlPerUnit !== undefined) {
    const density = resolveDensity(ctx);
    if (density === null) return { status: "unresolved", reason: "missing_density" };
    const base = density.fromRecord ? PORTION_CONFIDENCE.volumeRecordDensity : PORTION_CONFIDENCE.volumeTableDensity;
    const confidence = userMl !== undefined
      ? Math.min(base, PORTION_CONFIDENCE.userMeasure)
      : vessel !== undefined ? Math.min(base, PORTION_CONFIDENCE.householdVessel) : base;
    return resolved(quantity * mlPerUnit * density.gPerMl, confidence, "volume");
  }

  // With seeds skipped, a named unit takes the food's piece row only when the food name carries that unit.
  // "2 slice" of a whole pizza must not reuse one piece row for each slice.
  if (ctx.skipSeedPieceWeights === true && unit !== PIECE_UNIT && unitNamesFood(unit, ctx.foodName)) {
    const piece = portionGrams(ctx.portions, (measure) => measure === PIECE_UNIT);
    if (piece === "conflict") return { status: "unresolved", reason: "conflicting_portions" };
    if (piece !== null) return resolved(quantity * piece, PORTION_CONFIDENCE.foodPortion, "food_portion");
  }

  if (unit === PIECE_UNIT) return pieceGrams(quantity, rawUnit, isBare, ctx);

  if (FOOD_SPECIFIC_MEASURES.includes(unit)) return { status: "unresolved", reason: "food_specific_measure" };
  return { status: "unresolved", reason: "unknown_unit" };
}

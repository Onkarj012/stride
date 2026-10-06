import {
  DENSITIES,
  FOOD_SPECIFIC_MEASURES,
  HOUSEHOLD_VESSELS,
  MASS_UNITS_G,
  PIECE_UNIT,
  PIECE_WEIGHTS,
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

/** Looks up a density in g/ml for a food name from the seed table, or null when none applies. */
export function densityFor(foodName: string): number | null {
  return longestMatch(foodName, DENSITIES)?.gPerMl ?? null;
}

/** Looks up grams per piece for a food name from the seed table, or null when none applies. */
export function pieceWeightFor(foodName: string): number | null {
  return longestMatch(foodName, PIECE_WEIGHTS)?.grams ?? null;
}

/** Returns grams per measure from the food's own portion rows, null when absent, or "conflict" when rows disagree. */
function foodPortionGrams(unit: string, portions: PortionContext["portions"]): number | "conflict" | null {
  const grams = new Set(
    (portions ?? []).filter((p) => normalizeUnit(p.measure) === unit && p.gramsPerMeasure > 0).map((p) => p.gramsPerMeasure),
  );
  // Two different weights for one measure (banana "cup, mashed" vs "cup, sliced") is ambiguous, so do not pick one.
  if (grams.size > 1) return "conflict";
  const [only] = grams;
  return only ?? null;
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
  // "1 phulka" arrives with the food name as its unit; treat it as one piece of that food.
  const unit = pieceWeightFor(rawUnit) !== null ? PIECE_UNIT : rawUnit;

  const measureNames = new Set([rawUnit, unit]);
  if (unit === PIECE_UNIT) measureNames.add(normalizeText(ctx.foodName));
  const userMeasure = (ctx.userMeasures ?? []).find((m) => measureNames.has(normalizeUnit(m.measure)));
  if (userMeasure && "grams" in userMeasure && userMeasure.grams > 0) {
    return resolved(quantity * userMeasure.grams, PORTION_CONFIDENCE.userMeasure, "user_measure");
  }

  const gramsPerMass = own(MASS_UNITS_G, unit);
  if (gramsPerMass !== undefined) return resolved(quantity * gramsPerMass, PORTION_CONFIDENCE.mass, "mass");

  // The user's own volume for a measure beats the food's portion row for that measure.
  const userMl = userMeasure && "ml" in userMeasure && userMeasure.ml > 0 ? userMeasure.ml : undefined;
  if (userMl === undefined) {
    const portionGrams = foodPortionGrams(unit, ctx.portions);
    if (portionGrams === "conflict") return { status: "unresolved", reason: "conflicting_portions" };
    if (portionGrams !== null) return resolved(quantity * portionGrams, PORTION_CONFIDENCE.foodPortion, "food_portion");
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

  if (unit === PIECE_UNIT) {
    const perPiece = pieceWeightFor(ctx.foodName) ?? pieceWeightFor(rawUnit);
    if (perPiece === null) return { status: "unresolved", reason: "missing_piece_weight" };
    return resolved(quantity * perPiece, PORTION_CONFIDENCE.pieceTable, "piece");
  }

  if (FOOD_SPECIFIC_MEASURES.includes(unit)) return { status: "unresolved", reason: "food_specific_measure" };
  return { status: "unresolved", reason: "unknown_unit" };
}

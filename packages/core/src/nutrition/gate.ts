import { hasAtwaterMismatch } from "./compute.ts";
import type { Nutrients } from "./types.ts";
import type { PortionResult } from "./units.ts";

/** D7: every item needs a match at least this strong to auto-commit. */
export const GATE_MIN_MATCH_SCORE = 0.85;

/** Combined item confidence below this sends the log to a draft card. */
export const GATE_MIN_CONFIDENCE = 0.6;

/** A single item above these limits is flagged. Values are kept as entered; the user confirms them in a draft. */
export const PLAUSIBILITY_LIMITS = { maxItemGrams: 2000, maxItemKcal: 3000 } as const;

/** Where an item came from. Photo items are always badged "estimated" (D7). */
export type InputSource = "text" | "voice" | "photo" | "barcode";

/** Flags that block auto-commit. */
export type ClampFlag = "grams_over_limit" | "kcal_over_limit" | "atwater_mismatch";

/** One extracted item after matching and portion resolution. */
export interface GateItem {
  source: InputSource;
  /** The model's confidence in its own `{food, quantity, unit}` extraction, 0-1. */
  extractionConfidence: number;
  /** The selected food's match score, or null when nothing matched. */
  matchScore: number | null;
  portion: PortionResult;
  flags: readonly ClampFlag[];
}

/** Why an item kept the log out of auto-commit. */
export type GateReason = "unmatched" | "low_match" | "unresolved_portion" | "low_confidence" | "clamp_flag";

/** Per-item gate outcome. */
export interface GatedItem {
  confidence: number;
  estimated: boolean;
  reasons: GateReason[];
}

/** Whole-log decision plus each item's outcome. */
export interface GateResult {
  decision: "commit" | "draft";
  items: GatedItem[];
}

/** Clamps a confidence value into 0-1, treating non-finite input as 0. */
function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Combines extraction, portion and match confidence by taking the minimum.
 * The weakest step bounds how sure we can be, so a 0.35 portion stays 0.35 however sure the model is.
 * Min is used instead of a product so thresholds stay readable and two decent steps are not punished twice.
 */
export function combineConfidence(parts: { extraction: number; portion: number; match: number }): number {
  return Math.min(clamp01(parts.extraction), clamp01(parts.portion), clamp01(parts.match));
}

/** Flags implausible or self-inconsistent item values. Nothing is changed; flagged items go to a draft. */
export function clampFlags(grams: number, nutrients: Nutrients): ClampFlag[] {
  const flags: ClampFlag[] = [];
  if (grams > PLAUSIBILITY_LIMITS.maxItemGrams) flags.push("grams_over_limit");
  if (nutrients.kcal > PLAUSIBILITY_LIMITS.maxItemKcal) flags.push("kcal_over_limit");
  if (hasAtwaterMismatch(nutrients)) flags.push("atwater_mismatch");
  return flags;
}

/** Gates one item: combined confidence, the estimated badge and every reason it cannot auto-commit. */
export function gateItem(item: GateItem): GatedItem {
  const portionConfidence = item.portion.status === "resolved" ? item.portion.confidence : 0;
  const confidence = combineConfidence({
    extraction: item.extractionConfidence,
    portion: portionConfidence,
    match: item.matchScore ?? 0,
  });
  const reasons: GateReason[] = [];
  if (item.matchScore === null) reasons.push("unmatched");
  else if (item.matchScore < GATE_MIN_MATCH_SCORE) reasons.push("low_match");
  if (item.portion.status !== "resolved") reasons.push("unresolved_portion");
  if (confidence < GATE_MIN_CONFIDENCE) reasons.push("low_confidence");
  if (item.flags.length > 0) reasons.push("clamp_flag");
  return { confidence, estimated: item.source === "photo", reasons };
}

/** D7 gate: auto-commit only when every item passes; otherwise the whole log becomes a draft. */
export function evaluateGate(items: readonly GateItem[]): GateResult {
  const gated = items.map(gateItem);
  const allPass = gated.length > 0 && gated.every((g) => g.reasons.length === 0);
  return { decision: allPass ? "commit" : "draft", items: gated };
}

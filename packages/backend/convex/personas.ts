/** Canonical coach vocabulary used at backend boundaries. */
export type CanonicalPersona =
  | "general"
  | "nutrition"
  | "workout"
  | "recovery"
  | "hydration"
  | "habit"
  | "wellness";

/** Legacy IDs still emitted by the original web coach picker. */
export type LegacyPersona =
  | "overall"
  | "diet"
  | "workout"
  | "recovery"
  | "water"
  | "habit"
  | "mindset";

export const LEGACY_TO_CANONICAL: Record<LegacyPersona, CanonicalPersona> = {
  overall: "general",
  diet: "nutrition",
  workout: "workout",
  recovery: "recovery",
  water: "hydration",
  habit: "habit",
  mindset: "wellness",
};

export const CANONICAL_TO_LEGACY: Record<CanonicalPersona, LegacyPersona> = {
  general: "overall",
  nutrition: "diet",
  workout: "workout",
  recovery: "recovery",
  hydration: "water",
  habit: "habit",
  wellness: "mindset",
};

const CANONICAL_IDS = new Set<string>(Object.keys(CANONICAL_TO_LEGACY));
const LEGACY_IDS = new Set<string>(Object.keys(LEGACY_TO_CANONICAL));

export function toCanonicalPersona(value?: string | null): CanonicalPersona {
  if (value && CANONICAL_IDS.has(value)) return value as CanonicalPersona;
  if (value && LEGACY_IDS.has(value)) return LEGACY_TO_CANONICAL[value as LegacyPersona];
  return "general";
}

export function toLegacyPersona(value?: string | null): LegacyPersona {
  if (value && LEGACY_IDS.has(value)) return value as LegacyPersona;
  if (value && CANONICAL_IDS.has(value)) return CANONICAL_TO_LEGACY[value as CanonicalPersona];
  return "overall";
}


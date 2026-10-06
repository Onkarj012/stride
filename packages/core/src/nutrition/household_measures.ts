/**
 * Seed data for portion resolution: standard units, Indian household measures, piece weights and densities.
 * Owners override any of these per user through `user_measures` (plan 007 section 3.2).
 *
 * FDC-derived densities divide the SR Legacy "1 cup" gram weight by 236.588 ml (one US customary cup).
 */

/** Grams per unit for mass units. Exact by definition (NIST Handbook 44, Appendix C). */
export const MASS_UNITS_G: Readonly<Record<string, number>> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.349523125,
  lb: 453.59237,
};

/** Millilitres per unit for standard kitchen volumes. FDA nutrition-labeling values, 21 CFR 101.9(b)(5)(viii). */
export const VOLUME_UNITS_ML: Readonly<Record<string, number>> = {
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  cup: 240,
  "fl oz": 30,
};

/** An Indian household vessel measured by volume. Sizes vary by kitchen, so results carry lower confidence. */
export interface HouseholdVessel {
  ml: number;
  note: string;
}

/** Indian household vessels. Volume times food density gives grams. */
export const HOUSEHOLD_VESSELS: Readonly<Record<string, HouseholdVessel>> = {
  katori: { ml: 150, note: "Standard small steel katori. Same value as the previous Stride engine and plan 007 D10." },
  bowl: { ml: 250, note: "Medium serving bowl. Same value as the previous Stride engine." },
  glass: { ml: 250, note: "Common steel or glass tumbler for water, milk, lassi, chaas." },
  ladle: { ml: 60, note: "Serving ladle (karchi) of dal or curry. Household estimate, owner-editable." },
};

/**
 * Measures that only make sense for a specific food (a plate of poha is not a plate of biryani).
 * They resolve only through that food's `food_portions` row or a user measure, never a generic default.
 * "piece" also resolves through `PIECE_WEIGHTS`.
 */
export const FOOD_SPECIFIC_MEASURES: readonly string[] = ["plate", "serving", "slice", "piece"];

/** The unit used when the input gives a count with no unit, as in "2 rotis". */
export const PIECE_UNIT = "piece";

/** Grams for one piece of a food, matched when every key token appears in the food name. */
export interface PieceWeight {
  keys: readonly string[];
  grams: number;
  note: string;
}

/** Piece weights for foods logged by count. */
export const PIECE_WEIGHTS: readonly PieceWeight[] = [
  { keys: ["roti"], grams: 40, note: "Whole-wheat roti, about 30 g atta. Plan 007 D10 and the previous Stride engine." },
  { keys: ["chapati"], grams: 40, note: "Same as roti." },
  { keys: ["phulka"], grams: 30, note: "Thinner, puffed roti without ghee. Household estimate, owner-editable." },
  { keys: ["paratha"], grams: 80, note: "Plain layered paratha. Previous Stride engine value." },
  { keys: ["idli"], grams: 40, note: "One medium idli. Previous Stride engine value." },
  { keys: ["egg"], grams: 50, note: "One large egg without shell, FDC 171287 portion 'large'." },
];

/** Density of a food class in g/ml, matched when every key token appears in the food name and no excluded token does. */
export interface DensityEntry {
  keys: readonly string[];
  excludes?: readonly string[];
  gPerMl: number;
  note: string;
}

/** Densities for volume-to-mass conversion. Longest key match wins, so "cooked rice" beats a plain "rice" key. */
export const DENSITIES: readonly DensityEntry[] = [
  { keys: ["water"], gPerMl: 1.0, note: "FDC 174158, 1 cup = 237 g." },
  { keys: ["milk"], excludes: ["powder", "condensed"], gPerMl: 1.031, note: "FDC 171265 whole milk, 1 cup = 244 g." },
  { keys: ["yogurt"], gPerMl: 1.036, note: "FDC 171284 plain whole-milk yogurt, 1 cup = 245 g." },
  { keys: ["curd"], gPerMl: 1.036, note: "Indian curd, same as plain yogurt (FDC 171284)." },
  { keys: ["dahi"], gPerMl: 1.036, note: "Same as curd." },
  { keys: ["cooked", "rice"], gPerMl: 0.668, note: "FDC 168878 white rice, cooked, 1 cup = 158 g." },
  { keys: ["rice", "raw"], gPerMl: 0.782, note: "FDC 169756 white rice, raw, 1 cup = 185 g." },
  { keys: ["dal"], excludes: ["raw", "dry", "flour"], gPerMl: 0.837, note: "Cooked dal, from FDC 172421 lentils boiled, 1 cup = 198 g." },
  { keys: ["lentils", "cooked"], gPerMl: 0.837, note: "FDC 172421 lentils boiled, 1 cup = 198 g." },
  { keys: ["chickpeas", "cooked"], gPerMl: 0.693, note: "FDC 173757 chickpeas boiled, 1 cup = 164 g." },
  { keys: ["oil"], gPerMl: 0.913, note: "FDC 171413 olive oil, 1 cup = 216 g. Vegetable oils are within 2%." },
  { keys: ["ghee"], gPerMl: 0.866, note: "FDC 173412 butter oil, anhydrous, 1 cup = 205 g." },
  { keys: ["sugar"], excludes: ["brown", "powdered"], gPerMl: 0.845, note: "FDC 169655 granulated sugar, 1 cup = 200 g." },
  { keys: ["atta"], gPerMl: 0.507, note: "Whole-wheat flour, FDC 168893, 1 cup = 120 g." },
  { keys: ["wheat", "flour"], gPerMl: 0.507, note: "FDC 168893 whole-grain wheat flour, 1 cup = 120 g." },
  { keys: ["oats"], excludes: ["cooked"], gPerMl: 0.342, note: "FDC 173904 dry oats, 1 cup = 81 g." },
];

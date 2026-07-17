/**
 * Unit Converter
 * Converts household/cooking units to grams deterministically.
 * Uses standard density approximations for common foods.
 */

// Volume to milliliters
const VOLUME_TO_ML: Record<string, number> = {
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  fl_oz: 29.57,
  "fl oz": 29.57,
  pint: 473,
  quart: 946,
  gallon: 3785,
  // Household/regional vessels (approximate capacities)
  katori: 150,
  katoris: 150,
  glass: 250,
  glasses: 250,
  tumbler: 200,
  tumblers: 200,
  mug: 300,
  mugs: 300,
};

// Known piece weights in grams (average/common sizes)
const PIECE_WEIGHTS: Record<string, number> = {
  egg: 50,
  eggs: 50,
  banana: 120,
  bananas: 120,
  apple: 180,
  apples: 180,
  orange: 150,
  oranges: 150,
  roti: 40,
  chapati: 40,
  rotis: 40,
  chapatis: 40,
  naan: 90,
  paratha: 80,
  slice_bread: 30,
  bread_slice: 30,
  "bread slice": 30,
  slice: 30,
  chicken_breast: 175,
  "chicken breast": 175,
  chicken_thigh: 85,
  potato: 150,
  potatoes: 150,
  sweet_potato: 130,
  tomato: 100,
  tomatoes: 100,
  onion: 100,
  onions: 100,
  cucumber: 300,
  bell_pepper: 150,
  capsicum: 150,
  carrot: 60,
  carrots: 60,
  avocado: 150,
  avocado_half: 75,
  "half avocado": 75,
  date: 8,
  dates: 8,
  almond: 1.2,
  almonds: 1.2,
  walnut: 4,
  walnuts: 4,
  cashew: 1.5,
  cashews: 1.5,
  peanut: 1,
  peanuts: 1,
  biscuit: 10,
  biscuits: 10,
  cookie: 15,
  cookies: 15,
  idli: 40,
  idlis: 40,
  dosa: 80,
  dosas: 80,
  vada: 50,
  vadas: 50,
  samosa: 70,
  samosas: 70,
  pakora: 15,
  pakoras: 15,
  puri: 25,
  puris: 25,
  paneer_cube: 20,
  "paneer cube": 20,
  tofu_block: 350,
  "block tofu": 350,
  sausage: 50,
  sausages: 50,
  fish_fillet: 150,
  "fish fillet": 150,
  shrimp: 7,
  shrimps: 7,
  prawn: 10,
  prawns: 10,
  scoop_protein: 30,
  "scoop protein": 30,
  "protein scoop": 30,
  scoop: 30,
};

// Food density (g/mL) for converting volume to weight
// These are approximate densities
const FOOD_DENSITIES: Record<string, number> = {
  water: 1.0,
  milk: 1.03,
  "almond milk": 1.0,
  "soy milk": 1.02,
  "oat milk": 1.02,
  "coconut milk": 0.99,
  oil: 0.92,
  "olive oil": 0.92,
  ghee: 0.9,
  butter: 0.91,
  honey: 1.42,
  "maple syrup": 1.37,
  yogurt: 1.05,
  curd: 1.05,
  dahi: 1.05,
  flour: 0.55,
  "all-purpose flour": 0.55,
  "wheat flour": 0.52,
  "whole wheat flour": 0.52,
  atta: 0.52,
  sugar: 0.85,
  "brown sugar": 0.85,
  rice: 0.9,
  "raw rice": 0.9,
  oats: 0.4,
  "rolled oats": 0.4,
  dal: 0.95,
  lentils: 0.95,
  "cooked rice": 1.0,
  "cooked dal": 1.05,
  "peanut butter": 1.3,
  "almond butter": 1.25,
  cream: 1.0,
  "heavy cream": 1.0,
  "sour cream": 1.0,
  "cream cheese": 1.05,
  "protein powder": 0.55,
  cheese: 0.95,
  "shredded cheese": 0.5,
  "grated cheese": 0.5,
  paneer: 1.05,
  tofu: 1.05,
  chicken: 1.0,
  "chicken breast": 1.0,
  "chicken thigh": 1.0,
  beef: 1.0,
  fish: 1.0,
  "mixed vegetables": 0.9,
  vegetables: 0.9,
  fruits: 0.9,
  nuts: 0.6,
  almonds: 0.55,
  seeds: 0.6,
  chia_seeds: 0.45,
  "chia seeds": 0.45,
};

export interface ConversionResult {
  grams: number;
  confidence: number;
  method: "exact" | "volume" | "piece" | "estimated" | "unresolved";
}

interface DensityResult {
  density: number;
  known: boolean;
}

const HOUSEHOLD_VESSELS = new Set([
  "katori", "katoris",
  "glass", "glasses",
  "tumbler", "tumblers",
  "mug", "mugs",
  "bowl", "bowls",
  "handful", "handfuls",
]);

function unresolved(): ConversionResult {
  return { grams: 0, confidence: 0, method: "unresolved" };
}

/**
 * Convert an amount + unit to grams.
 * - "g", "gram", "grams" → direct (exact)
 * - "ml", "cup", "tbsp", "katori", "glass", etc → volume × density (medium confidence)
 * - "piece", "slice", "egg", etc → known piece weights (low confidence)
 * - Unknown → unresolved so the parser can retry or confirm (no silent 100g guess)
 */
export function toGrams(
  amount: number,
  unit: string,
  foodName: string = "",
): ConversionResult {
  const unitLower = unit.toLowerCase().trim();
  const foodLower = foodName.toLowerCase().trim();

  // Direct weight units — highest confidence
  if (
    unitLower === "g" || unitLower === "gram" || unitLower === "grams" ||
    unitLower === "gm" || unitLower === "gms" || unitLower === "gm." ||
    unitLower === "gr" || unitLower === "grm"
  ) {
    return { grams: amount, confidence: 1.0, method: "exact" };
  }

  if (
    unitLower === "kg" || unitLower === "kgs" || unitLower === "kilogram" ||
    unitLower === "kilograms" || unitLower === "kilo" || unitLower === "kilos"
  ) {
    return { grams: amount * 1000, confidence: 1.0, method: "exact" };
  }

  if (unitLower === "mg" || unitLower === "milligram" || unitLower === "milligrams") {
    return { grams: amount / 1000, confidence: 1.0, method: "exact" };
  }

  if (unitLower === "oz" || unitLower === "ounce" || unitLower === "ounces") {
    return { grams: amount * 28.35, confidence: 1.0, method: "exact" };
  }

  if (unitLower === "lb" || unitLower === "lbs" || unitLower === "pound" || unitLower === "pounds") {
    return { grams: amount * 453.59, confidence: 1.0, method: "exact" };
  }

  // Volume units
  const mlPerUnit = VOLUME_TO_ML[unitLower];
  if (mlPerUnit) {
    const ml = amount * mlPerUnit;
    const { density, known } = findFoodDensity(foodLower);
    const isHousehold = HOUSEHOLD_VESSELS.has(unitLower);
    // A household vessel of an unknown-density food is too ambiguous to estimate.
    if (isHousehold && !known) {
      return unresolved();
    }
    const baseConfidence = known ? 0.85 : 0.45;
    // Household vessels have variable capacity, so cap their confidence.
    const confidence = isHousehold ? Math.min(baseConfidence, 0.6) : baseConfidence;
    return { grams: Math.round(ml * density), confidence, method: "volume" };
  }

  // Piece-based units
  if (unitLower === "piece" || unitLower === "pieces" || unitLower === "pc" || unitLower === "pcs") {
    const pieceWeight = findPieceWeight(foodLower);
    if (pieceWeight <= 0) {
      return unresolved();
    }
    return { grams: amount * pieceWeight, confidence: 0.7, method: "piece" };
  }

  // Serving-based — the only path allowed to estimate 100g per unit.
  if (unitLower === "serving" || unitLower === "servings" || unitLower === "serve") {
    return { grams: amount * 100, confidence: 0.5, method: "estimated" };
  }

  // Bowl/plate approximations
  if (unitLower === "bowl" || unitLower === "bowls") {
    // For cooked foods, a bowl is roughly 250-300g; unknown density is too risky.
    const { density, known } = findFoodDensity(foodLower);
    if (!known) return unresolved();
    return { grams: Math.round(amount * 250 * density), confidence: 0.4, method: "estimated" };
  }

  if (unitLower === "plate" || unitLower === "plates") {
    // Full plate ≈ 400g
    return { grams: amount * 400, confidence: 0.35, method: "estimated" };
  }

  // Handful
  if (unitLower === "handful" || unitLower === "handfuls") {
    const { density, known } = findFoodDensity(foodLower);
    if (!known) return unresolved();
    return { grams: Math.round(amount * 30 * density), confidence: 0.3, method: "estimated" };
  }

  // Pinch/dash
  if (unitLower === "pinch" || unitLower === "pinches" || unitLower === "dash" || unitLower === "dashes") {
    return { grams: amount * 0.5, confidence: 0.6, method: "estimated" };
  }

  // Small/medium/large — relative to a known piece weight.
  if (unitLower === "small" || unitLower === "medium" || unitLower === "large") {
    const pieceWeight = findPieceWeight(foodLower);
    if (pieceWeight <= 0) {
      return unresolved();
    }
    const multiplier = unitLower === "small" ? 0.7 : unitLower === "large" ? 1.3 : 1;
    return { grams: amount * pieceWeight * multiplier, confidence: 0.4, method: "estimated" };
  }

  // Last resort: if the unit itself looks like a food name, treat as a piece.
  const pieceWeight = findPieceWeight(unitLower);
  if (pieceWeight > 0) {
    return { grams: amount * pieceWeight, confidence: 0.5, method: "piece" };
  }

  // Unknown unit — don't guess 100g. Returning unresolved lets the parser
  // retry or ask the user to confirm.
  return unresolved();
}

/**
 * Find the density of a food for volume-to-weight conversion.
 * Returns whether the density was found in the table or defaulted to water.
 */
function findFoodDensity(foodName: string): DensityResult {
  for (const [key, density] of Object.entries(FOOD_DENSITIES)) {
    if (foodName.includes(key)) return { density, known: true };
  }
  return { density: 1.0, known: false };
}

/**
 * Find piece weight for a food name.
 */
function findPieceWeight(foodName: string): number {
  // Direct match
  if (PIECE_WEIGHTS[foodName]) return PIECE_WEIGHTS[foodName];

  // Partial match
  for (const [key, weight] of Object.entries(PIECE_WEIGHTS)) {
    if (foodName.includes(key)) return weight;
  }
  return 0;
}

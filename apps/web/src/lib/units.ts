// Weight and rate units for the Progress cards. Storage is always kg; lb is display only.
export type Units = "metric" | "imperial";

const LB_PER_KG = 2.20462;
// Regions that use pounds for body weight.
const POUND_REGIONS = new Set(["US", "LR", "MM"]);

// Saved units, or the browser locale's when none are saved.
export function savedUnits(saved: string | undefined): Units {
  if (saved === "metric" || saved === "imperial") return saved;
  const region = new Intl.Locale(navigator.language).maximize().region;
  return region !== undefined && POUND_REGIONS.has(region) ? "imperial" : "metric";
}

// Weight as a number in the user's unit, without the unit: "78.4" or "173".
export function weightNumber(kg: number, units: Units): string {
  return units === "metric" ? kg.toFixed(1) : String(Math.round(kg * LB_PER_KG));
}

// The weight unit word, "kg" or "lb".
export function weightUnit(units: Units): string {
  return units === "metric" ? "kg" : "lb";
}

// Turns a weight typed in the user's unit into kg, rounded to 0.1 for storage.
export function weightToKg(value: number, units: Units): number {
  const kg = units === "metric" ? value : value / LB_PER_KG;
  return Math.round(kg * 10) / 10;
}

// Signed weekly rate in the user's unit, e.g. "−0.3 kg/week".
export function rateText(kgPerWeek: number, units: Units): string {
  const sign = kgPerWeek < -0.005 ? "−" : kgPerWeek > 0.005 ? "+" : "";
  const size = units === "metric" ? Math.abs(kgPerWeek) : Math.abs(kgPerWeek) * LB_PER_KG;
  return `${sign}${Number(size.toFixed(2))} ${weightUnit(units)}/week`;
}

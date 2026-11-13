const NUMBER = new Intl.NumberFormat("en-IN");

// Screen-reader sentence for the day hero. Eaten kcal is rounded first so the leftover matches the number on screen.
export function kcalHeroLabel(target: number, eaten: number): string {
  const shownEaten = Math.round(eaten);
  const left = target - shownEaten;
  const amount = NUMBER.format(Math.abs(left));
  const budget = NUMBER.format(target);
  const head =
    left >= 0 ? `${amount} kcal left of ${budget}` : `${amount} kcal over your ${budget} target`;
  return `${head}. ${NUMBER.format(shownEaten)} eaten.`;
}

// Screen-reader sentence for one macro column, e.g. "Protein, 43 of 120 grams".
export function macroLabel(name: string, eaten: number, target: number): string {
  return `${name}, ${NUMBER.format(Math.round(eaten))} of ${NUMBER.format(target)} grams`;
}

// Screen-reader sentence for the meal bar. The slices themselves only carry a hover tooltip.
export function dayBarLabel(meals: readonly { name: string; kcal: number }[]): string {
  if (meals.length === 0) return "";
  return `${meals.map((meal) => `${meal.name}, ${NUMBER.format(Math.round(meal.kcal))} kcal`).join(". ")}.`;
}

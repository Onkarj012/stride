import { formatNumber } from './format'

// One sentence a screen reader says for the Today kcal hero, so "over" never reads as "left".
export function kcalHeroLabel(target: number, eaten: number): string {
  const left = Math.round(target - eaten)
  const head =
    left >= 0
      ? `${formatNumber(left)} kcal left of ${formatNumber(target)}`
      : `${formatNumber(-left)} kcal over your ${formatNumber(target)} target`
  return `${head}. ${formatNumber(eaten)} eaten.`
}

// One sentence a screen reader says for a macro column, e.g. "Protein, 42 of 120 grams".
export function macroLabel(name: string, eaten: number, target: number): string {
  return `${name}, ${formatNumber(eaten)} of ${formatNumber(target)} grams`
}

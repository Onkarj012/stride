import { formatDayTitle, formatNumber } from './format'

// What a screen reader says for one day's bar on the Progress week chart, e.g. "Mon, 3 Nov, 1,850 kcal, over target".
export function weekBarLabel(date: string, today: string, kcal: number | undefined, target: number | null): string {
  const day = date === today ? 'Today' : formatDayTitle(date)
  if (kcal === undefined) return `${day}, nothing logged`
  const over = target !== null && Math.round(kcal) > target ? ', over target' : ''
  return `${day}, ${formatNumber(kcal)} kcal${date === today ? ' so far' : ''}${over}`
}

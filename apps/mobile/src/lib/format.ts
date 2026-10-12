import { weekdayOf } from '@stride/core'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Whole number with Indian digit grouping (1,890 and 1,23,456), without relying on Intl.
export function formatNumber(n: number): string {
  const digits = String(Math.round(Math.abs(n)))
  const sign = n < 0 && digits !== '0' ? '-' : ''
  if (digits.length <= 3) return sign + digits
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${sign}${head},${digits.slice(-3)}`
}

// "Wednesday, 30 Sep" for the Today header.
export function formatDateline(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

// 24h "13:40" to the 12h "1:40" used on meal rows, or "1:40 pm" with the period.
export function formatClock(hhmm: string, withPeriod = false): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  const clock = `${hour}:${String(m).padStart(2, '0')}`
  return withPeriod ? `${clock} ${h < 12 ? 'am' : 'pm'}` : clock
}

// Header greeting for a local time of day.
export function greeting(minutes: number, name: string): string {
  const h = minutes / 60
  if (h >= 22 || h < 5) return `Late one, ${name}.`
  if (h < 12) return `Morning, ${name}.`
  if (h < 17) return `Afternoon, ${name}.`
  return `Evening, ${name}.`
}

// "Tue, 29 Sep" for a YYYY-MM-DD date.
export function formatDayTitle(localDate: string): string {
  const [, m = 1, d = 1] = localDate.split('-').map(Number)
  return `${WEEKDAYS[weekdayOf(localDate)]?.slice(0, 3)}, ${d} ${MONTHS[m - 1]}`
}

// 24h "HH:mm" of an instant in the device's clock, for formatClock.
export function clockOf(ms: number): string {
  const at = new Date(ms)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

// Grams for display: whole grams, or one decimal under 10 g.
export function formatGrams(g: number): string {
  return g < 10 ? `${Math.round(g * 10) / 10} g` : `${Math.round(g)} g`
}

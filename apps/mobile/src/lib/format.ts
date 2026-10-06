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

// Quantity suffix for an item line: "Roti ×2", "Curd ×½", nothing for one.
export function quantitySuffix(q: number): string {
  if (q === 1) return ''
  if (q === 0.5) return ' ×½'
  return ` ×${q}`
}

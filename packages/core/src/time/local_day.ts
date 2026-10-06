/** Meal slots inferred from local time (D16). */
export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";

/** Local start of each slot after breakfast, in minutes after midnight. Breakfast runs from midnight to lunch. */
export const SLOT_STARTS_MIN = { lunch: 11 * 60, snack: 16 * 60, dinner: 19 * 60 } as const;

/** Day the week starts on for weekly rollups, as a JS weekday number (1 = Monday, ISO 8601). */
export const WEEK_START_DAY = 1;

const MS_PER_DAY = 86_400_000;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached formatter per time zone. Throws RangeError for an unknown zone. */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** True when the runtime knows this IANA zone name. Check user input with this before storing it. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock date and time of an instant in a zone. The only place instants become local dates (D15). */
export function localDateTime(instantMs: number, timeZone: string): { date: string; hour: number; minute: number } {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(instantMs))) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Local calendar date (YYYY-MM-DD) of an instant in a zone. */
export function localDate(instantMs: number, timeZone: string): string {
  return localDateTime(instantMs, timeZone).date;
}

/** Slot for a local wall-clock time: before 11:00 breakfast, before 16:00 lunch, before 19:00 snack, else dinner. */
export function inferSlot(hour: number, minute = 0): MealSlot {
  const minutes = hour * 60 + minute;
  if (minutes < SLOT_STARTS_MIN.lunch) return "breakfast";
  if (minutes < SLOT_STARTS_MIN.snack) return "lunch";
  if (minutes < SLOT_STARTS_MIN.dinner) return "snack";
  return "dinner";
}

/** Slot for an instant in the user's zone. */
export function slotAt(instantMs: number, timeZone: string): MealSlot {
  const { hour, minute } = localDateTime(instantMs, timeZone);
  return inferSlot(hour, minute);
}

/** Day number (days since 1970-01-01) of a YYYY-MM-DD date, or null when the string is not a real date. */
export function dayNumber(date: string): number | null {
  const m = LOCAL_DATE_RE.exec(date);
  if (m === null) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return ms / MS_PER_DAY;
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isLocalDate(date: string): boolean {
  return dayNumber(date) !== null;
}

/** Day number of a date that must be valid; throws RangeError otherwise. */
function requireDay(date: string): number {
  const n = dayNumber(date);
  if (n === null) throw new RangeError(`not a YYYY-MM-DD date: ${date}`);
  return n;
}

/** YYYY-MM-DD for a day number. */
export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Calendar date `days` after `date` (negative goes back). Pure date math, no time zone involved. */
export function addDays(date: string, days: number): string {
  return fromDayNumber(requireDay(date) + days);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return requireDay(to) - requireDay(from);
}

/** The Monday on or before `date`. */
export function weekStart(date: string): string {
  const day = requireDay(date);
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return fromDayNumber(day - ((weekday - WEEK_START_DAY + 7) % 7));
}

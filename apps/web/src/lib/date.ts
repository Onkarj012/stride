export { addDays } from "@stride/core";

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The browser's IANA time zone name. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Label for a YYYY-MM-DD date, like "Tue, 14 Oct". */
export function formatDayLabel(date: string): string {
  const instant = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY.format(instant)}, ${DAY_MONTH.format(instant)}`;
}

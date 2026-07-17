import { localDateStr, localTimeStr } from "./utils";

export interface LocalDateTime {
  date: string;
  time: string;
}

/**
 * Return the local date (YYYY-MM-DD) and time (HH:MM) for a single instant.
 *
 * Deriving both values from the same Date prevents a midnight race where
 * separate `new Date()` calls land on different local calendar days.
 */
export function localDateTime(d: Date = new Date()): LocalDateTime {
  return {
    date: localDateStr(d),
    time: localTimeStr(d),
  };
}

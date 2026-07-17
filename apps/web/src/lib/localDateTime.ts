import { localDateStr, localTimeStr } from "./utils";

export function localDateTime(d: Date = new Date()): { date: string; time: string } {
  return { date: localDateStr(d), time: localTimeStr(d) };
}

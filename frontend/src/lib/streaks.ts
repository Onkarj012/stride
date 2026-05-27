import type { LogEntry } from "@/lib/storage";

export type StreakInfo = {
  current: number;
  best: number;
  recovery: boolean;
  lastLogDay: Date | null;
};

const DAY_MS = 86_400_000;

export function computeStreak(logs: LogEntry[]): StreakInfo {
  if (logs.length === 0) {
    return { current: 0, best: 0, recovery: false, lastLogDay: null };
  }

  const days = new Set<string>();
  for (const l of logs) days.add(new Date(l.createdAt).toDateString());

  // Walk back from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  const cursor = new Date(today);
  while (days.has(cursor.toDateString())) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Recovery mode: missed only yesterday but logged the day before
  let recovery = false;
  if (current === 0) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const dayBefore = new Date(today);
    dayBefore.setDate(today.getDate() - 2);
    if (
      !days.has(yesterday.toDateString())
      && days.has(dayBefore.toDateString())
    ) {
      recovery = true;
    }
  }

  // Best: longest consecutive run in history
  const sortedTimes = Array.from(days)
    .map((d) => new Date(d).getTime())
    .sort((a, b) => a - b);
  let best = sortedTimes.length > 0 ? 1 : 0;
  let run = 1;
  for (let i = 1; i < sortedTimes.length; i++) {
    if (sortedTimes[i] - sortedTimes[i - 1] === DAY_MS) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  const lastTs = Math.max(...logs.map((l) => l.createdAt));
  return {
    current,
    best: Math.max(best, current),
    recovery,
    lastLogDay: new Date(lastTs),
  };
}

/** Returns true for each of the past `days` if there was a log that day. */
export function getLastNDays(logs: LogEntry[], n: number): boolean[] {
  const days = new Set<string>();
  for (const l of logs) days.add(new Date(l.createdAt).toDateString());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: boolean[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(days.has(d.toDateString()));
  }
  return result;
}

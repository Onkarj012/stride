export type ActionKind = "actual" | "planned";

export type ResolveActionDateInput = {
  now: number;
  userTimeZone: string;
  explicitDate?: string;
  explicitTime?: string;
  clientLocalDate?: string;
  relativePhrase?: string;
  actionKind: ActionKind;
};

export type ActionDateResolution =
  | { status: "resolved"; date: string; time?: string }
  | { status: "needs_clarification"; reason: string }
  | { status: "rejected"; reason: string };

type LocalDateTime = { date: string; time: string };

function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= maxDay;
}

function isValidTime(time: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function dateOffset(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function localDateTime(now: number, userTimeZone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: userTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(now))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function relativeDate(phrase: string, today: string): string | "vague" | null {
  if (phrase === "yesterday" || phrase === "last night") return dateOffset(today, -1);
  if (phrase === "today" || phrase === "this morning" || phrase === "this afternoon" || phrase === "this evening" || phrase === "tonight") {
    return today;
  }

  const daysAgo = phrase.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgo) return dateOffset(today, -Number(daysAgo[1]));

  if (
    phrase === "a while ago" ||
    phrase === "last week" ||
    phrase === "last week sometime" ||
    phrase === "recently" ||
    phrase === "a few days ago" ||
    phrase === "some time ago"
  ) return "vague";

  return null;
}

function clarification(reason: string): ActionDateResolution {
  return { status: "needs_clarification", reason };
}

export function resolveActionDate(input: ResolveActionDateInput): ActionDateResolution {
  if (!Number.isFinite(input.now) || Number.isNaN(new Date(input.now).getTime())) {
    return { status: "rejected", reason: "Server time is invalid" };
  }

  let current: LocalDateTime;
  try {
    current = localDateTime(input.now, input.userTimeZone);
  } catch {
    return { status: "rejected", reason: "User timezone is invalid" };
  }

  const explicitDate = input.explicitDate?.trim();
  const explicitTime = input.explicitTime?.trim();
  const clientLocalDate = input.clientLocalDate?.trim();
  const phrase = input.relativePhrase?.trim().toLowerCase().replace(/\s+/g, " ");

  if (explicitDate && !isValidDate(explicitDate)) {
    return { status: "rejected", reason: "Explicit date must be a valid YYYY-MM-DD date" };
  }
  if (explicitTime && !isValidTime(explicitTime)) {
    return { status: "rejected", reason: "Explicit time must be a valid HH:MM time" };
  }
  if (clientLocalDate && !isValidDate(clientLocalDate)) {
    return { status: "rejected", reason: "Client local date must be a valid YYYY-MM-DD date" };
  }

  let date = explicitDate;
  if (!date && phrase) {
    const relative = relativeDate(phrase, current.date);
    if (relative === "vague") return clarification("The relative date is too vague; provide an exact date");
    if (!relative) return clarification("The relative date is not precise enough; provide an exact date");
    date = relative;
  }
  if (!date) date = clientLocalDate;
  if (!date) return clarification("An exact action date is required");

  if (
    input.actionKind === "actual" &&
    (date > current.date || (date === current.date && explicitTime !== undefined && explicitTime > current.time))
  ) {
    return { status: "rejected", reason: "Actual actions cannot be dated in the future" };
  }

  return explicitTime === undefined
    ? { status: "resolved", date }
    : { status: "resolved", date, time: explicitTime };
}

export function resolveIntervalDay(input: { startMs: number; endMs: number; userTimeZone: string }): string {
  if (
    !Number.isFinite(input.startMs) ||
    !Number.isFinite(input.endMs) ||
    Number.isNaN(new Date(input.startMs).getTime()) ||
    Number.isNaN(new Date(input.endMs).getTime())
  ) {
    throw new Error("Interval timestamps must be valid epoch milliseconds");
  }
  if (input.endMs < input.startMs) throw new Error("Interval end must not precede interval start");
  return localDateTime(input.endMs, input.userTimeZone).date;
}

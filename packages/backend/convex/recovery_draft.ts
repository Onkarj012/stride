import { resolveIntervalDay } from "./time_resolve";
import {
  assertValidDate,
  assertValidTime,
  assertInRange,
  assertEnum,
} from "./validation";

export type SleepBand = "under_6" | "six_to_eight" | "eight_plus";
export type SleepQuality = "poor" | "ok" | "good" | "great";
export type RecoveryState =
  | "actual"
  | "planned_rest"
  | "missed_logging"
  | "illness"
  | "injury_recovery"
  | "travel"
  | "unknown";
export type RecoveryEntryKind = "sleep" | "water" | "mood" | "steps" | "state" | "wellness";
export type RecoverySource =
  | "user_reported"
  | "ai_extracted"
  | "ai_estimated"
  | "database_match"
  | "checkin"
  | "direct_ui"
  | "mobile";

export type RecoverySleep = {
  hours?: number;
  band?: SleepBand;
  quality?: SleepQuality;
  intervalStart?: string;
  intervalEnd?: string;
  intervalDay?: string;
};

export type RecoveryDraft = {
  kind: "recovery";
  entryKind: RecoveryEntryKind;
  date: string;
  time?: string;
  timezone?: string;
  sleep?: RecoverySleep;
  waterMl?: number;
  mood?: number;
  stress?: number;
  energy?: number;
  soreness?: number;
  injury?: string;
  steps?: number;
  illness?: string;
  plannedRest?: boolean;
  travel?: string;
  state: RecoveryState;
  source: RecoverySource;
  confidence: number;
  unresolved: string[];
  correctionState: "original" | "corrected";
  note?: string;
};

export type RecoveryDraftInput = {
  kind?: string;
  entryKind?: RecoveryEntryKind;
  date: string;
  time?: string;
  timezone?: string;
  source?: RecoverySource | string;
  confidence?: number;
  correctionState?: "original" | "corrected";
  sleep?: RecoverySleep;
  hours?: number;
  band?: SleepBand | string;
  quality?: SleepQuality | string;
  intervalStart?: string | number;
  intervalEnd?: string | number;
  waterMl?: number;
  ml?: number;
  mood?: number;
  rating?: number;
  stress?: number;
  energy?: number;
  soreness?: number;
  injury?: string;
  steps?: number;
  count?: number;
  illness?: string;
  plannedRest?: boolean;
  travel?: string;
  state?: RecoveryState | string;
  note?: string;
};

const SLEEP_BANDS: SleepBand[] = ["under_6", "six_to_eight", "eight_plus"];
const SLEEP_QUALITY: SleepQuality[] = ["poor", "ok", "good", "great"];
const RECOVERY_STATES: RecoveryState[] = [
  "actual",
  "planned_rest",
  "missed_logging",
  "illness",
  "injury_recovery",
  "travel",
  "unknown",
];
const SOURCES: RecoverySource[] = ["user_reported", "ai_extracted", "ai_estimated", "database_match", "checkin", "direct_ui", "mobile"];

function finite(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function sourceOf(value: string | undefined): RecoverySource {
  return assertEnum("source", value ?? "user_reported", SOURCES);
}

function intervalValue(value: string | number | undefined): { iso?: string; ms?: number } {
  if (value == null) return {};
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("Sleep interval timestamps must be valid dates");
  return { iso: new Date(ms).toISOString(), ms };
}

function inferredEntryKind(input: RecoveryDraftInput): RecoveryEntryKind {
  if (input.entryKind) return input.entryKind;
  if (input.kind === "sleep" || input.kind === "water" || input.kind === "mood" || input.kind === "steps") return input.kind;
  if (input.kind === "rest" || input.plannedRest || input.state || RECOVERY_STATES.includes(input.kind as RecoveryState)) return "state";
  if (input.sleep || input.hours != null || input.band != null || input.quality != null) return "sleep";
  if (input.waterMl != null || input.ml != null) return "water";
  if (input.mood != null || input.rating != null) return "mood";
  if (input.steps != null || input.count != null) return "steps";
  return "wellness";
}

/** Build the one canonical recovery draft used by AI, direct UI, and check-ins. */
export function buildRecoveryDraft(input: RecoveryDraftInput): RecoveryDraft {
  const date = assertValidDate(input.date);
  const time = input.time == null ? undefined : assertValidTime(input.time);
  const entryKind = inferredEntryKind(input);
  const source = sourceOf(input.source);
  const confidence = input.confidence == null ? 1 : assertInRange("confidence", finite(input.confidence) ?? NaN, 0, 1);
  const unresolved: string[] = [];
  const start = intervalValue(input.intervalStart ?? input.sleep?.intervalStart);
  const end = intervalValue(input.intervalEnd ?? input.sleep?.intervalEnd);
  let resolvedDate = date;
  let intervalDay: string | undefined;
  if (start.ms != null || end.ms != null) {
    if (start.ms == null || end.ms == null) throw new Error("Sleep intervals require both start and end");
    intervalDay = resolveIntervalDay({ startMs: start.ms, endMs: end.ms, userTimeZone: input.timezone ?? "UTC" });
    resolvedDate = intervalDay;
  }

  const rawBand = input.band ?? input.sleep?.band;
  const band = rawBand == null ? undefined : assertEnum("sleep band", rawBand, SLEEP_BANDS);
  const rawQuality = input.quality ?? input.sleep?.quality;
  const quality = rawQuality == null ? undefined : assertEnum("sleep quality", rawQuality, SLEEP_QUALITY);
  const rawHours = finite(input.hours ?? input.sleep?.hours);
  const hours = rawHours == null ? undefined : assertInRange("sleep hours", rawHours, 0, 24);
  if (entryKind === "sleep" && hours == null && band == null && quality == null && start.ms == null) unresolved.push("sleep");
  if (hours != null && band != null) unresolved.push("sleep_hours_and_band_conflict");

  const waterMl = finite(input.waterMl ?? input.ml);
  if (waterMl != null) assertInRange("water ml", waterMl, 0, 20_000);
  if (entryKind === "water" && waterMl == null) unresolved.push("water");
  const mood = finite(input.mood ?? input.rating);
  if (mood != null) assertInRange("mood", mood, 1, 5);
  if (entryKind === "mood" && mood == null) unresolved.push("mood");
  const stress = finite(input.stress);
  if (stress != null) assertInRange("stress", stress, 1, 5);
  const energy = finite(input.energy);
  if (energy != null) assertInRange("energy", energy, 1, 5);
  const soreness = finite(input.soreness);
  if (soreness != null) assertInRange("soreness", soreness, 1, 5);
  const steps = finite(input.steps ?? input.count);
  if (steps != null) assertInRange("steps", steps, 0, 100_000);
  if (entryKind === "steps" && steps == null) unresolved.push("steps");

  const stateFromKind = typeof input.kind === "string" && RECOVERY_STATES.includes(input.kind as RecoveryState)
    ? input.kind
    : "actual";
  const state = assertEnum(
    "recovery state",
    input.state ?? (input.kind === "rest" || input.plannedRest ? "planned_rest" : stateFromKind),
    RECOVERY_STATES,
  );
  if (state === "planned_rest" && input.plannedRest !== false) input.plannedRest = true;
  if (state === "planned_rest" && input.plannedRest === false) unresolved.push("planned_rest");
  if (state !== "actual" && entryKind === "wellness") {
    // State-only entries are intentionally allowed to have no measured values.
  }

  return {
    kind: "recovery",
    entryKind,
    date: resolvedDate,
    time,
    timezone: input.timezone,
    sleep: hours != null || band != null || quality != null || start.iso != null || end.iso != null
      ? { hours, band, quality, intervalStart: start.iso, intervalEnd: end.iso, intervalDay }
      : undefined,
    waterMl,
    mood,
    stress,
    energy,
    soreness,
    injury: input.injury?.trim() || undefined,
    steps,
    illness: input.illness?.trim() || undefined,
    plannedRest: input.plannedRest === true || state === "planned_rest" ? true : undefined,
    travel: input.travel?.trim() || undefined,
    state,
    source,
    confidence,
    unresolved,
    correctionState: input.correctionState ?? "original",
    note: input.note?.trim() || undefined,
  };
}

/** Flatten a draft for the existing recovery action/UI transport. */
export function recoveryPayloadFromDraft(draft: RecoveryDraft): Record<string, unknown> {
  return {
    ...draft,
    kind: draft.entryKind,
    recoveryKind: "recovery",
    hours: draft.sleep?.hours,
    band: draft.sleep?.band,
    quality: draft.sleep?.quality,
    intervalStart: draft.sleep?.intervalStart,
    intervalEnd: draft.sleep?.intervalEnd,
    intervalDay: draft.sleep?.intervalDay,
    ml: draft.waterMl,
    rating: draft.mood,
    count: draft.steps,
  };
}

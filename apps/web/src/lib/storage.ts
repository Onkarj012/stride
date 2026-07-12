/**
 * Stride — types and local preferences storage.
 *
 * Log storage (meals, workouts) has moved to Convex.
 * This file retains:
 *   - LogEntry / LogCategory / Agent types (used by UI components)
 *   - Preferences read/write (UI-only prefs not in Convex schema)
 */

export type LogCategory =
  | "meal"
  | "workout"
  | "water"
  | "sleep"
  | "mood"
  | "steps"
  | "note";

export type Agent =
  | "main"
  | "diet"
  | "workout"
  | "sleep"
  | "water"
  | "habit"
  | "wellness";

export type MacroData = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type LogEntry = {
  id: string;
  category: LogCategory;
  text: string;
  createdAt: number;
  meal?: MacroData & {
    items?: string[];
    confidence?: number;
    nutritionSource?: string;
    nutritionVerified?: boolean;
    structuredItems?: string;
    ingredientBreakdown?: string;
    logSource?: string;
  };
  workout?: {
    type: string;
    duration: number;
    distance?: number;
    kcal: number;
    intensity: "light" | "medium" | "high";
    calorieConfidence?: number;
    calorieRangeLow?: number;
    calorieRangeHigh?: number;
    calorieEstimateRough?: boolean;
    calorieBreakdown?: string;
    calculationVersion?: number;
    structuredSets?: string;
    logSource?: string;
  };
  sleep?: { hours: number; quality: "poor" | "ok" | "good" | "great" };
  water?: { ml: number };
  mood?: { rating: 1 | 2 | 3 | 4 | 5; note?: string };
  steps?: { count: number };
  agent?: Agent;
  aiInsight?: string;
};

/* ── User preferences (localStorage) ── */

export type CoachingStyle = "gentle" | "motivating" | "analytical";

export type Preferences = {
  units: "metric" | "imperial";
  notifications: boolean;
  reduceMotion: boolean;
  coachingStyle: CoachingStyle;
};

const PREF_KEY = "stride.prefs.v1";
const DEFAULT_PREFS: Preferences = {
  units: "metric",
  notifications: true,
  reduceMotion: false,
  coachingStyle: "gentle",
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function readPrefs(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  return { ...DEFAULT_PREFS, ...safeParse<Partial<Preferences>>(localStorage.getItem(PREF_KEY), {}) };
}

export function writePrefs(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("stride:prefs"));
}

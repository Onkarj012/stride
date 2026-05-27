import { useCallback, useEffect, useState } from "react";

type BehaviorState = {
  /** ISO date strings of dismissed window prompts, by window */
  dismissals: { morning: string[]; day: string[]; evening: string[]; night: string[] };
  /** Suggestion click counts */
  suggestionClicks: Record<string, number>;
  /** Last engaged timestamp per window */
  lastEngaged: { morning?: number; day?: number; evening?: number; night?: number };
};

const KEY = "stride.behavior.v1";
const DEFAULT: BehaviorState = {
  dismissals: { morning: [], day: [], evening: [], night: [] },
  suggestionClicks: {},
  lastEngaged: {},
};

function read(): BehaviorState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch { return DEFAULT; }
}

function write(s: BehaviorState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function useBehavior() {
  const [state, setState] = useState<BehaviorState>(() => read());

  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const dismiss = useCallback((window: keyof BehaviorState["dismissals"]) => {
    const next = read();
    const date = new Date().toISOString().split("T")[0];
    const arr = next.dismissals[window] ?? [];
    if (!arr.includes(date)) arr.push(date);
    next.dismissals[window] = arr.slice(-30);
    write(next); setState(next);
  }, []);

  const recordEngagement = useCallback((window: keyof BehaviorState["lastEngaged"]) => {
    const next = read();
    next.lastEngaged[window] = Date.now();
    write(next); setState(next);
  }, []);

  const recordSuggestion = useCallback((label: string) => {
    const next = read();
    next.suggestionClicks[label] = (next.suggestionClicks[label] ?? 0) + 1;
    write(next); setState(next);
  }, []);

  /** Has the user dismissed this window's prompt 3+ days running? */
  const isWindowFatigued = useCallback((window: keyof BehaviorState["dismissals"]): boolean => {
    const arr = state.dismissals[window] ?? [];
    if (arr.length < 3) return false;
    const last3 = arr.slice(-3);
    const today = new Date();
    return last3.every((iso, i) => {
      const d = new Date(iso);
      const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
      return diff <= 3 - i;
    });
  }, [state.dismissals]);

  return { state, dismiss, recordEngagement, recordSuggestion, isWindowFatigued };
}

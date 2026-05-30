import { localDateStr } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

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
  const record = useMutation(api.behavior.recordBehavior);
  const writeThrough = useCallback(
    (kind: string, key: string) => {
      void record({ kind, key, date: localDateStr() }).catch(() => {
        /* offline: localStorage already holds the value */
      });
    },
    [record],
  );

  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const dismiss = useCallback((window: keyof BehaviorState["dismissals"]) => {
    const next = read();
    const date = localDateStr();
    const arr = next.dismissals[window] ?? [];
    if (!arr.includes(date)) arr.push(date);
    next.dismissals[window] = arr.slice(-30);
    write(next); setState(next);
    writeThrough("nudge_dismiss", window);
  }, [writeThrough]);

  const recordEngagement = useCallback((window: keyof BehaviorState["lastEngaged"]) => {
    const next = read();
    next.lastEngaged[window] = Date.now();
    write(next); setState(next);
    writeThrough("engagement", window);
  }, [writeThrough]);

  const recordSuggestion = useCallback((label: string) => {
    const next = read();
    next.suggestionClicks[label] = (next.suggestionClicks[label] ?? 0) + 1;
    write(next); setState(next);
    writeThrough("suggestion", label);
  }, [writeThrough]);

  /** Has the user dismissed this window's prompt on 3 consecutive calendar days? */
  const isWindowFatigued = useCallback((window: keyof BehaviorState["dismissals"]): boolean => {
    const arr = state.dismissals[window] ?? [];
    if (arr.length < 3) return false;
    const last3 = arr.slice(-3);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // last3[0] must be exactly 2 days ago, last3[1] exactly 1 day ago, last3[2] today
    return last3.every((iso, i) => {
      const d = new Date(iso);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
      return diff === 2 - i;
    });
  }, [state.dismissals]);

  return { state, dismiss, recordEngagement, recordSuggestion, isWindowFatigued };
}

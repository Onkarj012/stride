/**
 * usePrefs — UI preferences hook.
 *
 * The Convex backend stores user_profiles (fitness data) and user_settings
 * (API keys). UI-only prefs (units, notifications, coachingStyle, reduceMotion)
 * are not in the Convex schema, so they remain in localStorage.
 *
 * If the backend schema is extended to include these fields, this hook can be
 * updated to call api.profile.upsertSettings without changing any call sites.
 */
import { useCallback, useEffect, useState } from "react";
import { type Preferences, readPrefs, writePrefs } from "@/lib/storage";

export function usePrefs() {
  const [prefs, setPrefs] = useState<Preferences>(() => readPrefs());

  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    window.addEventListener("stride:prefs", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("stride:prefs", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    const next = { ...readPrefs(), ...patch };
    writePrefs(next);
    setPrefs(next);
  }, []);

  return { prefs, update };
}

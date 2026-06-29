/**
 * usePrefs — UI preferences hook.
 *
 * Source of truth is Convex `user_settings` (units, notifications,
 * coachingStyle, reduceMotion). localStorage is kept as an instant/offline
 * cache with write-through. The public API ({ prefs, update }) is unchanged,
 * so call sites need no changes.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { type Preferences, readPrefs, writePrefs } from "@/lib/storage";

export function usePrefs() {
  const [prefs, setPrefs] = useState<Preferences>(() => readPrefs());
  const server = useQuery(api.profile.getSettings, {});
  const upsert = useMutation(api.profile.upsertSettings);

  // Hydrate from server once it loads; write-through to localStorage cache.
  useEffect(() => {
    if (!server) return;
    const next: Preferences = {
      units: (server.units as Preferences["units"]) ?? "metric",
      notifications: server.notifications ?? true,
      coachingStyle: (server.coachingStyle as Preferences["coachingStyle"]) ?? "gentle",
      reduceMotion: server.reduceMotion ?? false,
    };
    writePrefs(next);
    setPrefs(next);
    // Sync browser timezone offset so nudge dispatch uses local time.
    const offset = new Date().getTimezoneOffset();
    if (server.timezoneOffsetMinutes !== offset) {
      void upsert({ timezoneOffsetMinutes: offset }).catch(() => {});
    }
  }, [server]);

  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    window.addEventListener("stride:prefs", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("stride:prefs", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      const next = { ...readPrefs(), ...patch };
      writePrefs(next); // instant local + cross-tab
      setPrefs(next);
      void upsert(patch).catch(() => {
        /* offline: localStorage already holds the value */
      });
    },
    [upsert],
  );

  return { prefs, update };
}

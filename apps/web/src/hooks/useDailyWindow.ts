import { useEffect, useState } from "react";

export type DailyWindow = "morning" | "day" | "evening" | "night";

/**
 * Returns the current "daily window" based on local time.
 * Updates automatically when the window changes (checks every minute).
 *
 * - morning: 5am – 11am
 * - day:     11am – 6pm
 * - evening: 6pm – 10pm
 * - night:   10pm – 5am
 */
export function getDailyWindow(d: Date = new Date()): DailyWindow {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 18) return "day";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

export function useDailyWindow(): DailyWindow {
  const [window, setWindow] = useState<DailyWindow>(() => getDailyWindow());

  useEffect(() => {
    const id = setInterval(() => {
      const next = getDailyWindow();
      setWindow((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return window;
}

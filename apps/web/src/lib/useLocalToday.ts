import { useEffect, useState } from "react";
import { localDate, nextLocalMidnight } from "@stride/core";
import { browserTimeZone } from "./date";

// Keeps today's date in the browser zone current at midnight and when the page is shown again.
export function useLocalToday(): string {
  const [today, setToday] = useState(() => localDate(Date.now(), browserTimeZone()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Refreshes today's date and schedules the next boundary from core.
    function refresh() {
      clearTimeout(timer);
      const now = Date.now();
      const zone = browserTimeZone();
      setToday(localDate(now, zone));
      timer = setTimeout(refresh, Math.max(1, nextLocalMidnight(now, zone) - Date.now()));
    }
    // Background tabs can delay the timer, so a visible page checks again.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return today;
}

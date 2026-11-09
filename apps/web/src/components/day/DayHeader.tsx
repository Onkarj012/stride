import { useEffect, useEffectEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { daysBetween } from "@stride/core";
import { Button, Eyebrow } from "@/components/ui";
import { addDays, formatDayLabel } from "@/lib/date";

const ARROW =
  "grid size-9 place-items-center rounded-pill text-ink2 transition-colors hover:bg-card hover:text-ink disabled:pointer-events-none disabled:opacity-30";

// Places where a key press belongs to what has focus: typing, menus, and widgets that read arrow keys themselves.
const OWNS_KEYS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="application"], [role="slider"], [role="listbox"], [role="menu"], [role="dialog"]';

// "Today", "Yesterday" or "5 days ago" above the date.
function relativeLabel(localDate: string, today: string): string {
  const ago = daysBetween(localDate, today);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  return `${ago} days ago`;
}

// The day a plain key press moves to: ← the day before, → the day after, T today. Null when the key does nothing here.
export function dayForKey(key: string, localDate: string, today: string): string | null {
  if (key === "ArrowLeft") return addDays(localDate, -1);
  if (key === "ArrowRight") return localDate === today ? null : addDays(localDate, 1);
  if (key === "t" || key === "T") return localDate === today ? null : today;
  return null;
}

// Day title with how long ago it was, and controls to move between days. ← → and T work anywhere on the page outside a field.
export function DayHeader({ localDate, today }: { localDate: string; today: string }) {
  const navigate = useNavigate();
  const isToday = localDate === today;

  // Today has no date in its URL, so it maps to /day.
  function go(date: string) {
    void navigate(date === today ? "/day" : `/day/${date}`);
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    if (event.target instanceof Element && event.target.closest(OWNS_KEYS)) return;
    const next = dayForKey(event.key, localDate, today);
    if (next === null) return;
    event.preventDefault();
    go(next);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Eyebrow className={isToday ? "text-polo-ink" : undefined}>{relativeLabel(localDate, today)}</Eyebrow>
        <h1 className="mt-2 type-screen-title">{formatDayLabel(localDate)}</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-pill bg-card2 p-[3px]">
          <button
            type="button"
            aria-label="Previous day"
            aria-keyshortcuts="ArrowLeft"
            title="Previous day (←)"
            onClick={() => go(addDays(localDate, -1))}
            className={ARROW}
          >
            <ChevronLeft className="size-[18px]" strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label="Next day"
            aria-keyshortcuts="ArrowRight"
            title="Next day (→)"
            disabled={isToday}
            onClick={() => go(addDays(localDate, 1))}
            className={ARROW}
          >
            <ChevronRight className="size-[18px]" strokeWidth={1.9} />
          </button>
        </div>
        {isToday ? null : (
          <Button variant="ink" size="sm" aria-keyshortcuts="T" title="Back to today (T)" onClick={() => go(today)}>
            Back to today
          </Button>
        )}
      </div>
    </header>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { addDays, formatDayLabel } from "@/lib/date";

const CONTROL = "rounded-pill border border-line2 px-3 py-2 text-sm font-semibold text-ink hover:bg-card2 disabled:opacity-40";

// Day title with a Today tag, and controls to move between days.
export function DayHeader({ localDate, today }: { localDate: string; today: string }) {
  const navigate = useNavigate();
  const isToday = localDate === today;

  // Today has no date in its URL, so it maps to /day.
  function go(date: string) {
    void navigate(date === today ? "/day" : `/day/${date}`);
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">{formatDayLabel(localDate)}</h1>
        {isToday ? <span className="rounded-tag bg-polo-soft px-2 py-0.5 text-xs font-semibold text-polo-ink">Today</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous day" onClick={() => go(addDays(localDate, -1))} className={CONTROL}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" aria-label="Next day" disabled={isToday} onClick={() => go(addDays(localDate, 1))} className={CONTROL}>
          <ChevronRight className="size-4" />
        </button>
        <button type="button" disabled={isToday} onClick={() => go(today)} className={CONTROL}>
          Today
        </button>
      </div>
    </header>
  );
}

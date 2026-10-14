import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { isLocalDate } from "@stride/core";
import { api } from "@convex/_generated/api";
import { LogPanel } from "@/components/log/LogPanel";
import { DayHeader } from "@/components/day/DayHeader";
import { MealsList, groupBySlot } from "@/components/day/MealsList";
import { TotalsCard } from "@/components/day/TotalsCard";
import { browserTimeZone, todayIn } from "@/lib/date";
import { SUMMARY_DAYS, targetsFor } from "@/lib/log";

// The Day screen. /day shows today; /day/:date shows a past day. Future or malformed dates go to today.
export function DayPage() {
  const { date } = useParams();
  const today = todayIn(browserTimeZone());
  if (date !== undefined && (!isLocalDate(date) || date > today)) return <Navigate to="/day" replace />;

  return <DayView localDate={date ?? today} today={today} />;
}

// Totals, meals and editing for one already-validated day. Wide screens keep the totals in a sticky right column.
function DayView({ localDate, today }: { localDate: string; today: string }) {
  const totals = useQuery(api.day_totals.dayTotals, { localDate });
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS });
  const entries = useQuery(api.entries.entriesForDay, { localDate });
  const targets = targetsFor(summary?.target?.kcal ?? null);
  const meals = entries === undefined ? undefined : groupBySlot(entries);

  return (
    <div className="flex flex-col gap-8">
      <DayHeader localDate={localDate} today={today} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8">
        <aside className="xl:sticky xl:top-10 xl:col-start-2 xl:row-start-1">
          <TotalsCard nutrients={totals?.nutrients} targets={targets} meals={meals} isToday={localDate === today} />
        </aside>
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
          <LogPanel localDate={localDate} today={today} />
          <MealsList meals={meals} isToday={localDate === today} />
        </div>
      </div>
    </div>
  );
}

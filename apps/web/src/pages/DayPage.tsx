import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { isLocalDate } from "@stride/core";
import { api } from "@convex/_generated/api";
import { LogPanel } from "@/components/log/LogPanel";
import { DayHeader } from "@/components/day/DayHeader";
import { MealsList } from "@/components/day/MealsList";
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

// Totals, meals and editing for one already-validated day.
function DayView({ localDate, today }: { localDate: string; today: string }) {
  const totals = useQuery(api.day_totals.dayTotals, { localDate });
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS });
  const entries = useQuery(api.entries.entriesForDay, { localDate });
  const targets = targetsFor(summary?.target?.kcal ?? null);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <DayHeader localDate={localDate} today={today} />
      <TotalsCard nutrients={totals?.nutrients} targets={targets} />
      <LogPanel localDate={localDate} today={today} />
      <MealsList entries={entries} />
    </div>
  );
}

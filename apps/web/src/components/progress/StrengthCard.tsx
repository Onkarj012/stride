import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Card, Skeleton } from "./Card";

const W = 640;
const H = 180;
const BASE = 150;
const MAX_BAR = 120;
const WEEK_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// "7 Sep" for a YYYY-MM-DD week start.
function weekLabel(date: string): string {
  return WEEK_LABEL.format(new Date(`${date}T00:00:00Z`));
}

// One decimal at most, with no trailing ".0": 12, 3.5.
function oneDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

// Strength card: hard sets per week as bars, then each lift's best estimated 1RM and its change.
export function StrengthCard() {
  const stats = useQuery(api.strength.stats, { weeks: 8 });
  if (stats === undefined) return <Skeleton className="h-96" />;

  if (stats.exercises.length === 0)
    return (
      <Card title="Strength">
        <p className="text-sm text-ink2">No strength sessions yet.</p>
      </Card>
    );

  const weeks = stats.weeklyVolume.map((week) => ({ start: week.weekStart, sets: week.muscles.reduce((sum, m) => sum + m.sets, 0) }));
  const lifts = stats.exercises.filter((lift) => lift.trend.length > 0);

  return (
    <Card title="Strength">
      {stats.historyLimited ? (
        <p className="text-sm text-ink3">
          Showing the most recent {stats.historySetLimit} saved sets. Trends and weekly counts may omit older sets.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink2">Hard sets per week</p>
        <WeeklySets weeks={weeks} />
        <p className="text-xs text-ink3">Counts each muscle a set works, so one set can count for more than one muscle.</p>
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-ink2">Lifts</p>
        <ul className="divide-y divide-line">
          {lifts.map((lift) => {
            const first = lift.trend[0];
            const latest = lift.trend.at(-1);
            const change = first && latest && lift.trend.length > 1 ? latest.e1rmKg - first.e1rmKg : null;
            return (
              <li key={lift.exerciseId} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{lift.name}</p>
                  {lift.bestE1rmKg === null ? null : <p className="text-xs text-ink3">best {oneDecimal(lift.bestE1rmKg)} kg</p>}
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-bold tabular-nums">{latest ? `${oneDecimal(latest.e1rmKg)} kg` : "—"}</p>
                  <p className="text-xs text-ink3">{formatChange(change)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

// Change in estimated 1RM as text: "+2.5 kg", "−1 kg", "holding", or "first" with no earlier point.
function formatChange(change: number | null): string {
  if (change === null) return "first";
  if (change > 0.05) return `+${oneDecimal(change)} kg`;
  if (change < -0.05) return `−${oneDecimal(-change)} kg`;
  return "holding";
}

// Bar chart of total hard sets for each week, with the count above each bar.
function WeeklySets({ weeks }: { weeks: { start: string; sets: number }[] }) {
  const top = Math.max(1, ...weeks.map((week) => week.sets));
  const slot = W / Math.max(1, weeks.length);
  const barW = slot * 0.6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hard sets per week" className="h-auto w-full">
      {weeks.map((week, i) => {
        const height = (week.sets / top) * MAX_BAR;
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={week.start}>
            <rect x={x} y={BASE - height} width={barW} height={height} rx={4} className="fill-polo" />
            <text x={x + barW / 2} y={BASE - height - 6} textAnchor="middle" className="fill-ink2 text-[11px]">
              {oneDecimal(week.sets)}
            </text>
            <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-ink3 text-[11px]">
              {weekLabel(week.start)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

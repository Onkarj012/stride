import { motion } from "motion/react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Card, CardSkeleton, Empty, Eyebrow, pressSpring } from "@/components/ui";
import { cn } from "@/lib/utils";

const CHART_H = 150;
const SPARK_W = 84;
const SPARK_H = 30;
const SPARK_POINTS = 8;
const WEEK_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

type Trend = { e1rmKg: number }[];

// "7 Sep" for a YYYY-MM-DD week start.
function weekLabel(date: string): string {
  return WEEK_LABEL.format(new Date(`${date}T00:00:00Z`));
}

// One decimal at most, with no trailing ".0": 12, 3.5.
function oneDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

// Strength card: hard sets per week as bars, then each lift's best estimated 1RM, a sparkline and its change.
export function StrengthCard({ localDate }: { localDate: string }) {
  const stats = useQuery(api.strength.stats, { weeks: 8, localDate });
  if (stats === undefined) return <CardSkeleton className="h-[420px]" lines={5} />;

  if (stats.exercises.length === 0)
    return (
      <Card title="Strength">
        <Empty title="No lifts yet." body="Log a workout in the mobile app and your weekly sets and estimated 1-rep max show up here." />
      </Card>
    );

  const weeks = stats.weeklyVolume.map((week) => ({ start: week.weekStart, sets: week.muscles.reduce((sum, m) => sum + m.sets, 0) }));
  const lifts = stats.exercises.filter((lift) => lift.trend.length > 0);

  return (
    <Card title="Strength">
      {stats.historyLimited ? (
        <p className="-mt-2 type-caption text-ink3">
          Showing the most recent {stats.historySetLimit} saved sets. Trends and weekly counts may omit older sets.
        </p>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className="type-value">Hard sets per week</p>
          <WeeklySets weeks={weeks} />
          <p className="type-caption text-ink3">Counts each muscle a set works, so one set can count for more than one muscle.</p>
        </div>
        <div className="flex flex-col">
          <div className="flex items-baseline justify-between">
            <p className="type-value">Lifts</p>
            <Eyebrow>Est. 1-rep max</Eyebrow>
          </div>
          {lifts.length === 0 ? (
            <p className="mt-3 type-secondary text-ink2">No lifts with a 1-rep max estimate yet.</p>
          ) : (
            <ul className="mt-1">
              {lifts.map((lift) => {
                const first = lift.trend[0];
                const latest = lift.trend.at(-1);
                const change = first && latest && lift.trend.length > 1 ? latest.e1rmKg - first.e1rmKg : null;
                return (
                  <li key={lift.exerciseId} className="grid grid-cols-[minmax(0,1fr)_84px_auto] items-center gap-4 border-b border-line py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate type-body-strong">{lift.name}</p>
                      {lift.bestE1rmKg === null ? null : <p className="type-caption text-ink3">best {oneDecimal(lift.bestE1rmKg)} kg</p>}
                    </div>
                    <Sparkline trend={lift.trend} />
                    <div className="text-right">
                      <p className="font-display text-[19px] leading-tight font-[680] tracking-[-0.02em] tabular-nums">
                        {latest ? `${oneDecimal(latest.e1rmKg)} kg` : "—"}
                      </p>
                      <p className={cn("type-label", change !== null && change > 0.05 ? "font-semibold text-fat" : "text-ink3")}>
                        {formatChange(change)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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

// A small line of a lift's recent estimated 1RMs, ending on a dot.
function Sparkline({ trend }: { trend: Trend }) {
  const values = trend.slice(-SPARK_POINTS).map((point) => point.e1rmKg);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (values.length === 1 ? SPARK_W - 4 : 4 + (i * (SPARK_W - 8)) / (values.length - 1));
  const y = (v: number) => SPARK_H - 4 - ((v - lo) / (hi - lo || 1)) * (SPARK_H - 8);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.at(-1);

  return (
    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden className="h-[30px] w-[84px]">
      {values.length > 1 ? (
        <path d={path} fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="stroke-ink opacity-70" />
      ) : null}
      {last === undefined ? null : <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} className="fill-polo" />}
    </svg>
  );
}

// Bars of total hard sets for each week, the latest in polo, with the count above each bar.
function WeeklySets({ weeks }: { weeks: { start: string; sets: number }[] }) {
  const top = Math.max(1, ...weeks.map((week) => week.sets));

  return (
    <div role="img" aria-label="Hard sets per week" className="flex items-end justify-between gap-2" style={{ height: CHART_H + 44 }}>
      {weeks.map((week, i) => {
        const latest = i === weeks.length - 1;
        const height = week.sets === 0 ? 0 : Math.max(6, (week.sets / top) * CHART_H);
        return (
          <div key={week.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cn("type-label tabular-nums", latest ? "font-semibold text-polo-ink" : "text-ink3")}>{oneDecimal(week.sets)}</span>
            {week.sets === 0 ? (
              <div className="h-6 w-full max-w-7 rounded-[7px] border-[1.5px] border-dashed border-line2" />
            ) : (
              <motion.div
                className={cn("w-full max-w-7 origin-bottom rounded-[7px]", latest ? "bg-polo" : "bg-ink opacity-85")}
                style={{ height }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...pressSpring, delay: i * 0.04 }}
              />
            )}
            <span className="type-label whitespace-nowrap text-ink3">{weekLabel(week.start)}</span>
          </div>
        );
      })}
    </div>
  );
}

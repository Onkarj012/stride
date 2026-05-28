import { Flame, Heart } from "lucide-react";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { computeStreak, getLastNDays } from "@/lib/streaks";
import type { LogEntry } from "@/lib/storage";
import { cn } from "@/lib/utils";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat

function lastNDayLabels(n: number): string[] {
  const today = new Date();
  const labels: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(DAY_INITIALS[d.getDay()]);
  }
  return labels;
}

export function StreakCard({ logs }: { logs: LogEntry[] }) {
  const streak = computeStreak(logs);
  const last7 = getLastNDays(logs, 7);
  const labels = lastNDayLabels(7);

  return (
    <Card tone="peach" radius="lg" padding="lg" className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {streak.recovery ? (
            <Heart className="h-4 w-4 text-ink" strokeWidth={2.25} />
          ) : (
            <Flame className="h-4 w-4 text-ink" strokeWidth={2.25} />
          )}
          <span className="text-[14px] font-semibold uppercase tracking-wider text-ink/70">
            {streak.recovery ? "Recovery mode" : "Streak"}
          </span>
        </div>
        <Pill tone="ink" size="sm">Best · {streak.best}d</Pill>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-[44px] font-extrabold leading-none tracking-tight text-ink">
          {streak.current}
        </span>
        <span className="text-[16px] text-ink/70 font-medium">
          {streak.current === 1 ? "day" : "days"}
        </span>
      </div>

      {streak.recovery && (
        <p className="text-[13px] leading-relaxed text-ink/80">
          You missed yesterday — that's okay. One log today and you're back on track.
        </p>
      )}

      <div className="flex gap-1.5">
        {last7.map((hit, i) => {
          const isToday = i === last7.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className={cn(
                "h-2 w-full rounded-full",
                hit ? "bg-ink" : "bg-ink/15",
                isToday && !hit && "ring-1 ring-ink/40",
              )} />
              <span className={cn(
                "text-[10px] font-semibold",
                isToday ? "text-ink" : "text-ink/55",
              )}>{labels[i]}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

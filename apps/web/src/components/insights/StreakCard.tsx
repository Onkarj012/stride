import { Flame, Heart } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { localDateStr } from "@/lib/utils";
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

/**
 * StreakCard now reads the streak from the backend (api.history.getStreak),
 * which walks across meals + workouts for the last 90 days.
 *
 * This fixes the previous bug where the homepage only loaded today's logs
 * via `useLogs()`, capping the displayed streak at 1 day even when the user
 * had been logging for many days.
 */
export function StreakCard() {
  const today = localDateStr();
  const streakInfo = useQuery(api.history.getStreak, { today });
  // We also pull the last ~7 days of activity from the calendar query to
  // colour the day cells. Using insights endpoint would be heavier.
  const now = new Date();
  const calendar = useQuery(api.history.getCalendar, {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const current = streakInfo?.streak ?? 0;
  const todayLogged = streakInfo?.todayLogged ?? false;

  // Build last 7 day hits from the calendar (true if there was any meal/workout)
  const last7: boolean[] = [];
  const labels = lastNDayLabels(7);
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cell = calendar?.[key];
    last7.push(!!cell && (cell.meals > 0 || cell.workouts > 0));
  }

  // Recovery: streak is 0 today but yesterday had activity (i.e. user just missed today)
  const recovery = !todayLogged && current === 0 && last7.length >= 2 && last7[last7.length - 2];

  return (
    <Card tone="peach" radius="lg" padding="lg" className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {recovery ? (
            <Heart className="h-4 w-4 text-ink" strokeWidth={2.25} />
          ) : (
            <Flame className="h-4 w-4 text-ink" strokeWidth={2.25} />
          )}
          <span className="text-[14px] font-semibold uppercase tracking-wider text-ink/70">
            {recovery ? "Recovery mode" : "Streak"}
          </span>
        </div>
        {streakInfo && (
          <Pill tone="ink" size="sm">{todayLogged ? "Logged today" : "Pending today"}</Pill>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-[44px] font-extrabold leading-none tracking-tight text-ink">
          {current}
        </span>
        <span className="text-[16px] text-ink/70 font-medium">
          {current === 1 ? "day" : "days"}
        </span>
      </div>

      {recovery && (
        <p className="text-[13px] leading-relaxed text-ink/80">
          You missed today — that's okay. One log brings you right back.
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

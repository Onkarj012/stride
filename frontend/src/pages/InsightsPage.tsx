import { useState } from "react";
import { Moon, Droplets, Dumbbell, Flame, TrendingUp, Sparkles } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { PageHeader } from "@/components/layout/PageHeader";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { MacroBars } from "@/components/charts/MacroBars";
import { MilestoneList } from "@/components/insights/MilestoneList";
import { PeriodSwitcher, type Period } from "@/components/insights/PeriodSwitcher";
import { useLogs } from "@/hooks/useLogs";

function periodDays(period: Period): number {
  return period === "today" ? 1 : period === "week" ? 7 : 30;
}

export function InsightsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const days = periodDays(period);

  // Convex progress data (7 or 30 days)
  const progressRows = useQuery(api.progress.getProgress, { days }) ?? [];

  // Today's data from useLogs (for "today" view)
  const { logs } = useLogs();

  // Aggregate from progress rows
  const totalKcal = progressRows.reduce((s, r) => s + r.calories, 0);
  const totalProtein = progressRows.reduce((s, r) => s + r.protein, 0);
  const totalWorkouts = progressRows.reduce((s, r) => s + r.workouts, 0);
  const avgGoal = progressRows.length > 0
    ? Math.round(progressRows.reduce((s, r) => s + r.goal, 0) / progressRows.length)
    : 2400;

  // For "today" view, use today's logs directly
  const todayKcal = period === "today"
    ? logs.reduce((s, l) => s + (l.meal?.kcal ?? 0), 0)
    : totalKcal;
  const todayProtein = period === "today"
    ? logs.reduce((s, l) => s + (l.meal?.protein ?? 0), 0)
    : totalProtein;
  const todayCarbs = period === "today"
    ? logs.reduce((s, l) => s + (l.meal?.carbs ?? 0), 0)
    : progressRows.reduce((s, r) => s + (("carbs" in r ? (r as { carbs?: number }).carbs : undefined) ?? 0), 0);
  const todayFat = period === "today"
    ? logs.reduce((s, l) => s + (l.meal?.fat ?? 0), 0)
    : 0;

  const workoutMin = period === "today"
    ? logs.reduce((s, l) => s + (l.workout?.duration ?? 0), 0)
    : 0;

  const activeDays = new Set(progressRows.filter((r) => r.calories > 0 || r.workouts > 0).map((r) => r.date)).size;

  // Daily insights from Convex
  const today = new Date().toISOString().split("T")[0];
  const insightsData = useQuery(api.insights.getDailyInsights, { date: today });
  const weeklySummary = useQuery(api.insights.getWeeklySummary);

  const macroTarget = { kcal: avgGoal * days, protein: 150 * days, carbs: 200 * days, fat: 60 * days };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        center={
          <div className="flex flex-col items-center -space-y-0.5">
            <span className="text-h2 text-text">Insights</span>
            <span className="text-caption text-text-muted">
              {period === "today" ? "Your day so far" : period === "week" ? "Last 7 days" : "Last 30 days"}
            </span>
          </div>
        }
      />

      <div className="flex justify-center">
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </div>

      {/* Weekly/monthly AI summary */}
      {period !== "today" && weeklySummary && (
        <Card tone="lavender" radius="xl" padding="lg" className="space-y-2">
          <Pill tone="ink" size="sm" className="gap-1.5">
            <Sparkles className="h-3 w-3" strokeWidth={2.25} />
            {period === "week" ? "This week" : "This month"}
          </Pill>
          <p className="text-[15px] leading-relaxed text-ink/75">{weeklySummary.content}</p>
        </Card>
      )}

      {/* Daily AI insights */}
      {period === "today" && insightsData && insightsData.insights.length > 0 && (
        <Card tone="lavender" radius="xl" padding="lg" className="space-y-2">
          <Pill tone="ink" size="sm" className="gap-1.5">
            <Sparkles className="h-3 w-3" strokeWidth={2.25} />
            Today's insights
          </Pill>
          <ul className="space-y-1.5">
            {insightsData.insights.map((insight, i) => (
              <li key={i} className="text-[14px] leading-relaxed text-ink/80">• {insight}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Nutrition + streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card tone="card" radius="lg" padding="lg" className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-h3 text-text">Nutrition</h3>
            <span className="text-[13px] text-text-muted">
              {Math.round(todayKcal)} / {macroTarget.kcal} kcal
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <MacroDonut kcal={todayKcal} protein={todayProtein} carbs={todayCarbs} fat={todayFat} />
            <MacroBars
              protein={todayProtein}
              carbs={todayCarbs}
              fat={todayFat}
              target={{ protein: macroTarget.protein, carbs: macroTarget.carbs, fat: macroTarget.fat }}
            />
          </div>
        </Card>

        {/* Active days card */}
        <Card tone="card" radius="lg" padding="lg" className="space-y-3 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Active days</span>
          </div>
          <div>
            <span className="text-[40px] font-extrabold text-text leading-none">{activeDays}</span>
            <span className="text-[14px] text-text-muted ml-1">of {days}</span>
          </div>
          <p className="text-[12.5px] text-text-muted">{totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""} logged</p>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card tone="card" radius="lg" padding="lg" className="space-y-3">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Workouts</span>
          </div>
          <div>
            <span className="text-[28px] font-extrabold text-text leading-none">
              {period === "today" ? workoutMin : totalWorkouts}
            </span>
            <span className="text-[14px] text-text-muted ml-1">{period === "today" ? "min" : "sessions"}</span>
          </div>
        </Card>

        <Card tone="card" radius="lg" padding="lg" className="space-y-3">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Avg calories</span>
          </div>
          <div>
            <span className="text-[28px] font-extrabold text-text leading-none">
              {progressRows.length > 0 ? Math.round(totalKcal / progressRows.length) : 0}
            </span>
            <span className="text-[14px] text-text-muted ml-1">kcal/day</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-peach"
              style={{ width: `${Math.min(100, (totalKcal / Math.max(1, progressRows.length) / avgGoal) * 100)}%` }}
            />
          </div>
        </Card>

        <Card tone="card" radius="lg" padding="lg" className="space-y-3">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
            <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Calorie goal</span>
          </div>
          <div>
            <span className="text-[28px] font-extrabold text-text leading-none">{avgGoal}</span>
            <span className="text-[14px] text-text-muted ml-1">kcal</span>
          </div>
        </Card>
      </div>

      {/* Weekly bar chart */}
      {progressRows.length > 0 && (
        <Card tone="card" radius="lg" padding="lg" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-h3 text-text">Daily calories</h3>
            <span className="text-caption text-text-muted">Goal: {avgGoal} kcal</span>
          </div>
          <div className="flex items-end gap-1.5 h-24">
            {progressRows.map((r) => {
              const pct = Math.min(1, r.calories / Math.max(1, avgGoal));
              return (
                <div key={r.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-[4px] bg-peach/80 transition-all" style={{ height: `${pct * 80}px` }} />
                  <span className="text-[9px] text-text-muted">{r.dayLabel}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Milestones */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-text-muted" strokeWidth={1.75} />
          <h2 className="text-h2 text-text">Milestones</h2>
        </div>
        <MilestoneList logs={logs} />
      </section>
    </div>
  );
}

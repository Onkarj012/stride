import { useState } from "react";
import {
  Dumbbell, Flame, TrendingUp, Sparkles,
  UtensilsCrossed, Lightbulb, Pencil, RotateCcw, Trash2, RefreshCw,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { MacroCard, MilestoneCard, NarrativeCard, StatChip, StreakCard } from "@/components/ui-kit";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { ScreenHeader } from "@/components/mobile/MobileKit";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { MacroBars } from "@/components/charts/MacroBars";
import { MilestoneList } from "@/components/insights/MilestoneList";
import { PeriodSwitcher, type Period } from "@/components/insights/PeriodSwitcher";
import { EditLogModal, type EditableMeal, type EditableWorkout } from "@/components/coach/EditLogModal";
import { useToast } from "@/context/ToastContext";
import { useLogs } from "@/hooks/useLogs";
import { localDateStr } from "@/lib/utils";
import { localDateTime } from "@/lib/localDateTime";

function periodDays(period: Period): number {
  return period === "today" ? 1 : period === "week" ? 7 : 30;
}

/* ── Today's meals card ── */
function TodaysMealsCard({ date }: { date: string }) {
  const data = useQuery(api.history.getDayHistory, { date }) as { meals?: any[] } | undefined;
  const meals = data?.meals ?? [];
  const relogMeal = useMutation(api.meals.relogMeal);
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const toast = useToast();
  const [editing, setEditing] = useState<EditableMeal | null>(null);

  async function handleRelog(id: Id<"meals">, name: string) {
    try {
      const { date, time } = localDateTime();
      await relogMeal({ id, date, time });
      toast.success("Logged again", name);
    } catch (err) {
      toast.error("Couldn't re-log", err instanceof Error ? err.message : "Try again");
    }
  }

  return (
    <>
      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-peach" strokeWidth={2} />
            <h3 className="text-h3 text-text">Today's meals</h3>
          </div>
          <span className="text-[12px] text-text-muted">
            {meals.length} {meals.length === 1 ? "entry" : "entries"}
          </span>
        </header>
        {meals.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13.5px] text-text-muted">No meals yet today.</p>
            <p className="text-[12px] text-text-subtle mt-1">Tell Stry on the home screen and it'll log it for you.</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {meals.map((m) => (
              <li key={m._id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-text">{m.name}</span>
                    <span className="text-[11px] text-text-muted">{m.time}</span>
                    {m.mealType && m.mealType !== "unspecified" && (
                      <Pill tone="muted" size="sm" className="capitalize">{m.mealType}</Pill>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-text-muted">
                    <span>{Math.round(m.calories)} kcal</span>
                    <span>{Math.round(m.protein)}g protein</span>
                    <span>{Math.round(m.carbs)}g carbs</span>
                    <span>{Math.round(m.fat)}g fat</span>
                  </div>
                  {m.aiSuggestion && (
                    <p className="text-[12px] italic text-text-subtle line-clamp-2">{m.aiSuggestion}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setEditing(m as EditableMeal)}
                    aria-label="Edit"
                    title="Edit"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-card-elev transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRelog(m._id as Id<"meals">, m.name)}
                    aria-label="Log again"
                    title="Log again"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-lavender hover:bg-lavender/10 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMeal({ id: m._id as Id<"meals"> }).catch((err) => toast.error("Couldn't delete", err instanceof Error ? err.message : "Try again"))}
                    aria-label="Delete"
                    title="Delete"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum hover:bg-bubblegum/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <EditLogModal kind="meal" entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/* ── Today's workouts card ── */
function TodaysWorkoutsCard({ date }: { date: string }) {
  const data = useQuery(api.history.getDayHistory, { date }) as { workouts?: any[] } | undefined;
  const workouts = data?.workouts ?? [];
  const relogWorkout = useMutation(api.workouts.relogWorkout);
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);
  const toast = useToast();
  const [editing, setEditing] = useState<EditableWorkout | null>(null);

  async function handleRelog(id: Id<"workouts">, name: string) {
    try {
      const { date, time } = localDateTime();
      await relogWorkout({ id, date, timestamp: time, idempotencyToken: crypto.randomUUID() });
      toast.success("Logged again", name);
    } catch (err) {
      toast.error("Couldn't re-log", err instanceof Error ? err.message : "Try again");
    }
  }

  return (
    <>
      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-lavender" strokeWidth={2} />
            <h3 className="text-h3 text-text">Today's workouts</h3>
          </div>
          <span className="text-[12px] text-text-muted">
            {workouts.length} {workouts.length === 1 ? "session" : "sessions"}
          </span>
        </header>
        {workouts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13.5px] text-text-muted">No workouts yet today.</p>
            <p className="text-[12px] text-text-subtle mt-1">A 20-minute walk counts. Stry can log it for you.</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {workouts.map((w) => (
              <li key={w._id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-text">{w.name}</span>
                    <Pill tone="muted" size="sm" className="capitalize">{w.intensity.toLowerCase()}</Pill>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-text-muted">
                    {w.duration && <span>{w.duration} min</span>}
                    {w.caloriesBurned != null && <span>{Math.round(w.caloriesBurned)} kcal burned</span>}
                  </div>
                  {w.rationale && (
                    <p className="text-[12px] italic text-text-subtle line-clamp-2">{w.rationale}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setEditing(w as EditableWorkout)}
                    aria-label="Edit"
                    title="Edit"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-card-elev transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRelog(w._id as Id<"workouts">, w.name)}
                    aria-label="Log again"
                    title="Log again"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-lavender hover:bg-lavender/10 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteWorkout({ id: w._id as Id<"workouts"> }).catch((err) => toast.error("Couldn't delete", err instanceof Error ? err.message : "Try again"))}
                    aria-label="Delete"
                    title="Delete"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum hover:bg-bubblegum/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <EditLogModal kind="workout" entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/* ── Today's AI insights & tips card ── */
export function TodaysInsightsCard({ date }: { date: string }) {
  const insightsData = useQuery(api.insights.getDailyInsights, { date });
  const brief = useQuery(api.insights.getTodayBrief, { today: date });
  const generate = useAction(api.ai.generateDailyInsights);
  const toast = useToast();
  const [generating, setGenerating] = useState(false);

  const insights = (insightsData?.insights ?? []) as string[];

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generate({ date });
      toast.success("Insights refreshed");
    } catch (err) {
      toast.error("Couldn't refresh", err instanceof Error ? err.message : "Try again");
    } finally {
      setGenerating(false);
    }
  }

  const hasContent = insights.length > 0 || (brief && brief.priority);

  return (
    <Card tone="lavender" radius="xl" padding="lg" className="space-y-3">
      <div className="flex items-center justify-between">
        <Pill tone="ink" size="sm" className="gap-1.5">
          <Sparkles className="h-3 w-3" strokeWidth={2.25} />
          Today's insights
        </Pill>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink/70 hover:text-ink disabled:opacity-50"
          aria-label="Refresh insights"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} strokeWidth={2.25} />
          {generating ? "Generating…" : "Refresh"}
        </button>
      </div>

      {brief && brief.priority && (
        <div>
          <p className="text-[13px] font-bold text-ink uppercase tracking-wider">{brief.headline}</p>
          <p className="text-[14.5px] leading-relaxed text-ink/85 mt-1">{brief.priority}</p>
        </div>
      )}

      {brief && brief.nudge && brief.nudge.action && (
        <div className="flex items-start gap-2 rounded-2xl bg-ink/5 px-3 py-2">
          <Lightbulb className="h-4 w-4 text-ink/70 mt-0.5 shrink-0" strokeWidth={2} />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink">{brief.nudge.action}</p>
            <p className="text-[12px] text-ink/70">{brief.nudge.reason}</p>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {insights.map((insight, i) => (
            <li key={i} className="text-[14px] leading-relaxed text-ink/85">• {insight}</li>
          ))}
        </ul>
      )}

      {!hasContent && (
        <p className="text-[13px] text-ink/70">Tap refresh to get today's coaching tips.</p>
      )}
    </Card>
  );
}

/** Compact insights card for the sidebar slot in the Insights grid. */
function TodaysInsightsMini({ date }: { date: string }) {
  const insightsData = useQuery(api.insights.getDailyInsights, { date });
  const brief = useQuery(api.insights.getTodayBrief, { today: date });
  const generate = useAction(api.ai.generateDailyInsights);
  const toast = useToast();
  const insights = (insightsData?.insights ?? []) as string[];
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    setGenerating(true);
    try {
      await generate({ date });
    } catch (err) {
      toast.error("Couldn't refresh", err instanceof Error ? err.message : "Try again");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card tone="lavender" radius="lg" padding="lg" className="space-y-3 overflow-y-auto max-h-[280px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
          <span className="text-[13px] font-bold uppercase tracking-wider text-ink/70">Today's insights</span>
        </div>
        <button type="button" onClick={refresh} disabled={generating}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink/60 hover:text-ink disabled:opacity-40">
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} strokeWidth={2.25} />
        </button>
      </div>
      {brief?.priority && (
        <p className="text-[13.5px] leading-relaxed text-ink/85">{brief.priority}</p>
      )}
      {brief?.nudge?.action && (
        <div className="flex items-start gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-ink/60 mt-0.5 shrink-0" strokeWidth={2} />
          <p className="text-[12.5px] text-ink/75">{brief.nudge.action}</p>
        </div>
      )}
      {insights.length > 0 && (
        <ul className="space-y-1">
          {insights.map((s, i) => (
            <li key={i} className="text-[12.5px] text-ink/80">• {s}</li>
          ))}
        </ul>
      )}
      {!brief?.priority && insights.length === 0 && (
        <p className="text-[12.5px] text-ink/60">Log meals and workouts, then tap refresh.</p>
      )}
    </Card>
  );
}

function PatternsCard() {
  const patterns = useQuery(api.patterns.getPatterns, {}) as string[] | undefined;
  if (!patterns || patterns.length === 0) return null;
  return (
    <Card tone="card" radius="lg" padding="lg" className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-lavender" strokeWidth={2} />
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Patterns we noticed</h3>
      </div>
      <ul className="space-y-2">
        {patterns.map((p, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-text">
            <Lightbulb className="h-4 w-4 text-peach shrink-0 mt-0.5" strokeWidth={2} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function InsightsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const days = periodDays(period);
  const today = localDateStr();

  // Convex progress data (7 or 30 days)
  const progressRows = (useQuery(api.progress.getProgress, { days, today }) ?? []) as Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    workouts: number;
    goal: number;
  }>;

  // Today's logs (used for "today" macros and milestones)
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
    : progressRows.reduce((s, r) => s + r.carbs, 0);
  const todayFat = period === "today"
    ? logs.reduce((s, l) => s + (l.meal?.fat ?? 0), 0)
    : progressRows.reduce((s, r) => s + r.fat, 0);

  const workoutMin = period === "today"
    ? logs.reduce((s, l) => s + (l.workout?.duration ?? 0), 0)
    : 0;

  const activeDays = new Set(
    progressRows.filter((r) => r.calories > 0 || r.workouts > 0).map((r) => r.date),
  ).size;

  const weeklySummary = useQuery(api.insights.getWeeklySummary);
  const profile = useQuery(api.profile.getProfile);

  const macroTarget = {
    kcal: avgGoal * days,
    protein: (profile?.proteinTarget ?? 150) * days,
    carbs: (profile?.carbTarget ?? 200) * days,
    fat: (profile?.fatTarget ?? 60) * days,
  };
  const milestoneItems = [
    { label: "Protein", achieved: todayProtein >= macroTarget.protein * 0.7 },
    { label: "Training", achieved: period === "today" ? workoutMin > 0 : totalWorkouts > 0 },
    { label: "Active days", achieved: activeDays >= Math.min(days, 3) },
  ];
  const mobileNarrative = period !== "today" && weeklySummary
    ? weeklySummary.content
    : `You have logged ${Math.round(todayKcal).toLocaleString()} kcal and ${Math.round(todayProtein)}g protein for this ${period === "today" ? "day" : period}.`;

  return (
    <>
    <div className="lg:hidden px-5 pt-4 pb-6">
      <ScreenHeader title="Insights" sub="What's working, what to watch" />
      <div className="flex gap-2 mb-5">
        {(["today", "week", "month"] as const).map((range) => (
          <button
            key={range}
            onClick={() => setPeriod(range)}
            className={`flex-1 py-2 rounded-full text-[13px] font-bold capitalize transition-colors border ${
              period === range
                ? "bg-ink text-white border-ink dark:bg-lavender dark:text-ink dark:border-lavender"
                : "bg-white dark:bg-[#1a1e2e] text-ink/55 dark:text-white/55 border-ink/12 dark:border-white/12"
            }`}
          >
            {range}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <NarrativeCard type={period === "today" ? "daily" : "weekly"} narrative={mobileNarrative} date={period === "today" ? "Today" : period === "week" ? "Last 7 days" : "Last 30 days"} />
        <MacroCard kcal={Math.round(todayKcal)} protein={Math.round(todayProtein)} carbs={Math.round(todayCarbs)} fat={Math.round(todayFat)} />
        <StreakCard />
        <MilestoneCard milestones={milestoneItems} />
      </div>
    </div>

    <div className="hidden lg:block space-y-6 max-w-6xl mx-auto">
      <PageHeader
        center={
          <div className="flex flex-col items-center -space-y-0.5">
            <span className="text-h2 text-text">Insights</span>
            <span className="text-caption text-text-muted">
              {period === "today" ? "Your day so far" : period === "week" ? "Last 7 days" : "Last 30 days"}
            </span>
          </div>
        }
        right={<NavTrigger className="lg:hidden" />}
      />

      <div className="flex justify-center">
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </div>

      {/* Correlation / pattern insights */}
      <PatternsCard />

      {/* Weekly/monthly AI summary */}
      {period !== "today" && weeklySummary && (
        <NarrativeCard
          type="weekly"
          narrative={weeklySummary.content}
          date={period === "week" ? "Last 7 days" : "Last 30 days"}
        />
      )}

      {/* Nutrition + Today's Insights (replaces Active Days) */}
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

        {/* Today's Insights replaces Active Days */}
        {period === "today" ? (
          <TodaysInsightsMini date={today} />
        ) : (
          <Card tone="card" radius="lg" padding="lg" className="space-y-3 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
              <span className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Active days</span>
            </div>
            <div>
              <span className="text-[40px] font-extrabold text-text leading-none">{activeDays}</span>
              <span className="text-[14px] text-text-muted ml-1">of {days}</span>
            </div>
            <p className="text-[12.5px] text-text-muted">
              {totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""} logged
            </p>
          </Card>
        )}
      </div>

      {/* Streak + key stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StreakCard />
        <div className="flex flex-wrap gap-3 content-start">
          <StatChip
            className="flex-1"
            label="Workouts"
            value={String(period === "today" ? workoutMin : totalWorkouts)}
            unit={period === "today" ? "min" : "sessions"}
            color="lavender"
          />
          <StatChip
            className="flex-1"
            label="Avg calories"
            value={String(progressRows.length > 0 ? Math.round(totalKcal / progressRows.length) : 0)}
            unit="kcal/day"
            color="peach"
          />
          <StatChip
            className="flex-1"
            label="Calorie goal"
            value={String(avgGoal)}
            unit="kcal"
            color="sky"
          />
        </div>
      </div>

      {/* Today's meals + workouts (moved below charts) */}
      {period === "today" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TodaysMealsCard date={today} />
          <TodaysWorkoutsCard date={today} />
        </div>
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
    </>
  );
}

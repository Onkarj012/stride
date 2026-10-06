import { useState } from "react";
import {
  Dumbbell, TrendingUp, Sparkles,
  UtensilsCrossed, Lightbulb, Pencil, RotateCcw, Trash2,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/primitives/Card";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Pill } from "@/components/primitives/Pill";
import { MacroCard, NarrativeCard, StatChip } from "@/components/ui-kit";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { ScreenHeader } from "@/components/mobile/MobileKit";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { MacroBars } from "@/components/charts/MacroBars";
import { PeriodSwitcher, type Period } from "@/components/insights/PeriodSwitcher";
import { EditLogModal, type EditableMeal, type EditableWorkout } from "@/components/coach/EditLogModal";
import { useToast } from "@/context/ToastContext";
import { useLogs } from "@/hooks/useLogs";
import { localDateStr } from "@/lib/utils";
import { localDateTime } from "@/lib/localDateTime";
import { NutritionSourceBadge } from "@/components/ui-kit/NutritionSourceBadge";

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

  if (data === undefined) {
    return (
      <Card tone="card" radius="lg" padding="lg" className="space-y-3">
        <Skeleton className="h-5 w-36 rounded" />
        <Skeleton className="h-16 w-full rounded" />
      </Card>
    );
  }

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
                    <NutritionSourceBadge source={m.nutritionSource ?? undefined} confidence={m.confidence ?? undefined} verified={m.nutritionVerified ?? false} />
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

  if (data === undefined) {
    return (
      <Card tone="card" radius="lg" padding="lg" className="space-y-3">
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-16 w-full rounded" />
      </Card>
    );
  }

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
                    <NutritionSourceBadge source={w.calculationVersion ? "calorie_engine" : undefined} confidence={w.calorieConfidence ?? undefined} rough={w.calorieEstimateRough} />
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

/** Compact insights card for the sidebar slot in the Insights grid. */
function TodaysInsightsMini({ date }: { date: string }) {
  const brief = useQuery(api.insights.getTodayBrief, { today: date });

  return (
    <Card tone="lavender" radius="lg" padding="lg" className="space-y-3 overflow-y-auto max-h-[280px]">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
        <span className="text-[13px] font-bold uppercase tracking-wider text-ink/70">Today's insights</span>
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
      {!brief?.priority && (
        <p className="text-[12.5px] text-ink/60">Log meals and workouts to see today's guidance.</p>
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
  const brief = useQuery(api.insights.getTodayBrief, { today });
  const progressRowsResult = useQuery(api.progress.getProgress, { days, today });
  const progressRows = (progressRowsResult ?? []) as Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    workouts: number;
    goal: number;
    proteinGoal?: number;
    carbGoal?: number;
    fatGoal?: number;
  }>;

  // Today's logs (used for "today" macros)
  const { logs } = useLogs();
  const mealsResult = useQuery(api.meals.getMeals, { date: today });
  const workoutsResult = useQuery(api.workouts.getWorkouts, { date: today });
  const waterResult = useQuery(api.wellness.getWater, { date: today });
  const sleepResult = useQuery(api.wellness.getSleep, { date: today });
  const moodResult = useQuery(api.wellness.getMood, { date: today });
  const stepsResult = useQuery(api.wellness.getSteps, { date: today });
  const logsLoading = [mealsResult, workoutsResult, waterResult, sleepResult, moodResult, stepsResult].some((result) => result === undefined);

  // Aggregate from progress rows
  const totalKcal = progressRows.reduce((s, r) => s + r.calories, 0);
  const totalProtein = progressRows.reduce((s, r) => s + r.protein, 0);
  const totalWorkouts = progressRows.reduce((s, r) => s + r.workouts, 0);

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

  const profile = useQuery(api.profile.getProfile);

  if (progressRowsResult === undefined || brief === undefined || logsLoading) {
    return (
      <>
        <div className="lg:hidden px-5 pt-4 pb-6">
          <ScreenHeader title="Insights" sub="What's working, what to watch" />
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-[20px]" />
            <Skeleton className="h-28 w-full rounded-[20px]" />
          </div>
        </div>
        <div className="hidden lg:block space-y-6 max-w-6xl mx-auto">
          <PageHeader
            center={
              <div className="flex flex-col items-center -space-y-0.5">
                <span className="text-h2 text-text">Insights</span>
                <span className="text-caption text-text-muted">Your day so far</span>
              </div>
            }
            right={<NavTrigger className="lg:hidden" />}
          />
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-[20px]" />
            <Skeleton className="h-28 w-full rounded-[20px]" />
          </div>
        </div>
      </>
    );
  }

  // Wait for real targets so goal values do not flash from fallback values.
  const profileLoaded = profile !== undefined;
  const targetsLoaded = brief !== undefined;
  const dailyTargets = brief?.stats;
  const finiteGoal = (value: number | undefined, fallback: number | undefined): number =>
    Number.isFinite(value) ? value! : Number.isFinite(fallback) ? fallback! : 0;
  const macroTarget = progressRows.reduce(
    (totals, row) => ({
      kcal: totals.kcal + row.goal,
      protein: totals.protein + finiteGoal(row.proteinGoal, dailyTargets?.proteinTarget),
      carbs: totals.carbs + finiteGoal(row.carbGoal, dailyTargets?.carbTarget),
      fat: totals.fat + finiteGoal(row.fatGoal, dailyTargets?.fatTarget),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const mobileNarrative = `You have logged ${Math.round(todayKcal).toLocaleString()} kcal and ${Math.round(todayProtein)}g protein for this ${period === "today" ? "day" : period}.`;

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

      {/* Nutrition + Today's Insights (replaces Active Days) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {profileLoaded && targetsLoaded && (
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
        )}

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

      {/* Key stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          {profileLoaded && targetsLoaded && (
            <StatChip
              className="flex-1"
              label="Calorie goal"
              value={String(dailyTargets?.calorieTarget ?? 0)}
              unit="kcal"
              color="sky"
            />
          )}
        </div>
      </div>

      {/* Today's meals + workouts (moved below charts) */}
      {period === "today" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TodaysMealsCard date={today} />
          <TodaysWorkoutsCard date={today} />
        </div>
      )}
    </div>
    </>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trash2, Pencil, RotateCcw } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/primitives/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { OverlayHeader } from "@/components/mobile/MobileKit";
import { EditLogModal, type EditableMeal, type EditableWorkout } from "@/components/coach/EditLogModal";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";
import { NutritionSourceBadge } from "@/components/ui-kit/NutritionSourceBadge";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function DayCell({ date, hasMeals, hasWorkouts, isSelected, isToday, onClick }: {
  date: Date; hasMeals: boolean; hasWorkouts: boolean;
  isSelected: boolean; isToday: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "relative aspect-square flex flex-col items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none",
        isSelected ? "bg-ink text-text-on-ink" : isToday ? "ring-1 ring-lavender text-text hover:bg-card-elev" : "text-text hover:bg-card-elev",
      )}>
      <span className="text-[13px] font-semibold leading-none">{date.getDate()}</span>
      {(hasMeals || hasWorkouts) && (
        <span className="absolute bottom-1 flex gap-0.5">
          {hasMeals && <span className={cn("h-1 w-1 rounded-full", isSelected ? "bg-text-on-ink/80" : "bg-peach")} />}
          {hasWorkouts && <span className={cn("h-1 w-1 rounded-full", isSelected ? "bg-text-on-ink/80" : "bg-lavender")} />}
        </span>
      )}
    </button>
  );
}

function CalendarGrid({ calendarData, selected, onSelect }: {
  calendarData: Record<string, { meals: number; workouts: number; calories: number; burned: number }>;
  selected: Date; onSelect: (d: Date) => void;
}) {
  const [month, setMonth] = useState<Date>(() => { const d = new Date(selected); d.setDate(1); return d; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const grid = getMonthGrid(month.getFullYear(), month.getMonth());

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <span className="text-[13px] font-semibold text-text">
          {month.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAYS.map((d, i) => <span key={i} className="text-center text-[10px] font-medium text-text-muted">{d}</span>)}
      </div>
      <div className="space-y-0.5">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-0.5">
            {row.map((d, ci) => {
              if (!d) return <div key={`e-${ri}-${ci}`} />;
              const key = toDateStr(d);
              const dd = calendarData[key];
              return (
                <DayCell key={key} date={d}
                  hasMeals={(dd?.meals ?? 0) > 0} hasWorkouts={(dd?.workouts ?? 0) > 0}
                  isSelected={isSameDay(d, selected)} isToday={isSameDay(d, today)}
                  onClick={() => onSelect(d)} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

type Tab = "meals" | "workouts";

/* ── Expandable workout row ── */
function WorkoutRow({ w, onEdit, onRelog, onDelete, relogging }: {
  w: any;
  onEdit: () => void;
  onRelog: () => void;
  onDelete: () => void;
  relogging: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Parse structuredSets JSON if available
  const exercises: Array<{
    name: string;
    muscle_group?: string;
    weight_unit?: string;
    sets: Array<{ weight?: string; reps?: string; distance_km?: string; duration_min?: string; incline?: string; pace?: string; calories_per_hr?: string }>;
  }> = (() => {
    try { return w.structuredSets ? JSON.parse(w.structuredSets) : (w.exercises ?? []); }
    catch { return w.exercises ?? []; }
  })();

  const hasDetail = exercises.length > 0;

  return (
    <li className="divide-y divide-border/50">
      {/* Collapsed summary row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-text">{w.name}</span>
            {hasDetail && (
              <button type="button" onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-0.5 rounded-full bg-lavender/12 hover:bg-lavender/20 px-2 py-0.5 text-[11px] font-semibold text-lavender transition-colors">
                {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
                {open ? <ChevronUp className="h-3 w-3" strokeWidth={2.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={2.5} />}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[12px] text-text-muted">
            {w.duration && <span>{w.duration}</span>}
            <span className="capitalize">{w.intensity?.toLowerCase()}</span>
            {(w.caloriesBurned ?? 0) > 0 && <span>{w.caloriesBurned} kcal</span>}
            <NutritionSourceBadge source={w.calculationVersion ? "calorie_engine" : undefined} confidence={w.calorieConfidence ?? undefined} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={onEdit} aria-label="Edit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-card-elev transition-colors">
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button type="button" onClick={onRelog} disabled={relogging} aria-label="Log again"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-lavender hover:bg-lavender/10 transition-colors disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum hover:bg-bubblegum/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Expanded exercise detail */}
      {open && hasDetail && (
        <div className="px-4 py-3 bg-bg/50 space-y-3">
          {exercises.map((ex, ei) => (
            <div key={ei}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-[12.5px] font-bold text-text">{ex.name}</span>
                {ex.muscle_group && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-lavender bg-lavender/10 px-1.5 py-0.5 rounded-full">
                    {ex.muscle_group}
                  </span>
                )}
                {ex.weight_unit && ex.weight_unit !== "kg" && (
                  <span className="text-[10px] text-text-muted">{ex.weight_unit}</span>
                )}
              </div>
              {/* Cardio exercise */}
              {ex.muscle_group === "cardio" && ex.sets[0]?.duration_min ? (
                <div className="flex flex-wrap gap-3 text-[12px] text-text-muted">
                  {ex.sets[0].duration_min && <span>{ex.sets[0].duration_min} min</span>}
                  {ex.sets[0].distance_km && <span>{ex.sets[0].distance_km} km</span>}
                  {ex.sets[0].incline && <span>incline {ex.sets[0].incline}</span>}
                  {ex.sets[0].pace && <span>pace {ex.sets[0].pace}</span>}
                  {ex.sets[0].calories_per_hr && <span>{ex.sets[0].calories_per_hr} cal/hr</span>}
                </div>
              ) : (
                /* Strength exercise — mini table */
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        <th className="pb-1 w-8">Set</th>
                        <th className="pb-1">Weight</th>
                        <th className="pb-1">Reps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ex.sets.map((s, si) => (
                        <tr key={si} className="border-t border-border/40">
                          <td className="py-1 text-text-muted">{si + 1}</td>
                          <td className="py-1 font-semibold text-text">{s.weight || "—"}{s.weight && ex.weight_unit ? ` ${ex.weight_unit}` : ""}</td>
                          <td className="py-1 text-text">{s.reps || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {w.rationale && (
            <p className="text-[11.5px] italic text-text-subtle pt-1 border-t border-border/40">
              {w.rationale}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function DayDetail({ date, onDeleteMeal, onDeleteWorkout }: {
  date: Date;
  onDeleteMeal: (id: Id<"meals">) => void;
  onDeleteWorkout: (id: Id<"workouts">) => void;
}) {
  const [tab, setTab] = useState<Tab>("meals");
  const data = useQuery(api.history.getDayHistory, { date: toDateStr(date) }) as { meals?: any[]; workouts?: any[] } | undefined;
  const meals = data?.meals ?? [];
  const workouts = data?.workouts ?? [];

  const relogMeal = useMutation(api.meals.relogMeal);
  const relogWorkout = useMutation(api.workouts.relogWorkout);
  const toast = useToast();
  const [editMeal, setEditMeal] = useState<EditableMeal | null>(null);
  const [editWorkout, setEditWorkout] = useState<EditableWorkout | null>(null);
  const [relogging, setRelogging] = useState<string | null>(null);

  async function handleRelogMeal(id: Id<"meals">, name: string) {
    if (relogging) return;
    setRelogging(id);
    try {
      await relogMeal({ id });
      toast.success("Logged again", `${name} added to today`);
    } catch (err) {
      toast.error("Couldn't re-log", err instanceof Error ? err.message : "Try again");
    } finally {
      setRelogging(null);
    }
  }

  async function handleRelogWorkout(id: Id<"workouts">, name: string) {
    if (relogging) return;
    setRelogging(id);
    try {
      await relogWorkout({ id, idempotencyToken: crypto.randomUUID() });
      toast.success("Logged again", `${name} added to today`);
    } catch (err) {
      toast.error("Couldn't re-log", err instanceof Error ? err.message : "Try again");
    } finally {
      setRelogging(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-h2 text-text">{formatDate(date)}</h3>
        <span className="text-[13px] text-text-muted">{meals.length + workouts.length} entries</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5">
        {(["meals", "workouts"] as Tab[]).map((t) => {
          const count = t === "meals" ? meals.length : workouts.length;
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors capitalize",
                tab === t ? (t === "meals" ? "bg-peach text-ink" : "bg-lavender text-ink") : "bg-card-elev text-text-muted hover:text-text")}>
              {t}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {tab === "meals" && (
        meals.length === 0
          ? <Card tone="card" radius="lg" padding="lg" className="text-center"><p className="text-[14px] text-text-muted">No meals logged.</p></Card>
          : (
            <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
              <ul role="list" className="divide-y divide-border">
                {meals.map((m) => (
                  <li key={m._id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-text">{m.name}</span>
                        <span className="text-[11px] text-text-muted">{m.time}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-[12px] text-text-muted">
                        <span>{m.calories} kcal</span><span>{m.protein}g protein</span>
                        <span>{m.carbs}g carbs</span><span>{m.fat}g fat</span>
                        <NutritionSourceBadge source={m.nutritionSource ?? undefined} confidence={m.confidence ?? undefined} verified={m.nutritionVerified ?? false} />
                      </div>
                      {m.aiSuggestion && <p className="text-[12px] italic text-text-subtle line-clamp-2">Stry: {m.aiSuggestion}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setEditMeal(m as EditableMeal)}
                        aria-label="Edit"
                        title="Edit"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-card-elev transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelogMeal(m._id as Id<"meals">, m.name)}
                        aria-label="Log again"
                        title="Log again today"
                        disabled={relogging === m._id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-subtle hover:text-lavender hover:bg-lavender/10 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteMeal(m._id as Id<"meals">)}
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
            </Card>
          )
      )}

      {tab === "workouts" && (
        workouts.length === 0
          ? <Card tone="card" radius="lg" padding="lg" className="text-center"><p className="text-[14px] text-text-muted">No workouts logged.</p></Card>
          : (
            <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
              <ul role="list" className="divide-y divide-border">
                {workouts.map((w) => (
                  <WorkoutRow key={w._id} w={w}
                    onEdit={() => setEditWorkout(w as EditableWorkout)}
                    onRelog={() => handleRelogWorkout(w._id as Id<"workouts">, w.name)}
                    onDelete={() => onDeleteWorkout(w._id as Id<"workouts">)}
                    relogging={relogging === w._id}
                  />
                ))}
              </ul>
            </Card>
          )
      )}

      <EditLogModal kind="meal" entry={editMeal} onClose={() => setEditMeal(null)} />
      <EditLogModal kind="workout" entry={editWorkout} onClose={() => setEditWorkout(null)} />
    </div>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Date>(new Date());
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);

  const now = new Date();
  const calendarData = useQuery(api.history.getCalendar, { year: now.getFullYear(), month: now.getMonth() + 1 }) ?? {};

  // Day summary from calendar data
  const dateStr = toDateStr(selected);
  const data = useQuery(api.history.getDayHistory, { date: dateStr }) as { meals?: any[]; workouts?: any[] } | undefined;
  const waterLogs = (useQuery(api.wellness.getWater, { date: dateStr }) ?? []) as any[];
  const sleepLog = useQuery(api.wellness.getSleep, { date: dateStr });
  const meals = data?.meals ?? [];
  const workouts = data?.workouts ?? [];

  const macros = useMemo(() => meals.reduce(
    (acc, m) => ({ kcal: acc.kcal + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  ), [meals]);

  const workoutMin = useMemo(() => workouts.reduce((s, w) => s + (w.duration ? parseInt(w.duration, 10) || 0 : 0), 0), [workouts]);

  const statCards = [
    { label: "Calories", value: Math.round(macros.kcal), unit: "", sub: `${Math.round(macros.protein)}p · ${Math.round(macros.carbs)}c · ${Math.round(macros.fat)}f`, tone: "bg-peach" },
    { label: "Workout", value: workoutMin, unit: "min", sub: `${workouts.length} session${workouts.length !== 1 ? "s" : ""}`, tone: "bg-lavender" },
    { label: "Sleep", value: sleepLog ? sleepLog.hours.toFixed(1) : "—", unit: sleepLog ? "h" : "", sub: sleepLog ? sleepLog.quality : "not logged", tone: "bg-sky" },
    { label: "Water", value: waterLogs.length > 0 ? (waterLogs.reduce((s, w) => s + w.ml, 0) / 1000).toFixed(1) : "—", unit: waterLogs.length > 0 ? "L" : "", sub: `${waterLogs.length} glass${waterLogs.length !== 1 ? "es" : ""}`, tone: "bg-mint" },
  ];

  return (
    <>
    <div className="lg:hidden px-5 pt-2 pb-6">
      <OverlayHeader title="History" back={() => navigate(-1)} />
      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)] mb-5">
        <CalendarGrid calendarData={calendarData} selected={selected} onSelect={setSelected} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {statCards.map((s) => (
          <div key={s.label} className={cn("rounded-[14px] px-3 py-2.5", s.tone)}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{s.label}</div>
            <div className="text-[20px] font-extrabold text-ink leading-none mt-0.5">
              {s.value}<span className="text-[11px] font-medium text-ink/70 ml-0.5">{s.unit}</span>
            </div>
            <div className="text-[10px] text-ink/60 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
      <DayDetail
        date={selected}
        onDeleteMeal={(id) => deleteMeal({ id })}
        onDeleteWorkout={(id) => deleteWorkout({ id })}
      />
    </div>

    <div className="hidden lg:block space-y-6 max-w-6xl mx-auto">
      <PageHeader center="History" right={<NavTrigger className="lg:hidden" />} />

      {/* Mobile: stacked. Desktop: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">

        {/* LEFT COLUMN: 2×2 stat grid + calendar */}
        <div className="space-y-3">
          {/* 2×2 stat grid */}
          <div className="grid grid-cols-2 gap-2">
            {statCards.map((s) => (
              <div key={s.label} className={cn("rounded-[14px] px-3 py-2.5", s.tone)}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{s.label}</div>
                <div className="text-[20px] font-extrabold text-ink leading-none mt-0.5">
                  {s.value}<span className="text-[11px] font-medium text-ink/70 ml-0.5">{s.unit}</span>
                </div>
                <div className="text-[10px] text-ink/60 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Calendar */}
          <Card tone="card" radius="lg" padding="sm">
            <CalendarGrid calendarData={calendarData} selected={selected} onSelect={setSelected} />
          </Card>
        </div>

        {/* RIGHT COLUMN: tab nav + detail list */}
        <DayDetail
          date={selected}
          onDeleteMeal={(id) => deleteMeal({ id })}
          onDeleteWorkout={(id) => deleteWorkout({ id })}
        />
      </div>
    </div>
    </>
  );
}

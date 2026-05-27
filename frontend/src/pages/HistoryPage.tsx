import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/primitives/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
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

/* ── Day cell ── */
function DayCell({ date, hasMeals, hasWorkouts, isSelected, isToday, onClick }: {
  date: Date; hasMeals: boolean; hasWorkouts: boolean;
  isSelected: boolean; isToday: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative aspect-square flex flex-col items-center justify-center rounded-[10px]",
        "transition-colors duration-150 focus-visible:outline-none",
        isSelected
          ? "bg-ink text-text-on-ink"
          : isToday
            ? "ring-1 ring-lavender text-text hover:bg-card-elev"
            : "text-text hover:bg-card-elev",
      )}
    >
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

/* ── Calendar grid ── */
function CalendarGrid({ calendarData, selected, onSelect }: {
  calendarData: Record<string, { meals: number; workouts: number; calories: number; burned: number }>;
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date(selected);
    d.setDate(1);
    return d;
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const grid = getMonthGrid(month.getFullYear(), month.getMonth());

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-card-elev hover:text-text transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <span className="text-[13px] font-semibold text-text">
          {month.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-card-elev hover:text-text transition-colors">
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAYS.map((d, i) => (
          <span key={i} className="text-center text-[10px] font-medium text-text-muted">{d}</span>
        ))}
      </div>
      <div className="space-y-0.5">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-0.5">
            {row.map((d, ci) => {
              if (!d) return <div key={`empty-${ri}-${ci}`} />;
              const key = toDateStr(d);
              const dayData = calendarData[key];
              return (
                <DayCell
                  key={key}
                  date={d}
                  hasMeals={(dayData?.meals ?? 0) > 0}
                  hasWorkouts={(dayData?.workouts ?? 0) > 0}
                  isSelected={isSameDay(d, selected)}
                  isToday={isSameDay(d, today)}
                  onClick={() => onSelect(d)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Day detail ── */
type Tab = "meals" | "workouts";

function DayDetail({ date, onDeleteMeal, onDeleteWorkout }: {
  date: Date;
  onDeleteMeal: (id: Id<"meals">) => void;
  onDeleteWorkout: (id: Id<"workouts">) => void;
}) {
  const [tab, setTab] = useState<Tab>("meals");
  const dateStr = toDateStr(date);
  const data = useQuery(api.history.getDayHistory, { date: dateStr });

  const meals = data?.meals ?? [];
  const workouts = data?.workouts ?? [];

  const macros = useMemo(() => meals.reduce(
    (acc, m) => ({ kcal: acc.kcal + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  ), [meals]);

  const workoutMin = useMemo(() =>
    workouts.reduce((s, w) => s + (w.duration ? parseInt(w.duration, 10) || 0 : 0), 0),
    [workouts],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-h2 text-text">{formatDate(date)}</h3>
        <span className="text-[13px] text-text-muted">{meals.length + workouts.length} entries</span>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[14px] bg-peach px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">Calories</div>
          <div className="text-[17px] font-extrabold text-ink leading-none mt-0.5">{Math.round(macros.kcal)}</div>
          <div className="text-[10px] text-ink/70 mt-0.5">{Math.round(macros.protein)}p · {Math.round(macros.carbs)}c · {Math.round(macros.fat)}f</div>
        </div>
        <div className="rounded-[14px] bg-lavender px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">Workout</div>
          <div className="text-[17px] font-extrabold text-ink leading-none mt-0.5">{workoutMin}<span className="text-[11px] text-ink/70 ml-0.5 font-medium">min</span></div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5">
        {(["meals", "workouts"] as Tab[]).map((t) => {
          const count = t === "meals" ? meals.length : workouts.length;
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors capitalize",
                tab === t ? (t === "meals" ? "bg-peach text-ink" : "bg-lavender text-ink") : "bg-card-elev text-text-muted hover:text-text",
              )}>
              {t}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "meals" && (
        meals.length === 0
          ? <Card tone="card" radius="lg" padding="lg" className="text-center"><p className="text-[14px] text-text-muted">No meals logged.</p></Card>
          : (
            <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
              <ul role="list" className="divide-y divide-border">
                {meals.map((m) => (
                  <li key={m._id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-text">{m.name}</span>
                        <span className="text-[11px] text-text-muted">{m.time}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-[12px] text-text-muted">
                        <span>{m.calories} kcal</span>
                        <span>{m.protein}g protein</span>
                        <span>{m.carbs}g carbs</span>
                        <span>{m.fat}g fat</span>
                      </div>
                      {m.aiSuggestion && <p className="text-[12px] italic text-text-subtle">Stry: {m.aiSuggestion}</p>}
                    </div>
                    <button type="button" onClick={() => onDeleteMeal(m._id as Id<"meals">)} aria-label="Delete"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum hover:bg-bubblegum/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
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
                  <li key={w._id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-[14px] font-semibold text-text">{w.name}</span>
                      <div className="flex flex-wrap gap-x-3 text-[12px] text-text-muted">
                        {w.duration && <span>{w.duration} min</span>}
                        <span className="capitalize">{w.intensity.toLowerCase()}</span>
                        {w.caloriesBurned != null && <span>{w.caloriesBurned} kcal burned</span>}
                      </div>
                      {w.rationale && <p className="text-[12px] italic text-text-subtle">Stry: {w.rationale}</p>}
                    </div>
                    <button type="button" onClick={() => onDeleteWorkout(w._id as Id<"workouts">)} aria-label="Delete"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum hover:bg-bubblegum/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )
      )}
    </div>
  );
}

export function HistoryPage() {
  const [selected, setSelected] = useState<Date>(new Date());
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);

  const now = new Date();
  const calendarData = useQuery(api.history.getCalendar, {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  }) ?? {};

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader center="History" />
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <Card tone="card" radius="lg" padding="sm">
          <CalendarGrid calendarData={calendarData} selected={selected} onSelect={setSelected} />
        </Card>
        <DayDetail
          date={selected}
          onDeleteMeal={(id) => deleteMeal({ id })}
          onDeleteWorkout={(id) => deleteWorkout({ id })}
        />
      </div>
    </div>
  );
}

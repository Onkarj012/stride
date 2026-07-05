import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Pencil, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { EditLogModal, type EditableWorkout } from "@/components/coach/EditLogModal";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { StatChip, WorkoutSessionCard } from "@/components/ui-kit";
import { ScreenHeader } from "@/components/mobile/MobileKit";
import { useToast } from "@/context/ToastContext";
import { localDateStr } from "@/lib/utils";

type StoredWorkoutSet = {
  weight?: string | number;
  reps?: string | number;
  duration_min?: string | number;
  incline?: string | number;
};

type StoredExercise = {
  name: string;
  weight_unit?: string;
  sets?: StoredWorkoutSet[];
};

type WorkoutRow = {
  _id: Id<"workouts">;
  name: string;
  sets: string;
  duration?: string | null;
  intensity: string;
  exercises?: unknown;
  rationale?: string | null;
  caloriesBurned?: number | null;
  structuredSets?: string | null;
};

function parseStoredExercises(w: { exercises?: unknown; structuredSets?: string | null }): StoredExercise[] {
  if (Array.isArray(w.exercises)) return w.exercises as StoredExercise[];

  for (const raw of [w.structuredSets, typeof w.exercises === "string" ? w.exercises : null]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as StoredExercise[];
    } catch {
      // Fall through to the next storage shape.
    }
  }

  return [];
}

function unitSuffix(unit?: string) {
  if (!unit || unit === "bodyweight") return "";
  if (unit === "machine_kg") return " kg";
  if (unit === "machine_lbs") return " lbs";
  return ` ${unit}`;
}

function formatWorkoutSet(set: StoredWorkoutSet, unit?: string) {
  if (set.duration_min != null) {
    const incline = set.incline != null && String(set.incline).trim() !== ""
      ? `${set.incline}% incline`
      : "";
    return { weight: `${set.duration_min} min`, reps: incline };
  }

  const weight = set.weight != null && String(set.weight).trim() !== ""
    ? `${set.weight}${unitSuffix(unit)}`
    : "—";
  const reps = set.reps != null && String(set.reps).trim() !== ""
    ? String(set.reps)
    : "—";
  return { weight, reps };
}

export function WorkoutsPage() {
  const navigate = useNavigate();
  const today = localDateStr();
  const workouts = (useQuery(api.workouts.getWorkouts, { date: today }) ?? []) as WorkoutRow[];
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);
  const toast = useToast();

  const [editEntry, setEditEntry] = useState<EditableWorkout | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"workouts"> | null>(null);

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const totalKcal = Math.round(workouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0));
  const totalSets = workouts.reduce((sum, workout) => {
    const exercises = parseStoredExercises(workout);
    if (exercises.length === 0) return sum;
    return sum + exercises.reduce((n, exercise) => n + (exercise.sets?.length ?? 0), 0);
  }, 0);
  const totalMin = workouts.reduce((s, w) => {
    const d = w.duration ? parseInt(w.duration, 10) : 0;
    return s + (isNaN(d) ? 0 : d);
  }, 0);

  async function handleDelete(id: Id<"workouts">) {
    try {
      await deleteWorkout({ id });
      toast.success("Workout removed");
    } catch {
      toast.error("Couldn't delete workout");
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <EditLogModal kind="workout" entry={editEntry} onClose={() => setEditEntry(null)} />

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDelete(null)}>
          <div className="rounded-[20px] bg-card p-5 max-w-sm w-full shadow-[var(--shadow-elev)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-bold text-text mb-1">Delete this workout?</p>
            <p className="text-[13px] text-text-muted mb-4">This can't be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" full onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button full onClick={() => void handleDelete(confirmDelete)}
                className="bg-bubblegum text-white hover:opacity-90">
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="lg:hidden px-5 pt-4 pb-6">
        <ScreenHeader title="Workouts" sub="Today's session" />
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="bg-ink dark:bg-lavender text-white dark:text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold">{workouts.length} sessions</span>
          {totalSets > 0 && <span className="bg-sky text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tabular-nums">{totalSets} sets</span>}
          <span className="bg-peach text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tabular-nums">{totalKcal} kcal</span>
          <span className="bg-mint text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tabular-nums">{totalMin} min</span>
        </div>
        {workouts.length === 0 ? (
          <div className="rounded-[20px] bg-mint-soft border border-mint/20 p-6 text-center">
            <p className="text-[15px] font-bold text-text mb-1">No workouts logged today</p>
            <p className="text-[13px] text-text-muted">Tell Stry what you did and it will log it.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workouts.map((w) => {
              const durationNum = w.duration ? parseInt(w.duration, 10) : 0;
              const exerciseList = parseStoredExercises(w);
              return (
                <WorkoutSessionCard
                  key={w._id}
                  session={{
                    title: w.name,
                    date: `Logged via chat · ${w.intensity} intensity`,
                    durationMin: durationNum,
                    burnKcal: w.caloriesBurned ?? 0,
                    exercises: exerciseList.length > 0
                      ? exerciseList.map((ex) => ({
                        name: ex.name,
                        sets: (ex.sets && ex.sets.length > 0 ? ex.sets : [{}]).map((set) => formatWorkoutSet(set, ex.weight_unit)),
                      }))
                      : [{ name: w.name, sets: [{ weight: durationNum > 0 ? `${durationNum} min` : w.intensity, reps: "" }] }],
                  }}
                />
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate("/coach")}
          className="w-full mt-4 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border py-3 text-[13px] font-bold text-text-muted active:bg-card transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Log a workout
        </button>
      </div>

      <div className="hidden lg:block max-w-3xl lg:max-w-4xl mx-auto">
        <PageHeader
          left={
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-text">Workouts</h1>
              <p className="text-[11.5px] text-text-muted mt-0.5">{todayLabel}</p>
            </div>
          }
          right={
            <div className="flex items-center gap-2">
              <NavTrigger className="lg:hidden" />
            </div>
          }
        />

        {/* Summary strip */}
        {workouts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {totalMin > 0 && (
              <StatChip className="flex-1" label="Total time" value={String(totalMin)} unit="min" color="mint" />
            )}
            {totalKcal > 0 && (
              <StatChip className="flex-1" label="kcal burned" value={`~${totalKcal}`} color="peach" />
            )}
            <StatChip className="flex-1" label={`Session${workouts.length !== 1 ? "s" : ""}`} value={String(workouts.length)} color="lavender" />
          </div>
        )}

        {workouts.length === 0 ? (
          <div className="rounded-[20px] bg-mint-soft border border-mint/20 p-6 text-center">
            <p className="text-[15px] font-bold text-text mb-1">No workouts logged today</p>
            <p className="text-[13px] text-text-muted">Tell Stride what you did and it will log it.</p>
          </div>
        ) : (
          workouts.map((w) => {
            const durationNum = w.duration ? parseInt(w.duration, 10) : 0;
            const exerciseList = parseStoredExercises(w);
            const hasExercises = exerciseList.length > 0;

            return (
              <div key={w._id} className="group relative mb-3">
                {/* Controls — floating, desktop hover, always visible on mobile */}
                <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditEntry({ _id: w._id, name: w.name, intensity: w.intensity ?? "medium", duration: w.duration, caloriesBurned: w.caloriesBurned, rationale: w.rationale, sets: w.sets })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card-elev text-text-muted hover:text-text transition-colors shadow-[var(--shadow-elev)]"
                    aria-label="Edit workout"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(w._id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card-elev text-text-muted hover:text-bubblegum transition-colors shadow-[var(--shadow-elev)]"
                    aria-label="Delete workout"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>

                {hasExercises ? (
                  <WorkoutSessionCard
                    session={{
                      title: w.name,
                      date: `Logged via chat · ${w.intensity} intensity`,
                      durationMin: durationNum,
                      burnKcal: w.caloriesBurned ?? 0,
                      exercises: exerciseList.map((ex) => ({
                        name: ex.name,
                        sets: (ex.sets && ex.sets.length > 0 ? ex.sets : [{}]).map((set) =>
                          formatWorkoutSet(set, ex.weight_unit),
                        ),
                      })),
                    }}
                  />
                ) : (
                  <Card tone="card" radius="lg" padding="md" className="border border-border shadow-[var(--shadow-soft)]">
                    <div className="flex justify-between items-start mb-3 pr-16">
                      <div>
                        <h2 className="text-[19px] font-extrabold tracking-tight text-text">{w.name}</h2>
                        <p className="text-[11.5px] text-text-muted mt-1">Logged via chat · {durationNum > 0 ? `${durationNum} min` : w.intensity}</p>
                      </div>
                      <div className="flex items-center gap-1.5 bg-lavender/15 rounded-full px-3 py-1 shrink-0">
                        <svg width="9" height="9" viewBox="0 0 12 12" className="text-lavender"><path d="M2.5 6.5l2.4 2.4 4.6-5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        <span className="text-[11px] font-bold text-lavender">Done</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {durationNum > 0 && (
                        <StatChip className="flex-1" label="Duration" value={String(durationNum)} unit="min" color="sky" />
                      )}
                      {!!w.caloriesBurned && w.caloriesBurned > 0 && (
                        <StatChip className="flex-1" label="kcal burned" value={`~${w.caloriesBurned}`} color="peach" />
                      )}
                      <StatChip className="flex-1 capitalize" label="Intensity" value={w.intensity} color="lavender" />
                    </div>
                  </Card>
                )}
              </div>
            );
          })
        )}

        {/* Log workout button */}
        <button
          type="button"
          onClick={() => navigate("/?log=workout")}
          className="w-full mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border py-3 text-[13px] font-bold text-text-muted hover:bg-card transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Log a workout
        </button>
      </div>
    </>
  );
}

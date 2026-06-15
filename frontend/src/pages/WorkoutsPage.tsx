import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Pencil, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { EditLogModal, type EditableWorkout } from "@/components/coach/EditLogModal";
import { useToast } from "@/context/ToastContext";
import { localDateStr } from "@/lib/utils";

export function WorkoutsPage() {
  const navigate = useNavigate();
  const today = localDateStr();
  const workouts = useQuery(api.workouts.getWorkouts, { date: today }) ?? [];
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);
  const toast = useToast();

  const [editEntry, setEditEntry] = useState<EditableWorkout | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"workouts"> | null>(null);

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const totalKcal = Math.round(workouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0));
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
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-full border border-border py-2.5 text-[13px] font-bold text-text-muted hover:bg-card-elev transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => void handleDelete(confirmDelete)}
                className="flex-1 rounded-full bg-bubblegum py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl lg:max-w-4xl mx-auto">
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
          <div className="flex gap-2 mb-4">
            {totalMin > 0 && (
              <div className="flex-1 rounded-[14px] bg-mint-soft px-3 py-2.5">
                <div className="text-[15px] font-extrabold text-text">{totalMin} min</div>
                <div className="text-[10px] font-semibold text-text-muted mt-0.5">Total time</div>
              </div>
            )}
            {totalKcal > 0 && (
              <div className="flex-1 rounded-[14px] bg-peach-soft px-3 py-2.5">
                <div className="text-[15px] font-extrabold text-text">~{totalKcal}</div>
                <div className="text-[10px] font-semibold text-text-muted mt-0.5">kcal burned</div>
              </div>
            )}
            <div className="flex-1 rounded-[14px] bg-lavender-soft px-3 py-2.5">
              <div className="text-[15px] font-extrabold text-text">{workouts.length}</div>
              <div className="text-[10px] font-semibold text-text-muted mt-0.5">Session{workouts.length !== 1 ? "s" : ""}</div>
            </div>
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
            let exerciseList: Array<{ name: string; sets?: number; reps?: number; weight?: number }> = [];
            try { exerciseList = w.exercises ? JSON.parse(w.exercises as string) : []; } catch {}

            return (
              <div key={w._id} className="group rounded-[20px] bg-card border border-border p-4 mb-3 relative shadow-[var(--shadow-soft)]">
                {/* Controls — desktop hover, always visible on mobile */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditEntry({ _id: w._id, name: w.name, intensity: w.intensity ?? "medium", duration: w.duration, caloriesBurned: w.caloriesBurned, rationale: w.rationale, sets: w.sets })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card-elev text-text-muted hover:text-text transition-colors"
                    aria-label="Edit workout"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(w._id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card-elev text-text-muted hover:text-bubblegum transition-colors"
                    aria-label="Delete workout"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>

                {/* Hero header */}
                <div className="flex justify-between items-start mb-3 pr-20">
                  <div>
                    <h2 className="text-[19px] font-extrabold tracking-tight text-text">{w.name}</h2>
                    <p className="text-[11.5px] text-text-muted mt-1">Logged via chat · {durationNum > 0 ? `${durationNum} min` : w.intensity}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-lavender/15 rounded-full px-3 py-1 shrink-0">
                    <svg width="9" height="9" viewBox="0 0 12 12" className="text-lavender"><path d="M2.5 6.5l2.4 2.4 4.6-5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    <span className="text-[11px] font-bold text-lavender">Done</span>
                  </div>
                </div>

                {/* Stat chips */}
                <div className="flex gap-2 mb-3">
                  {durationNum > 0 && (
                    <div className="flex-1 rounded-[12px] bg-card-elev px-3 py-2">
                      <div className="text-[14.5px] font-extrabold text-text">{durationNum} min</div>
                      <div className="text-[10px] text-text-muted font-semibold mt-0.5">Duration</div>
                    </div>
                  )}
                  {!!w.caloriesBurned && w.caloriesBurned > 0 && (
                    <div className="flex-1 rounded-[12px] bg-card-elev px-3 py-2">
                      <div className="text-[14.5px] font-extrabold text-text">~{w.caloriesBurned}</div>
                      <div className="text-[10px] text-text-muted font-semibold mt-0.5">kcal burned</div>
                    </div>
                  )}
                  {exerciseList.length > 0 && (
                    <div className="flex-1 rounded-[12px] bg-card-elev px-3 py-2">
                      <div className="text-[14.5px] font-extrabold text-text">{exerciseList.length}</div>
                      <div className="text-[10px] text-text-muted font-semibold mt-0.5">Exercises</div>
                    </div>
                  )}
                  <div className="flex-1 rounded-[12px] bg-card-elev px-3 py-2">
                    <div className="text-[14.5px] font-extrabold text-text capitalize">{w.intensity}</div>
                    <div className="text-[10px] text-text-muted font-semibold mt-0.5">Intensity</div>
                  </div>
                </div>

                {/* Exercise list */}
                {exerciseList.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {exerciseList.map((ex, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-card rounded-[13px] shadow-[0_2px_10px_rgba(13,16,27,0.06)]">
                        <div className="w-[27px] h-[27px] rounded-[9px] bg-input flex items-center justify-center text-[11px] font-extrabold text-text-muted shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-text">{ex.name}</div>
                          {(ex.weight || ex.sets) && (
                            <div className="text-[11px] text-text-muted mt-0.5">
                              {ex.weight ? `${ex.weight} kg · ` : ""}{ex.sets ? `${ex.sets} sets` : ""}
                            </div>
                          )}
                        </div>
                        {ex.sets && ex.reps && (
                          <span className="text-[12px] font-extrabold text-text-muted shrink-0">{ex.sets} × {ex.reps}</span>
                        )}
                      </div>
                    ))}
                  </div>
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

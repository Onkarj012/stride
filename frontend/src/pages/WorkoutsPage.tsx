import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { localDateStr } from "@/lib/utils";

export function WorkoutsPage() {
  const today = localDateStr();
  const workouts = useQuery(api.workouts.getWorkouts, { date: today }) ?? [];
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const totalKcal = Math.round(workouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0));
  const totalMin = workouts.reduce((s, w) => {
    const d = w.duration ? parseInt(w.duration, 10) : 0;
    return s + (isNaN(d) ? 0 : d);
  }, 0);
  const totalExercises = workouts.reduce((s, w) => {
    try { return s + (w.exercises ? JSON.parse(w.exercises as string).length : 1); } catch { return s + 1; }
  }, 0);

  return (
    <div className="max-w-2xl mx-auto">
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

      {workouts.length === 0 ? (
        <div className="rounded-[20px] bg-mint-soft border border-mint/20 p-6 text-center">
          <p className="text-[15px] font-bold text-text mb-1">No workouts logged today</p>
          <p className="text-[13px] text-text-muted">Tell Stride what you did and it will log it.</p>
        </div>
      ) : (
        workouts.map((w, idx) => {
          const durationNum = w.duration ? parseInt(w.duration, 10) : 0;
          let exerciseList: Array<{ name: string; sets?: number; reps?: number; weight?: number }> = [];
          try {
            exerciseList = w.exercises ? JSON.parse(w.exercises as string) : [];
          } catch {}

          return (
            <div key={idx} className="rounded-[20px] bg-mint-soft p-4 mb-3">
              {/* Hero header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-[19px] font-extrabold tracking-tight text-text">{w.name}</h2>
                  <p className="text-[11.5px] text-text-muted mt-1">Logged via chat · {durationNum > 0 ? `${durationNum} min` : w.intensity}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-mint rounded-full px-3 py-1">
                  <svg width="9" height="9" viewBox="0 0 12 12"><path d="M2.5 6.5l2.4 2.4 4.6-5.3" stroke="#3D9A57" strokeWidth="2" strokeLinecap="round"/></svg>
                  <span className="text-[11px] font-bold text-[#3D9A57]">Done</span>
                </div>
              </div>

              {/* Stat chips */}
              <div className="flex gap-2 mb-3">
                {durationNum > 0 && (
                  <div className="flex-1 rounded-[12px] bg-white/65 px-3 py-2">
                    <div className="text-[14.5px] font-extrabold text-text">{durationNum} min</div>
                    <div className="text-[10px] text-text-muted font-semibold mt-0.5">Duration</div>
                  </div>
                )}
                {w.caloriesBurned && w.caloriesBurned > 0 && (
                  <div className="flex-1 rounded-[12px] bg-white/65 px-3 py-2">
                    <div className="text-[14.5px] font-extrabold text-text">~{w.caloriesBurned}</div>
                    <div className="text-[10px] text-text-muted font-semibold mt-0.5">kcal burned</div>
                  </div>
                )}
                {exerciseList.length > 0 && (
                  <div className="flex-1 rounded-[12px] bg-white/65 px-3 py-2">
                    <div className="text-[14.5px] font-extrabold text-text">{exerciseList.length}</div>
                    <div className="text-[10px] text-text-muted font-semibold mt-0.5">Exercises</div>
                  </div>
                )}
                <div className="flex-1 rounded-[12px] bg-white/65 px-3 py-2">
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
                      <div className="flex-1">
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
        className="w-full mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border py-3 text-[13px] font-bold text-text-muted hover:bg-card transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Log a workout
      </button>
    </div>
  );
}

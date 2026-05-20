import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dumbbell,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Repeat,
  Sparkles,
  Save,
  Loader2,
  Play,
  Flame,
} from "lucide-react";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { ConfirmLogCard } from "../ConfirmLogCard";
import { VoiceInputButton } from "../VoiceInputButton";
import { LiveWorkout } from "../LiveWorkout";
import { SkeletonCard } from "../ui/AnimatedComponents";
import CustomSelect from "../ui/CustomSelect";
import { springs } from "../../lib/animations";

interface WorkoutsTabProps {
  workouts: any[];
  workoutsLoading: boolean;
  onCommitWorkout: (data: any, date?: string) => Promise<void>;
  onDeleteWorkout: (id: Id<"workouts">) => Promise<void>;
  onUpdateWorkout: (id: Id<"workouts">, data: any) => Promise<void>;
  onGetWorkoutSuggestion: () => Promise<void>;
  onLiveWorkoutFinish: (data: any) => Promise<void>;
  workoutSuggestion: any;
  suggestionLoading: boolean;
}

export default function WorkoutsTab({
  workouts,
  workoutsLoading,
  onCommitWorkout,
  onDeleteWorkout,
  onUpdateWorkout,
  onGetWorkoutSuggestion,
  onLiveWorkoutFinish,
  workoutSuggestion,
  suggestionLoading,
}: WorkoutsTabProps) {
  const [workoutForm, setWorkoutForm] = useState({ description: "", duration: "", intensity: "HIGH" });
  const [workoutError, setWorkoutError] = useState<string | null>(null);
  const [workoutConfirm, setWorkoutConfirm] = useState<{ initialData: any } | null>(null);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editWorkoutForm, setEditWorkoutForm] = useState<any>(null);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [logAgainWorkout, setLogAgainWorkout] = useState<any | null>(null);
  const [liveWorkoutMode, setLiveWorkoutMode] = useState(false);

  const handleUpdateWorkout = async (id: Id<"workouts">) => {
    if (!editWorkoutForm) return;
    try {
      await onUpdateWorkout(id, editWorkoutForm);
      setEditingWorkoutId(null);
      setEditWorkoutForm(null);
    } catch {}
  };

  const handleLiveWorkoutFinish = async (data: any) => {
    await onLiveWorkoutFinish(data);
    setLiveWorkoutMode(false);
  };

  return (
    <motion.div
      key="workout-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 will-change-transform"
      data-testid="workout-tab"
    >
      <PageHeader title="Training Log" subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      {workoutConfirm ? (
        <ConfirmLogCard
          mode="workout"
          initialData={workoutConfirm.initialData}
          onConfirm={async (data) => {
            await onCommitWorkout(data);
            setWorkoutConfirm(null);
            setWorkoutForm({ description: "", duration: "", intensity: "HIGH" });
          }}
          onDiscard={() => setWorkoutConfirm(null)}
        />
      ) : (
        <Card className="p-6">
          <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">Log Workout</h3>
          <div className="space-y-4">
            <div className="relative">
              <textarea
                placeholder="Describe your workout — exercises, sets, reps, weights..."
                value={workoutForm.description}
                onChange={(e) => setWorkoutForm({ ...workoutForm, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 pr-12 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed"
              />
              <VoiceInputButton
                value={workoutForm.description}
                onChange={(text) => setWorkoutForm({ ...workoutForm, description: text })}
                className="absolute bottom-3 right-3"
              />
            </div>
            <div className="flex gap-3">
              <input
                placeholder="Duration (e.g. 45 min)"
                value={workoutForm.duration}
                onChange={(e) => setWorkoutForm({ ...workoutForm, duration: e.target.value })}
                className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
              />
              <div className="w-48">
                <CustomSelect
                  value={workoutForm.intensity}
                  onChange={(val) => setWorkoutForm({ ...workoutForm, intensity: val })}
                  options={[
                    { value: "LOW", label: "LOW", description: "Light activity, easy pace" },
                    { value: "MEDIUM", label: "MEDIUM", description: "Moderate effort, breaking a sweat" },
                    { value: "HIGH", label: "HIGH", description: "Hard effort, heavy breathing" },
                    { value: "MAX", label: "MAX", description: "All-out intensity, failure reps" },
                  ]}
                  placeholder="Intensity"
                />
              </div>
            </div>
            {workoutError && <div className="text-xs font-mono text-red-400 tracking-wide">{workoutError}</div>}
            <button
              onClick={() => {
                if (!workoutForm.description.trim()) {
                  setWorkoutError("DESCRIPTION REQUIRED");
                  return;
                }
                setWorkoutError(null);
                setWorkoutConfirm({
                  initialData: {
                    description: workoutForm.description,
                    duration: workoutForm.duration,
                    intensity: workoutForm.intensity,
                  },
                });
              }}
              disabled={!workoutForm.description.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles size={16} />
              Log Workout
            </button>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)]">Workout Suggestion</h3>
          <button
            onClick={onGetWorkoutSuggestion}
            disabled={suggestionLoading}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
          >
            {suggestionLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            SUGGEST
          </button>
        </div>
        {workoutSuggestion ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-[10px] font-mono px-2 py-1 ${workoutSuggestion.intensity === "MAX" ? "bg-red-600 text-white" : workoutSuggestion.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{workoutSuggestion.intensity}</span>
              <h4 className="font-heading text-lg uppercase tracking-normal">{workoutSuggestion.name}</h4>
              <span className="text-xs font-mono text-[var(--text-muted)] tracking-wide">{workoutSuggestion.duration}</span>
              {workoutSuggestion.caloriesBurned > 0 && (
                <span className="text-xs font-mono text-accent tracking-wide">~{workoutSuggestion.caloriesBurned} kcal</span>
              )}
            </div>
            {workoutSuggestion.exercises && workoutSuggestion.exercises.length > 0 && (
              <div className="space-y-2">
                {workoutSuggestion.exercises.map((ex: any, ei: number) => (
                  <div key={ei} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="font-mono text-sm tracking-wide mb-1">{ex.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {ex.sets.map((s: any, si: number) => (
                        <span key={si} className="text-xs font-mono bg-[var(--bg-main)] border border-[var(--border-default)] px-2 py-1">
                          {s.weight ? `${s.weight} x ` : ""}{s.reps}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {workoutSuggestion.rationale && (
              <p className="text-xs text-[var(--text-muted)] tracking-wide italic">{workoutSuggestion.rationale}</p>
            )}
          </div>
        ) : (
          <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">Click SUGGEST to get a workout recommendation based on your recent training.</div>
        )}
      </Card>

      <AnimatePresence mode="wait">
        {liveWorkoutMode ? (
          <LiveWorkout
            key="live-workout"
            onFinish={handleLiveWorkoutFinish}
            onCancel={() => setLiveWorkoutMode(false)}
          />
        ) : (
          <motion.button
            key="start-workout"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={springs.snappy}
            onClick={() => setLiveWorkoutMode(true)}
            className="w-full py-4 border-2 border-dashed border-accent text-accent font-mono text-xs uppercase tracking-wider font-bold hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors flex items-center justify-center gap-2"
          >
            <Play size={16} /> START LIVE WORKOUT
          </motion.button>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {workoutsLoading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <SkeletonCard lines={2} />
          </motion.div>
        ) : workouts.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={springs.smooth}>
            <Card className="p-8 text-center border-dashed">
              <Dumbbell size={32} className="mx-auto mb-3 text-[var(--text-muted)] opacity-50" />
              <div className="font-mono text-sm text-[var(--text-muted)] tracking-wide">NO WORKOUTS LOGGED TODAY</div>
            </Card>
          </motion.div>
        ) : null}
        {workouts.map((w: any, idx: number) => (
          <motion.div
            key={w._id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, ...springs.snappy }}
          >
            <Card className="p-5 hover:border-accent transition-colors group" data-testid={`workout-${w._id}`}>
            {editingWorkoutId === w._id && editWorkoutForm ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase text-accent tracking-wider">EDIT WORKOUT</span>
                  <button onClick={() => { setEditingWorkoutId(null); setEditWorkoutForm(null); }} className="p-1 hover:text-red-400"><X size={14} /></button>
                </div>
                <div className="flex gap-3">
                  <input value={editWorkoutForm.name} onChange={(e) => setEditWorkoutForm({ ...editWorkoutForm, name: e.target.value })} className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Name" />
                  <input value={editWorkoutForm.duration} onChange={(e) => setEditWorkoutForm({ ...editWorkoutForm, duration: e.target.value })} className="w-28 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Duration" />
                  <select value={editWorkoutForm.intensity} onChange={(e) => setEditWorkoutForm({ ...editWorkoutForm, intensity: e.target.value })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent">
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MAX">MAX</option>
                  </select>
                </div>
                <button onClick={() => handleUpdateWorkout(w._id)} className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
                  <Save size={12} /> SAVE
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className={`text-[10px] font-mono px-2 py-1 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{w.intensity}</span>
                      <h3 className="text-lg font-heading uppercase tracking-normal">{w.name}</h3>
                      {w.duration && <span className="text-xs font-mono text-[var(--text-muted)] tracking-wide">{w.duration}</span>}
                      {w.caloriesBurned !== undefined && w.caloriesBurned !== null && (
                        <span className="text-xs font-mono text-accent tracking-wide">{w.caloriesBurned} KCAL</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <div className="flex items-center gap-1 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[100px]">
                      <button
                        onClick={() => {
                          setEditingWorkoutId(w._id);
                          setEditWorkoutForm({
                            name: w.name,
                            sets: w.sets,
                            duration: w.duration || '',
                            intensity: w.intensity,
                            exercises: w.exercises || null,
                            rationale: w.rationale || null,
                          });
                        }}
                        className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setLogAgainWorkout(w)}
                        className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                        title="Log again"
                      >
                        <Repeat size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => setExpandedWorkoutId(expandedWorkoutId === w._id ? null : w._id)}
                      className="p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                      title="Details"
                    >
                      {expandedWorkoutId === w._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => onDeleteWorkout(w._id)} className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {expandedWorkoutId === w._id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-3 pt-3 border-t border-[var(--border-default)] space-y-2">
                        {w.rationale && (
                          <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                            <div className="text-[10px] font-mono uppercase text-accent tracking-wider mb-1">AI Note</div>
                            <p className="text-sm text-[var(--text-secondary)] tracking-wide">{w.rationale}</p>
                          </div>
                        )}
                        {w.exercises && w.exercises.length > 0 && (
                          <div className="space-y-2">
                            {w.exercises.map((ex: any, ei: number) => (
                              <div key={ei} className="p-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="font-mono text-sm tracking-wide mb-1">{ex.name}</div>
                                <div className="flex flex-wrap gap-2">
                                  {ex.sets.map((s: any, si: number) => (
                                    <span key={si} className="text-xs font-mono bg-[var(--bg-main)] border border-[var(--border-default)] px-2 py-1">{s.weight ? `${s.weight} \u00D7 ` : ''}{s.reps}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {!w.rationale && (!w.exercises || w.exercises.length === 0) && (
                          <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">No detailed breakdown available.</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
            </Card>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {logAgainWorkout && (
          <ConfirmLogCard
            mode="workout"
            initialData={{ description: logAgainWorkout.name }}
            preParsed={{
              name: logAgainWorkout.name,
              sets: logAgainWorkout.sets,
              duration: logAgainWorkout.duration,
              intensity: logAgainWorkout.intensity,
              rationale: logAgainWorkout.rationale,
              exercises: logAgainWorkout.exercises,
            }}
            onConfirm={async (data) => { await onCommitWorkout(data); setLogAgainWorkout(null); }}
            onDiscard={() => setLogAgainWorkout(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, Flame, Dumbbell } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useToast } from "@/context/ToastContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const;

export type EditableMeal = {
  _id: Id<"meals">;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
  mealType?: string | null;
  aiSuggestion?: string | null;
  components?: string | null;
};

export type EditableWorkout = {
  _id: Id<"workouts">;
  name: string;
  intensity: string;
  duration?: string | null;
  caloriesBurned?: number | null;
  rationale?: string | null;
  sets?: string | null;
};

type Props =
  | { kind: "meal"; entry: EditableMeal | null; onClose: () => void }
  | { kind: "workout"; entry: EditableWorkout | null; onClose: () => void };

/**
 * EditLogModal — edit an already-logged meal or workout in place.
 *
 * Backed by api.meals.updateMeal / api.workouts.updateWorkout. Used from the
 * Insights and History pages so a user who notices a mistake (wrong calories,
 * misclassified meal type, etc.) can correct it without re-logging.
 */
export function EditLogModal(props: Props) {
  const isLarge = useMediaQuery("(min-width: 768px)");
  const toast = useToast();
  const updateMeal = useMutation(api.meals.updateMeal);
  const updateWorkout = useMutation(api.workouts.updateWorkout);

  const open = props.entry !== null;

  // Local form state, reset whenever the entry changes
  const [mealForm, setMealForm] = useState<EditableMeal | null>(null);
  const [workoutForm, setWorkoutForm] = useState<EditableWorkout | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (props.kind === "meal") {
      setMealForm(props.entry ? { ...props.entry } : null);
    } else {
      setWorkoutForm(props.entry ? { ...props.entry } : null);
    }
  }, [props.kind, props.entry]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (typeof document === "undefined") return null;

  async function handleSave() {
    setSaving(true);
    try {
      if (props.kind === "meal" && mealForm) {
        await updateMeal({
          id: mealForm._id,
          name: mealForm.name,
          calories: Math.max(0, Math.round(mealForm.calories)),
          protein: Math.max(0, Math.round(mealForm.protein * 10) / 10),
          carbs: Math.max(0, Math.round(mealForm.carbs * 10) / 10),
          fat: Math.max(0, Math.round(mealForm.fat * 10) / 10),
          time: mealForm.time || "12:00",
          mealType: mealForm.mealType ?? "unspecified",
          aiSuggestion: mealForm.aiSuggestion ?? null,
          components: mealForm.components ?? null,
        });
        toast.success("Meal updated", mealForm.name);
      } else if (props.kind === "workout" && workoutForm) {
        await updateWorkout({
          id: workoutForm._id,
          name: workoutForm.name,
          sets: workoutForm.sets ?? "1",
          duration: workoutForm.duration ?? undefined,
          intensity: workoutForm.intensity || "MEDIUM",
          caloriesBurned: workoutForm.caloriesBurned ?? undefined,
          rationale: workoutForm.rationale ?? undefined,
        });
        toast.success("Workout updated", workoutForm.name);
      }
      props.onClose();
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="edit-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={props.onClose}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/45 backdrop-blur-sm"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            key="edit-card"
            onClick={(e) => e.stopPropagation()}
            initial={isLarge ? { opacity: 0, scale: 0.94, y: 8 } : { y: "100%" }}
            animate={isLarge ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={isLarge ? { opacity: 0, scale: 0.95, y: 4 } : { y: "100%" }}
            transition={SPRING}
            className="w-full md:max-w-md rounded-[20px] rounded-bl-[6px] bg-card border border-border overflow-hidden shadow-[var(--shadow-elev)]"
          >
            {/* Header */}
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 border-b border-border",
              props.kind === "meal" ? "bg-peach/10" : "bg-lavender/10",
            )}>
              {props.kind === "meal" ? (
                <Flame className="h-4 w-4 text-peach" strokeWidth={2} />
              ) : (
                <Dumbbell className="h-4 w-4 text-lavender" strokeWidth={2} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-text">
                  Edit {props.kind === "meal" ? "meal" : "workout"}
                </p>
                <p className="text-[11px] text-text-muted">
                  Fix any mistake. Insights update on the next refresh.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {props.kind === "meal" && mealForm && (
                <>
                  <Field label="Name">
                    <input
                      type="text"
                      value={mealForm.name}
                      onChange={(e) => setMealForm({ ...mealForm, name: e.target.value })}
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                    />
                  </Field>
                  <div className="grid grid-cols-4 gap-2">
                    <NumField label="Calories" unit="kcal" value={mealForm.calories} onChange={(v) => setMealForm({ ...mealForm, calories: v })} />
                    <NumField label="Protein" unit="g" value={mealForm.protein} onChange={(v) => setMealForm({ ...mealForm, protein: v })} />
                    <NumField label="Carbs" unit="g" value={mealForm.carbs} onChange={(v) => setMealForm({ ...mealForm, carbs: v })} />
                    <NumField label="Fat" unit="g" value={mealForm.fat} onChange={(v) => setMealForm({ ...mealForm, fat: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Time">
                      <input
                        type="time"
                        value={mealForm.time}
                        onChange={(e) => setMealForm({ ...mealForm, time: e.target.value })}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                      />
                    </Field>
                    <Field label="Meal type">
                      <select
                        value={mealForm.mealType ?? "unspecified"}
                        onChange={(e) => setMealForm({ ...mealForm, mealType: e.target.value })}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                      >
                        <option value="unspecified">Unspecified</option>
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                        <option value="snack">Snack</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              {props.kind === "workout" && workoutForm && (
                <>
                  <Field label="Name">
                    <input
                      type="text"
                      value={workoutForm.name}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, name: e.target.value })}
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Duration (min)">
                      <input
                        type="number"
                        value={workoutForm.duration ? parseInt(workoutForm.duration, 10) || 0 : 0}
                        onChange={(e) => setWorkoutForm({ ...workoutForm, duration: String(Number(e.target.value)) })}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                      />
                    </Field>
                    <Field label="Calories burned">
                      <input
                        type="number"
                        value={workoutForm.caloriesBurned ?? 0}
                        onChange={(e) => setWorkoutForm({ ...workoutForm, caloriesBurned: Number(e.target.value) })}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                      />
                    </Field>
                    <Field label="Intensity">
                      <select
                        value={workoutForm.intensity}
                        onChange={(e) => setWorkoutForm({ ...workoutForm, intensity: e.target.value })}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="MAX">Max</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 px-4 pb-4">
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={saving}
                onClick={handleSave}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink py-2.5 text-[13px] font-bold disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                {saving ? "Saving…" : "Save"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={props.onClose}
                className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border text-text-muted hover:text-text transition-colors"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function NumField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-input border border-border rounded-lg px-2 py-2 text-center text-[15px] font-bold text-text focus:outline-none focus:border-lavender"
      />
      <span className="text-[10px] text-text-muted text-center">{unit}</span>
    </div>
  );
}

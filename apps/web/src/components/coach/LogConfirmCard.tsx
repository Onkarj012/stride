import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, X, Pencil, Flame, Dumbbell, Footprints, Zap, Moon, Droplets, Smile, Activity } from "lucide-react";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
import { cn } from "@/lib/utils";
import { NutritionSourceBadge } from "@/components/ui-kit/NutritionSourceBadge";

type SleepDraft = { kind: "sleep"; description: string; hours: number; quality: "poor"|"ok"|"good"|"great" };
type WaterDraft = { kind: "water"; description: string; ml: number };
type MoodDraft = { kind: "mood"; description: string; rating: 1|2|3|4|5 };
type StepsDraft = { kind: "steps"; description: string; count: number };
type AnyDraft = LogDraft | SleepDraft | WaterDraft | MoodDraft | StepsDraft;

type Props = {
  draft: AnyDraft;
  onConfirm: (draft: AnyDraft) => void;
  onDiscard: () => void;
};

const SPRING = { type: "spring", stiffness: 280, damping: 26 } as const;

const INTENSITY_COLOR: Record<string, string> = {
  light: "text-mint",
  medium: "text-peach",
  high: "text-bubblegum",
};

function unitSuffix(unit?: string) {
  if (!unit || unit === "bodyweight") return "";
  if (unit === "machine_kg") return " kg";
  if (unit === "machine_lbs") return " lbs";
  return ` ${unit}`;
}

function formatExerciseSet(set: Record<string, unknown>, unit?: string) {
  const duration = set.duration_min != null && String(set.duration_min).trim() !== ""
    ? `${set.duration_min} min`
    : "";
  if (duration) {
    const incline = set.incline != null && String(set.incline).trim() !== ""
      ? ` · ${set.incline}% incline`
      : "";
    return `${duration}${incline}`;
  }

  const weight = set.weight != null && String(set.weight).trim() !== ""
    ? `${set.weight}${unitSuffix(unit)}`
    : "—";
  const reps = set.reps != null && String(set.reps).trim() !== ""
    ? `${set.reps} reps`
    : "";
  return reps ? `${weight} × ${reps}` : weight;
}

/* ── Editable number field ── */
function NumField({
  label,
  value,
  unit,
  editing,
  onChange,
  color = "text-text",
}: {
  label: string;
  value: number;
  unit: string;
  editing: boolean;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {editing ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 text-center text-[18px] font-extrabold bg-input border border-border rounded-lg py-0.5 text-text focus:outline-none focus:border-lavender"
        />
      ) : (
        <span className={cn("text-[22px] font-extrabold leading-none", color)}>{value}</span>
      )}
      <span className="text-[11px] text-text-muted">{unit}</span>
    </div>
  );
}

/* ── Meal card ── */
function MealCard({
  draft,
  editing,
  onChange,
}: {
  draft: MealDraft;
  editing: boolean;
  onChange: (d: MealDraft) => void;
}) {
  const breakdownItems = Array.isArray(draft.ingredientBreakdown?.items)
    ? draft.ingredientBreakdown.items
    : [];

  return (
    <div className="space-y-4">
      {/* Macro row */}
      <div className="grid grid-cols-4 gap-2 bg-card-elev rounded-2xl px-4 py-4">
        <NumField
          label="Calories"
          value={draft.kcal}
          unit="kcal"
          editing={editing}
          onChange={(v) => onChange({ ...draft, kcal: v })}
          color="text-peach"
        />
        <NumField
          label="Protein"
          value={draft.protein}
          unit="g"
          editing={editing}
          onChange={(v) => onChange({ ...draft, protein: v })}
          color="text-lavender"
        />
        <NumField
          label="Carbs"
          value={draft.carbs}
          unit="g"
          editing={editing}
          onChange={(v) => onChange({ ...draft, carbs: v })}
          color="text-sky"
        />
        <NumField
          label="Fat"
          value={draft.fat}
          unit="g"
          editing={editing}
          onChange={(v) => onChange({ ...draft, fat: v })}
          color="text-mint"
        />
      </div>

      {/* Items breakdown */}
      {breakdownItems.length > 0 ? (
        <ul className="space-y-1.5 px-1">
          {breakdownItems.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-[13px] text-text-muted">
              <span className="min-w-0 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-peach shrink-0" />
                <span className="truncate">{item.food_text}</span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums">
                {item.grams != null ? `${Math.round(item.grams)}g · ` : ""}
                {item.calories_kcal != null ? `${Math.round(item.calories_kcal)} kcal` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : draft.items.length > 0 && (
        <ul className="space-y-1.5 px-1">
          {draft.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-peach shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}

      {/* Confidence + source badge */}
      {(draft as any).confidence != null && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-mint transition-all"
              style={{ width: `${Math.round((draft as any).confidence * 100)}%` }}
            />
          </div>
          <span className="text-[10.5px] text-text-muted whitespace-nowrap">
            {Math.round((draft as any).confidence * 100)}% confidence
          </span>
          <NutritionSourceBadge source={(draft as any).nutritionSource} />
        </div>
      )}
      {breakdownItems.some((item) => item.verified) && (
        <div className="px-1">
          <NutritionSourceBadge verified />
        </div>
      )}
    </div>
  );
}

/* ── Workout card ── */
function clearWorkoutEstimate(draft: WorkoutDraft): WorkoutDraft {
  const reportedCalories = typeof (draft as any).reportedCalories === "number"
    ? (draft as any).reportedCalories
    : (draft as any).calorieSource === "reported" && Number.isFinite(draft.kcal)
      ? draft.kcal
      : undefined;
  return {
    ...draft,
    kcal: reportedCalories ?? 0,
    reportedCalories,
    estimatedCalories: undefined,
    calorieSource: reportedCalories != null ? "reported" : undefined,
    calorieResult: null,
  } as WorkoutDraft;
}

function setReportedWorkoutCalories(draft: WorkoutDraft, kcal: number): WorkoutDraft {
  return {
    ...draft,
    kcal,
    reportedCalories: kcal,
    estimatedCalories: undefined,
    calorieSource: "reported",
    calorieResult: null,
  } as WorkoutDraft;
}

function WorkoutCard({
  draft,
  editing,
  onChange,
}: {
  draft: WorkoutDraft;
  editing: boolean;
  onChange: (d: WorkoutDraft) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 bg-card-elev rounded-2xl px-4 py-4">
        <NumField
          label="Duration"
          value={draft.duration}
          unit="min"
          editing={editing}
          onChange={(v) => onChange({ ...clearWorkoutEstimate(draft), duration: v })}
          color="text-lavender"
        />
        {draft.distance != null ? (
          <NumField
            label="Distance"
            value={draft.distance}
            unit="km"
            editing={editing}
            onChange={(v) => onChange({ ...draft, distance: v })}
            color="text-sky"
          />
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Type</span>
            <span className="text-[15px] font-bold text-text">{draft.type}</span>
          </div>
        )}
        <NumField
          label="Burned"
          value={draft.kcal}
          unit="kcal"
          editing={editing}
          onChange={(v) => onChange(setReportedWorkoutCalories(draft, v))}
          color="text-peach"
        />
      </div>

      {/* Intensity + type row */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-1.5">
          <Zap className={cn("h-4 w-4", INTENSITY_COLOR[draft.intensity])} strokeWidth={2} />
          {editing ? (
            <select
              value={draft.intensity}
              onChange={(e) => onChange({ ...clearWorkoutEstimate(draft), intensity: e.target.value as WorkoutDraft["intensity"] })}
              className="rounded-lg bg-input border border-border px-2 py-1 text-[12px] font-bold text-text focus:outline-none focus:border-lavender"
            >
              <option value="light">light</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          ) : (
            <span className="text-[13px] font-semibold text-text capitalize">{draft.intensity} intensity</span>
          )}
        </div>
        {draft.distance != null && (
          <>
            <span className="text-text-subtle">·</span>
            <div className="flex items-center gap-1.5">
              <Footprints className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
              <span className="text-[13px] text-text-muted">
                {draft.distance > 0 ? (draft.duration / draft.distance).toFixed(1) : "—"} min/km pace
              </span>
            </div>
          </>
        )}
      </div>

      {Array.isArray(draft.exercises) && draft.exercises.length > 0 && (
        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Exercises
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              {draft.exercises.reduce((sum, ex) => sum + (ex.sets?.length ?? 0), 0)} sets
            </span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {draft.exercises.map((ex, i) => (
              <div key={`${ex.name}-${i}`} className="rounded-xl bg-card-elev px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-text truncate">{ex.name}</span>
                  {ex.muscle_group && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-subtle shrink-0">
                      {ex.muscle_group}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(ex.sets ?? []).map((set, j) => (
                    <span
                      key={j}
                      className="rounded-lg bg-card px-2 py-1 text-[11px] font-semibold text-text-muted tabular-nums"
                    >
                      {j + 1}. {formatExerciseSet(set as Record<string, unknown>, ex.weight_unit)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calorie range from deterministic engine */}
      {(draft as any).calorieResult && (
        <div className="space-y-1.5 px-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-lavender transition-all"
                style={{ width: `${Math.round((draft as any).calorieResult.confidence * 100)}%` }}
              />
            </div>
            <span className="text-[10.5px] text-text-muted whitespace-nowrap">
              ~{(draft as any).calorieResult.range_low}-{(draft as any).calorieResult.range_high} kcal · {Math.round((draft as any).calorieResult.confidence * 100)}%
            </span>
          </div>
          {(draft as any).calorieResult.rough && (
            <span className="inline-flex rounded-full bg-lavender-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-lavender">
              Rough estimate
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Wellness cards ── */
function SleepCard({ draft, editing, onChange }: { draft: SleepDraft; editing: boolean; onChange: (d: SleepDraft) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 bg-card-elev rounded-2xl px-4 py-4">
        <NumField label="Hours" value={draft.hours} unit="h" editing={editing}
          onChange={(v) => onChange({ ...draft, hours: v })} color="text-lavender" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Quality</span>
          {editing ? (
            <select value={draft.quality} onChange={(e) => onChange({ ...draft, quality: e.target.value as SleepDraft["quality"] })}
              className="text-[14px] font-bold bg-input border border-border rounded-lg px-2 py-0.5 text-text focus:outline-none focus:border-lavender">
              <option value="poor">poor</option>
              <option value="ok">ok</option>
              <option value="good">good</option>
              <option value="great">great</option>
            </select>
          ) : (
            <span className="text-[18px] font-extrabold leading-none text-text capitalize">{draft.quality}</span>
          )}
          <span className="text-[11px] text-text-muted">felt</span>
        </div>
      </div>
    </div>
  );
}

function WaterCard({ draft, editing, onChange }: { draft: WaterDraft; editing: boolean; onChange: (d: WaterDraft) => void }) {
  return (
    <div className="bg-card-elev rounded-2xl px-4 py-4 flex justify-center">
      <NumField label="Volume" value={draft.ml} unit="ml" editing={editing}
        onChange={(v) => onChange({ ...draft, ml: v })} color="text-sky" />
    </div>
  );
}

function MoodCard({ draft, editing, onChange }: { draft: MoodDraft; editing: boolean; onChange: (d: MoodDraft) => void }) {
  const emoji = ["😢", "😕", "😐", "🙂", "😄"][draft.rating - 1];
  return (
    <div className="bg-card-elev rounded-2xl px-4 py-4 flex flex-col items-center gap-2">
      <span className="text-[40px] leading-none">{emoji}</span>
      {editing ? (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((r) => (
            <button key={r} onClick={() => onChange({ ...draft, rating: r as MoodDraft["rating"] })}
              className={cn("h-8 w-8 rounded-full text-[13px] font-bold transition-colors",
                r === draft.rating ? "bg-lavender text-text-on-ink" : "bg-input text-text-muted hover:text-text")}>
              {r}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-[15px] font-bold text-text">{draft.rating} / 5</span>
      )}
    </div>
  );
}

function StepsCard({ draft, editing, onChange }: { draft: StepsDraft; editing: boolean; onChange: (d: StepsDraft) => void }) {
  return (
    <div className="bg-card-elev rounded-2xl px-4 py-4 flex justify-center">
      <NumField label="Steps" value={draft.count} unit="steps" editing={editing}
        onChange={(v) => onChange({ ...draft, count: v })} color="text-mint" />
    </div>
  );
}

/* ── Public component ── */
export function LogConfirmCard({ draft: initialDraft, onConfirm, onDiscard }: Props) {
  const [draft, setDraft] = useState<AnyDraft>(initialDraft);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(initialDraft);
    if ((initialDraft as any).submitting) setEditing(false);
  }, [initialDraft]);

  function handleConfirm() {
    if ((draft as any).submitting) return;
    onConfirm(draft);
  }

  const submitting = Boolean((draft as any).submitting);
  const needsWorkoutCalories = draft.kind === "workout"
    && (!Number.isFinite((draft as WorkoutDraft).kcal) || (draft as WorkoutDraft).kcal <= 0);

  // Header config per draft kind
  const HEADER_CONFIG: Record<string, { icon: typeof Flame; bg: string; color: string; label: string }> = {
    meal:    { icon: Flame,    bg: "bg-peach-soft",    color: "text-peach",    label: "Meal estimate — does this look right?" },
    workout: { icon: Dumbbell, bg: "bg-lavender-soft", color: "text-lavender", label: "Workout estimate — does this look right?" },
    sleep:   { icon: Moon,     bg: "bg-lavender-soft", color: "text-lavender", label: "Sleep — confirm to log" },
    water:   { icon: Droplets, bg: "bg-sky-soft",      color: "text-sky",      label: "Water — confirm to log" },
    mood:    { icon: Smile,    bg: "bg-peach-soft",    color: "text-peach",    label: "Mood — confirm to log" },
    steps:   { icon: Activity, bg: "bg-mint-soft",     color: "text-mint",     label: "Steps — confirm to log" },
  };
  const header = HEADER_CONFIG[draft.kind] ?? HEADER_CONFIG.meal;
  const HeaderIcon = header.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className="rounded-[20px] rounded-bl-[6px] bg-card border border-border overflow-hidden shadow-[var(--shadow-elev)] w-full max-w-md"
    >
      {/* Header */}
      <div className={cn("flex items-center gap-3 px-4 py-3 border-b border-border", header.bg)}>
        <HeaderIcon className={cn("h-4 w-4 shrink-0", header.color)} strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text truncate">{draft.description}</p>
          <p className="text-[11px] text-text-muted">{header.label}</p>
        </div>
        {(draft as any).date && (draft as any).date !== new Date().toLocaleDateString("en-CA") && (
          <span className="shrink-0 rounded-full bg-card-elev border border-border px-2 py-0.5 text-[10px] font-bold text-text">
            {(draft as any).date}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {((draft as any).parseError || (draft as any).error) && (
          <div className="mb-3 rounded-xl border border-peach/30 bg-peach-soft px-3 py-2 text-[12px] font-semibold text-text">
            {(draft as any).error || (draft as any).parseError}
          </div>
        )}
        {draft.kind === "meal" && <MealCard draft={draft as MealDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "workout" && <WorkoutCard draft={draft as WorkoutDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "sleep" && <SleepCard draft={draft as SleepDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "water" && <WaterCard draft={draft as WaterDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "mood" && <MoodCard draft={draft as MoodDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "steps" && <StepsCard draft={draft as StepsDraft} editing={editing} onChange={(d) => setDraft(d)} />}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        {draft.kind === "workout" && (draft as any).calorieResult && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => setEditing(true)}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-full border border-lavender/25 bg-lavender-soft px-3 py-2.5 text-[12px] font-bold text-text disabled:opacity-50"
          >
            Refine
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleConfirm}
          disabled={submitting || needsWorkoutCalories}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          {submitting ? "Logging..." : needsWorkoutCalories ? "Enter kcal" : (draft as any).allowDuplicate ? "Log anyway" : "Confirm"}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setEditing((e) => !e)}
          disabled={submitting}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
            editing
              ? "bg-lavender-soft border-lavender text-text"
              : "border-border text-text-muted hover:text-text",
          )}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          {editing ? "Done" : "Edit"}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (!submitting) onDiscard();
          }}
          disabled={submitting}
          className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border text-text-muted hover:text-text transition-colors disabled:opacity-50"
          aria-label="Discard"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </motion.button>
      </div>
    </motion.div>
  );
}

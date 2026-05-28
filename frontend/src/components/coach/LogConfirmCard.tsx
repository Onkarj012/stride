import { useState } from "react";
import { motion } from "motion/react";
import { Check, X, Pencil, Flame, Dumbbell, Footprints, Zap, Moon, Droplets, Smile, Activity } from "lucide-react";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
import { cn } from "@/lib/utils";

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
      {draft.items.length > 0 && (
        <ul className="space-y-1.5 px-1">
          {draft.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-peach shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Workout card ── */
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
          onChange={(v) => onChange({ ...draft, duration: v })}
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
          onChange={(v) => onChange({ ...draft, kcal: v })}
          color="text-peach"
        />
      </div>

      {/* Intensity + type row */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-1.5">
          <Zap className={cn("h-4 w-4", INTENSITY_COLOR[draft.intensity])} strokeWidth={2} />
          <span className="text-[13px] font-semibold text-text capitalize">{draft.intensity} intensity</span>
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
  const [confirmed, setConfirmed] = useState(false);

  function handleConfirm() {
    setConfirmed(true);
    setTimeout(() => onConfirm(draft), 350);
  }

  // Header config per draft kind
  const HEADER_CONFIG: Record<string, { icon: typeof Flame; bg: string; color: string; label: string }> = {
    meal:    { icon: Flame,    bg: "bg-peach/10",    color: "text-peach",    label: "Meal estimate — does this look right?" },
    workout: { icon: Dumbbell, bg: "bg-lavender/10", color: "text-lavender", label: "Workout estimate — does this look right?" },
    sleep:   { icon: Moon,     bg: "bg-lavender/10", color: "text-lavender", label: "Sleep — confirm to log" },
    water:   { icon: Droplets, bg: "bg-sky/10",      color: "text-sky",      label: "Water — confirm to log" },
    mood:    { icon: Smile,    bg: "bg-peach/10",    color: "text-peach",    label: "Mood — confirm to log" },
    steps:   { icon: Activity, bg: "bg-mint/10",     color: "text-mint",     label: "Steps — confirm to log" },
  };
  const header = HEADER_CONFIG[draft.kind] ?? HEADER_CONFIG.meal;
  const HeaderIcon = header.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: confirmed ? 0 : 1, y: confirmed ? -8 : 0, scale: confirmed ? 0.96 : 1 }}
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
        {draft.kind === "meal" && <MealCard draft={draft as MealDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "workout" && <WorkoutCard draft={draft as WorkoutDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "sleep" && <SleepCard draft={draft as SleepDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "water" && <WaterCard draft={draft as WaterDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "mood" && <MoodCard draft={draft as MoodDraft} editing={editing} onChange={(d) => setDraft(d)} />}
        {draft.kind === "steps" && <StepsCard draft={draft as StepsDraft} editing={editing} onChange={(d) => setDraft(d)} />}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleConfirm}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink py-2.5 text-[13px] font-bold"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          Confirm
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setEditing((e) => !e)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors",
            editing
              ? "bg-lavender/20 border-lavender text-text"
              : "border-border text-text-muted hover:text-text",
          )}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          {editing ? "Done" : "Edit"}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onDiscard}
          className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border text-text-muted hover:text-text transition-colors"
          aria-label="Discard"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </motion.button>
      </div>
    </motion.div>
  );
}

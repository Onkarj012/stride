import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  X,
  Trash2,
  Plus,
} from "lucide-react";
import { Card } from "./ui/Card";
import { useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import CustomSelect from "./ui/CustomSelect";

interface ParsedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
  mealType: string;
  aiSuggestion?: string | null;
  components?: string | null;
  description?: string;
}

interface ParsedWorkout {
  name: string;
  sets: string;
  duration: string;
  intensity: string;
  rationale?: string;
  exercises?: { name: string; sets: { weight: string; reps: string }[] }[] | null;
  description?: string;
}

type ConfirmMode = "meal" | "workout";

export interface ConfirmLogCardProps {
  mode: ConfirmMode;
  initialData: {
    description?: string;
    mealType?: string;
    time?: string;
    duration?: string;
    intensity?: string;
    date?: string;
  };
  onConfirm: (data: ParsedMeal | ParsedWorkout) => void;
  onDiscard: () => void;
  preParsed?: ParsedMeal | ParsedWorkout | null;
}

const INTENSITY_OPTIONS = [
  { value: "LOW", label: "LOW", description: "Light activity, easy pace" },
  { value: "MEDIUM", label: "MEDIUM", description: "Moderate effort, breaking a sweat" },
  { value: "HIGH", label: "HIGH", description: "Hard effort, heavy breathing" },
  { value: "MAX", label: "MAX", description: "All-out intensity, failure reps" },
];

export function ConfirmLogCard({
  mode,
  initialData,
  onConfirm,
  onDiscard,
  preParsed,
}: ConfirmLogCardProps) {
  const [parsed, setParsed] = useState<ParsedMeal | ParsedWorkout | null>(preParsed || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseMeal = useAction(api.ai.parseMeal);
  const parseWorkout = useAction(api.ai.parseWorkout);
  const hasParsedRef = useRef(false);

  // Auto-parse on mount if we have a description and no pre-parsed data
  useEffect(() => {
    if (initialData.description && !parsed && !loading && !preParsed && !hasParsedRef.current) {
      hasParsedRef.current = true;
      handleParse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleParse = async () => {
    if (!initialData.description) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "meal") {
        const data = await parseMeal({
          description: initialData.description,
          mealType: initialData.mealType || "unspecified",
          time: initialData.time || "",
        });
        setParsed(data as ParsedMeal);
      } else {
        const data = await parseWorkout({
          description: initialData.description,
          duration: initialData.duration || "",
          intensity: initialData.intensity || "HIGH",
        });
        setParsed(data as ParsedWorkout);
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse");
    } finally {
      setLoading(false);
    }
  };

  const updateParsed = (updates: Partial<ParsedMeal | ParsedWorkout>) => {
    if (!parsed) return;
    setParsed({ ...parsed, ...updates } as any);
  };

  const updateExercise = (
    exIndex: number,
    setIndex: number,
    field: "weight" | "reps",
    value: string,
  ) => {
    if (!parsed || mode !== "workout") return;
    const wp = parsed as ParsedWorkout;
    if (!wp.exercises) return;
    const next = wp.exercises.map((ex, ei) => {
      if (ei !== exIndex) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) =>
          si === setIndex ? { ...s, [field]: value } : s,
        ),
      };
    });
    updateParsed({ exercises: next });
  };

  const addExerciseSet = (exIndex: number) => {
    if (!parsed || mode !== "workout") return;
    const wp = parsed as ParsedWorkout;
    if (!wp.exercises) return;
    const next = wp.exercises.map((ex, ei) => {
      if (ei !== exIndex) return ex;
      return { ...ex, sets: [...ex.sets, { weight: "", reps: "" }] };
    });
    updateParsed({ exercises: next });
  };

  const removeExerciseSet = (exIndex: number, setIndex: number) => {
    if (!parsed || mode !== "workout") return;
    const wp = parsed as ParsedWorkout;
    if (!wp.exercises) return;
    const next = wp.exercises.map((ex, ei) => {
      if (ei !== exIndex) return ex;
      return { ...ex, sets: ex.sets.filter((_, si) => si !== setIndex) };
    });
    updateParsed({ exercises: next });
  };

  if (loading && !parsed) {
    return (
      <Card className="p-6 border-2 border-accent">
        <div className="flex items-center gap-3 text-accent">
          <Loader2 size={20} className="animate-spin" />
          <span className="font-mono text-sm uppercase tracking-wider">
            {mode === "meal" ? "ESTIMATING MACROS..." : "PARSING WORKOUT..."}
          </span>
        </div>
      </Card>
    );
  }

  if (error && !parsed) {
    return (
      <Card className="p-6 border-2 border-red-600">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-sm uppercase text-red-400 tracking-wider">
            PARSE FAILED
          </span>
          <button onClick={onDiscard} className="p-1 hover:text-red-400">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
        <button
          onClick={handleParse}
          className="px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold"
        >
          RETRY
        </button>
      </Card>
    );
  }

  if (!parsed) {
    return (
      <Card className="p-6 border-2 border-accent">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <span className="font-mono text-sm uppercase text-accent tracking-wider">
              PARSED — CONFIRM TO LOG
            </span>
          </div>
          <button onClick={handleParse} className="px-3 py-1.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
            <Sparkles size={12} className="inline mr-1" /> PARSE
          </button>
        </div>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -8 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="will-change-transform"
    >
      <Card className="p-6 border-2 border-accent">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <span className="font-mono text-sm uppercase text-accent tracking-wider">
              PARSED — CONFIRM TO LOG
            </span>
          </div>
          <button
            onClick={onDiscard}
            className="p-1.5 hover:bg-red-600 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {mode === "meal" && (
          <MealEditor
            data={parsed as ParsedMeal}
            onChange={updateParsed}
          />
        )}

        {mode === "workout" && (
          <WorkoutEditor
            data={parsed as ParsedWorkout}
            onChange={updateParsed}
            onUpdateSet={updateExercise}
            onAddSet={addExerciseSet}
            onRemoveSet={removeExerciseSet}
          />
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t border-[var(--border-default)]">
          <button
            onClick={onDiscard}
            className="flex-1 py-3 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-red-600 hover:text-red-400 transition-colors"
          >
            <X size={14} className="inline mr-1" /> DISCARD
          </button>
          <button
            onClick={() => onConfirm(parsed)}
            className="flex-1 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity"
          >
            <CheckCircle2 size={14} className="inline mr-1" /> CONFIRM & LOG
          </button>
        </div>
      </Card>
    </motion.div>
  );
}

function MealEditor({
  data,
  onChange,
}: {
  data: ParsedMeal;
  onChange: (updates: Partial<ParsedMeal>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
          Name
        </label>
        <input
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {/* Components */}
      {data.components && (
        <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <div className="text-[10px] font-mono uppercase text-accent mb-1 tracking-wider">Detected Components</div>
          <div className="text-sm text-[var(--text-secondary)] tracking-wide">{data.components}</div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
            Calories
          </label>
          <input
            type="number"
            value={data.calories}
            onChange={(e) => onChange({ calories: Number(e.target.value) || 0 })}
            className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
            Protein
          </label>
          <input
            type="number"
            value={data.protein}
            onChange={(e) => onChange({ protein: Number(e.target.value) || 0 })}
            className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
            Carbs
          </label>
          <input
            type="number"
            value={Number(data.carbs.toFixed(2))}
            onChange={(e) => onChange({ carbs: Number(e.target.value) || 0 })}
            className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
            Fat
          </label>
          <input
            type="number"
            value={data.fat}
            onChange={(e) => onChange({ fat: Number(e.target.value) || 0 })}
            className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
          Time
        </label>
        <input
          value={data.time}
          onChange={(e) => onChange({ time: e.target.value })}
          className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {/* AI Insight */}
      {data.aiSuggestion && (
        <div className="p-3 bg-accent/5 border border-accent/20">
          <div className="text-[10px] font-mono uppercase text-accent mb-1 tracking-wider">Insight for Next Meal</div>
          <div className="text-sm text-[var(--text-secondary)] tracking-wide italic">{data.aiSuggestion}</div>
        </div>
      )}
    </div>
  );
}

function WorkoutEditor({
  data,
  onChange,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
}: {
  data: ParsedWorkout;
  onChange: (updates: Partial<ParsedWorkout>) => void;
  onUpdateSet: (exIndex: number, setIndex: number, field: "weight" | "reps", value: string) => void;
  onAddSet: (exIndex: number) => void;
  onRemoveSet: (exIndex: number, setIndex: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
          Workout Name
        </label>
        <input
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
            Duration
          </label>
          <input
            value={data.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
            Intensity
          </label>
          <CustomSelect
            value={data.intensity}
            onChange={(val) => onChange({ intensity: val })}
            options={INTENSITY_OPTIONS}
            placeholder="Select intensity"
          />
        </div>
      </div>

      <div className="space-y-3">
        {data.exercises?.map((ex, exIndex) => (
          <div key={exIndex} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div className="font-mono text-sm tracking-wide mb-2">{ex.name}</div>
            <div className="space-y-1.5">
              {ex.sets.map((set, setIndex) => (
                <div key={setIndex} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] w-8">
                    SET {setIndex + 1}
                  </span>
                  <input
                    value={set.weight}
                    onChange={(e) => onUpdateSet(exIndex, setIndex, "weight", e.target.value)}
                    placeholder="Weight"
                    className="flex-1 px-2 py-1.5 bg-[var(--bg-main)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                  />
                  <input
                    value={set.reps}
                    onChange={(e) => onUpdateSet(exIndex, setIndex, "reps", e.target.value)}
                    placeholder="Reps"
                    className="flex-1 px-2 py-1.5 bg-[var(--bg-main)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => onRemoveSet(exIndex, setIndex)}
                    className="p-1 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => onAddSet(exIndex)}
              className="mt-2 flex items-center gap-1 text-[10px] font-mono text-accent hover:underline tracking-wide"
            >
              <Plus size={10} /> ADD SET
            </button>
          </div>
        ))}
      </div>

      {data.rationale && (
        <p className="text-xs text-[var(--text-muted)] tracking-wide italic">
          {data.rationale}
        </p>
      )}
    </div>
  );
}

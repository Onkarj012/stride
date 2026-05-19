import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Utensils, Dumbbell } from "lucide-react";
import { Card } from "./ui/Card";
import { ConfirmLogCard } from "./ConfirmLogCard";
import { RemainingBudget } from "./RemainingBudget";

interface InlineLogPanelProps {
  mode: "meal" | "workout";
  open: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  totalCals: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  goals: {
    calorieGoal: number;
    proteinGoal: number;
    carbGoal: number;
    fatGoal: number;
  };
}

export function InlineLogPanel({
  mode,
  open,
  onClose,
  onConfirm,
  totalCals,
  totalProtein,
  totalCarbs,
  totalFat,
  goals,
}: InlineLogPanelProps) {
  const [description, setDescription] = useState("");
  const [mealType, setMealType] = useState("breakfast");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("HIGH");
  const [showConfirm, setShowConfirm] = useState(false);
  const [initialConfirmData, setInitialConfirmData] = useState<any>(null);

  const handleParse = () => {
    if (!description.trim()) return;
    setShowConfirm(true);
    setInitialConfirmData({
      description,
      mealType: mode === "meal" ? mealType : undefined,
      time: mode === "meal" ? time : undefined,
      duration: mode === "workout" ? duration : undefined,
      intensity: mode === "workout" ? intensity : undefined,
    });
  };

  const handleConfirm = (data: any) => {
    onConfirm(data);
    setShowConfirm(false);
    setDescription("");
    setTime("");
    setDuration("");
    onClose();
  };

  const handleDiscard = () => {
    setShowConfirm(false);
    setInitialConfirmData(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { type: "spring", stiffness: 400, damping: 35 },
            opacity: { duration: 0.2 }
          }}
          className="overflow-hidden will-change-transform"
        >
          <div className="pt-4">
            <AnimatePresence mode="wait" initial={false}>
              {showConfirm && initialConfirmData ? (
                <ConfirmLogCard
                  key="confirm"
                  mode={mode}
                  initialData={initialConfirmData}
                  onConfirm={handleConfirm}
                  onDiscard={handleDiscard}
                />
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <Card className="p-5 border-accent border-2">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {mode === "meal" ? (
                          <Utensils size={16} className="text-accent" />
                        ) : (
                          <Dumbbell size={16} className="text-accent" />
                        )}
                        <span className="font-mono text-xs uppercase tracking-wider text-accent">
                          QUICK LOG {mode}
                        </span>
                      </div>
                      <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-red-600 hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {mode === "meal" && (
                      <>
                        <RemainingBudget
                          totalCals={totalCals}
                          totalProtein={totalProtein}
                          totalCarbs={totalCarbs}
                          totalFat={totalFat}
                          goals={goals}
                        />
                        <div className="flex gap-3 mb-3">
                          <select
                            value={mealType}
                            onChange={(e) => setMealType(e.target.value)}
                            className="px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                          >
                            <option value="breakfast">BREAKFAST</option>
                            <option value="lunch">LUNCH</option>
                            <option value="snack">SNACK</option>
                            <option value="dinner">DINNER</option>
                          </select>
                          <input
                            placeholder="Time (HH:MM)"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="flex-1 px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                          />
                        </div>
                      </>
                    )}

                    {mode === "workout" && (
                      <div className="flex gap-3 mb-3">
                        <input
                          placeholder="Duration (e.g. 45 min)"
                          value={duration}
                          onChange={(e) => setDuration(e.target.value)}
                          className="flex-1 px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                        />
                        <select
                          value={intensity}
                          onChange={(e) => setIntensity(e.target.value)}
                          className="px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                        >
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="MAX">MAX</option>
                        </select>
                      </div>
                    )}

                    <textarea
                      placeholder={
                        mode === "meal"
                          ? "Describe your meal — what you ate, portion sizes, ingredients..."
                          : "Describe your workout — exercises, sets, reps, weights..."
                      }
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed mb-3"
                    />

                    <button
                      onClick={handleParse}
                      disabled={!description.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      <Sparkles size={14} />
                      AI LOG {mode === "meal" ? "MEAL" : "WORKOUT"}
                    </button>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

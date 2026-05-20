import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Utensils, Dumbbell, Search, Barcode, Camera } from "lucide-react";
import { Card } from "./ui/Card";
import { ConfirmLogCard } from "./ConfirmLogCard";
import { RemainingBudget } from "./RemainingBudget";
import { FoodSearch } from "./FoodSearch";
import { NutritionScanner } from "./NutritionScanner";
import CustomSelect from "./ui/CustomSelect";

const INTENSITY_OPTIONS = [
  { value: "LOW", label: "LOW", description: "Light activity, easy pace, minimal exertion" },
  { value: "MEDIUM", label: "MEDIUM", description: "Moderate effort, breaking a sweat, can still talk" },
  { value: "HIGH", label: "HIGH", description: "Hard effort, heavy breathing, challenging sets" },
  { value: "MAX", label: "MAX", description: "All-out intensity, failure reps, peak exertion" },
];

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
  defaultDescription?: string;
  onDescriptionUsed?: () => void;
  defaultDate?: string;
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
  defaultDescription = "",
  onDescriptionUsed,
  defaultDate,
}: InlineLogPanelProps) {
  const [inputMode, setInputMode] = useState<"ai" | "search">("ai");
  const [description, setDescription] = useState(defaultDescription);
  const [time, setTime] = useState("");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split("T")[0]);
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("HIGH");
  const [showConfirm, setShowConfirm] = useState(false);
  const [initialConfirmData, setInitialConfirmData] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (defaultDescription && defaultDescription !== description) {
      setDescription(defaultDescription);
      onDescriptionUsed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDescription]);

  useEffect(() => {
    if (defaultDate) setDate(defaultDate);
  }, [defaultDate]);

  const handleParse = () => {
    if (!description.trim()) return;
    setShowConfirm(true);
    setInitialConfirmData({
      description,
      time: mode === "meal" ? time : undefined,
      date,
      duration: mode === "workout" ? duration : undefined,
      intensity: mode === "workout" ? intensity : undefined,
    });
  };

  const handleConfirm = (data: any) => {
    onConfirm({ ...data, date });
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

  const handleScannerConfirm = (mealData: any) => {
    onConfirm({ ...mealData, date });
    setShowScanner(false);
    onClose();
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
                      <div className="flex items-center gap-3">
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
                        {mode === "meal" && (
                          <div className="flex border border-[var(--border-default)] overflow-hidden">
                            <button
                              onClick={() => setInputMode("ai")}
                              className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors flex items-center gap-1 ${inputMode === "ai" ? "bg-accent text-[var(--theme-primary-text)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                            >
                              <Sparkles size={10} /> Text
                            </button>
                            <button
                              onClick={() => setInputMode("search")}
                              className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors flex items-center gap-1 ${inputMode === "search" ? "bg-accent text-[var(--theme-primary-text)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                            >
                              <Search size={10} /> Search
                            </button>
                          </div>
                        )}
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
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                          />
                          <input
                            placeholder="Time (HH:MM)"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="flex-1 px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                          />
                        </div>
                      </>
                    )}

                    {/* Food search mode */}
                    {mode === "meal" && inputMode === "search" && (
                      <FoodSearch
                        date={date}
                        mealType="unspecified"
                        time={time}
                        onLogged={(meal) => { onConfirm({ ...meal, date }); onClose(); }}
                      />
                    )}

                    {/* Scanner button for meal */}
                    {mode === "meal" && inputMode === "ai" && (
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => setShowScanner(true)}
                          className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border-default)] font-mono text-[10px] uppercase tracking-wider hover:border-accent transition-colors"
                        >
                          <Camera size={12} /> Scan Food
                        </button>
                      </div>
                    )}

                    {/* AI log mode */}
                    {(mode !== "meal" || inputMode === "ai") && (
                      <>
                        {mode === "workout" && (
                          <div className="flex gap-3 mb-3">
                            <input
                              placeholder="Duration (e.g. 45 min)"
                              value={duration}
                              onChange={(e) => setDuration(e.target.value)}
                              className="flex-1 px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                            />
                            <div className="w-40">
                              <CustomSelect
                                value={intensity}
                                onChange={setIntensity}
                                options={INTENSITY_OPTIONS}
                                placeholder="Intensity"
                              />
                            </div>
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
                      </>
                    )}

                    {(mode !== "meal" || inputMode === "ai") && (
                      <button
                        onClick={handleParse}
                        disabled={!description.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        <Sparkles size={14} />
                        LOG {mode === "meal" ? "MEAL" : "WORKOUT"}
                      </button>
                    )}
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
      {showScanner && (
        <NutritionScanner
          onConfirm={handleScannerConfirm}
          onClose={() => setShowScanner(false)}
          time={time}
        />
      )}
    </AnimatePresence>
  );
}

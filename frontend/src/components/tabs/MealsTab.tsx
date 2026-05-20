import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  Utensils,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Repeat,
  Sparkles,
  Save,
  Camera,
} from "lucide-react";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { ConfirmLogCard } from "../ConfirmLogCard";
import { RemainingBudget } from "../RemainingBudget";
import { NutritionScanner } from "../NutritionScanner";
import { VoiceInputButton } from "../VoiceInputButton";
import { SkeletonCard } from "../ui/AnimatedComponents";
import { springs } from "../../lib/animations";

interface MealsTabProps {
  today: string;
  meals: any[];
  mealsLoading: boolean;
  totalCals: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  effectiveGoals: {
    calorieGoal: number;
    proteinGoal: number;
    carbGoal: number;
    fatGoal: number;
  };
  onCommitMeal: (data: any, date?: string) => Promise<void>;
  onDeleteMeal: (id: Id<"meals">) => Promise<void>;
  onUpdateMeal: (id: Id<"meals">, data: any) => Promise<void>;
  onRegenerateSuggestion: (mealId: Id<"meals">, meal: any) => Promise<void>;
}

export default function MealsTab({
  today,
  meals,
  mealsLoading,
  totalCals,
  totalProtein,
  totalCarbs,
  totalFat,
  effectiveGoals,
  onCommitMeal,
  onDeleteMeal,
  onUpdateMeal,
  onRegenerateSuggestion,
}: MealsTabProps) {
  const [mealForm, setMealForm] = useState({ description: "", time: "", date: today });
  const [mealError, setMealError] = useState<string | null>(null);
  const mealTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [mealConfirm, setMealConfirm] = useState<{ initialData: any } | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editMealForm, setEditMealForm] = useState<any>(null);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [logAgainMeal, setLogAgainMeal] = useState<any | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [regeneratingSuggestionId, setRegeneratingSuggestionId] = useState<string | null>(null);

  useEffect(() => {
    const el = mealTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [mealForm.description]);

  const handleUpdateMeal = async (id: Id<"meals">) => {
    if (!editMealForm) return;
    try {
      await onUpdateMeal(id, editMealForm);
      setEditingMealId(null);
      setEditMealForm(null);
    } catch {}
  };

  const handleRegenerateSuggestion = async (mealId: Id<"meals">, meal: any) => {
    setRegeneratingSuggestionId(mealId as string);
    try {
      await onRegenerateSuggestion(mealId, meal);
    } catch { /* ignore */ }
    setRegeneratingSuggestionId(null);
  };

  return (
    <motion.div
      key="meals-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 will-change-transform"
      data-testid="meals-tab"
    >
      <PageHeader title="Meal Log" subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      <RemainingBudget
        totalCals={totalCals}
        totalProtein={totalProtein}
        totalCarbs={totalCarbs}
        totalFat={totalFat}
        goals={effectiveGoals}
      />

      {mealConfirm ? (
        <ConfirmLogCard
          mode="meal"
          initialData={mealConfirm.initialData}
          onConfirm={async (data) => {
            await onCommitMeal(data, mealForm.date);
            setMealConfirm(null);
            setMealForm({ description: "", time: "", date: today });
          }}
          onDiscard={() => setMealConfirm(null)}
        />
      ) : (
        <Card className="p-6">
          <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">Log New Meal</h3>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={mealForm.date}
                onChange={(e) => setMealForm({ ...mealForm, date: e.target.value })}
                className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Time (HH:MM)"
                value={mealForm.time}
                onChange={(e) => setMealForm({ ...mealForm, time: e.target.value })}
                className="flex-1 min-w-[120px] px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
              />
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 border border-[var(--border-default)] font-mono text-[10px] uppercase tracking-wider hover:border-accent transition-colors"
              >
                <Camera size={12} /> Scan Food
              </button>
            </div>
            <div className="relative">
              <textarea
                ref={mealTextareaRef}
                placeholder="Describe your meal — what you ate, portion sizes, ingredients... We'll estimate macros."
                value={mealForm.description}
                onChange={(e) => {
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                  setMealForm({ ...mealForm, description: e.target.value });
                }}
                rows={1}
                className="w-full px-4 py-3 pr-12 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed"
              />
              <VoiceInputButton
                value={mealForm.description}
                onChange={(text) => setMealForm({ ...mealForm, description: text })}
                className="absolute bottom-3 right-3"
              />
            </div>
            {mealError && <div className="text-xs font-mono text-red-400 tracking-wide">{mealError}</div>}
            <button
              onClick={() => {
                if (!mealForm.description.trim()) {
                  setMealError("DESCRIPTION REQUIRED");
                  return;
                }
                setMealError(null);
                setMealConfirm({
                  initialData: {
                    description: mealForm.description,
                    time: mealForm.time,
                  },
                });
              }}
              disabled={!mealForm.description.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles size={16} />
              Log Meal
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {mealsLoading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </motion.div>
        ) : meals.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={springs.smooth}>
            <Card className="p-8 text-center border-dashed">
              <Utensils size={32} className="mx-auto mb-3 text-[var(--text-muted)] opacity-50" />
              <div className="font-mono text-sm text-[var(--text-muted)] tracking-wide">NO MEALS LOGGED TODAY</div>
            </Card>
          </motion.div>
        ) : null}
        {meals.map((meal, idx) => (
          <motion.div
            key={meal._id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, ...springs.snappy }}
          >
            <Card className="p-4 hover:border-accent transition-colors group">
            {editingMealId === meal._id && editMealForm ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase text-accent tracking-wider">EDIT MEAL</span>
                  <button onClick={() => { setEditingMealId(null); setEditMealForm(null); }} className="p-1 hover:text-red-400"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <input type="number" value={editMealForm.calories} onChange={(e) => setEditMealForm({ ...editMealForm, calories: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="KCAL" />
                  <input type="number" value={editMealForm.protein} onChange={(e) => setEditMealForm({ ...editMealForm, protein: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="P" />
                  <input type="number" value={editMealForm.carbs} onChange={(e) => setEditMealForm({ ...editMealForm, carbs: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="C" />
                  <input type="number" value={editMealForm.fat} onChange={(e) => setEditMealForm({ ...editMealForm, fat: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="F" />
                </div>
                <div className="flex gap-3">
                  <input value={editMealForm.name} onChange={(e) => setEditMealForm({ ...editMealForm, name: e.target.value })} className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Name" />
                  <input value={editMealForm.time} onChange={(e) => setEditMealForm({ ...editMealForm, time: e.target.value })} className="w-24 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Time" />
                </div>
                <button onClick={() => handleUpdateMeal(meal._id)} className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
                  <Save size={12} /> SAVE
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                      <h3 className="text-lg font-heading uppercase tracking-normal">{meal.name}</h3>
                    </div>
                    {meal.components && (
                      <div className="text-xs text-[var(--text-muted)] font-mono tracking-wide mb-2">
                        {meal.components}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm font-mono text-[var(--text-secondary)] tracking-wide">
                      <span><Flame size={14} className="inline mr-1" />{meal.calories} KCAL</span>
                      <span>P: {meal.protein}g</span>
                      <span>C: {Number(meal.carbs ?? 0).toFixed(2)}g</span>
                      <span>F: {meal.fat}g</span>
                      {meal.nutritionSource && (
                        <span className={`text-[10px] px-1.5 py-0.5 ${
                          meal.nutritionSource === "database" ? "bg-green-900 text-green-300 border border-green-700" :
                          meal.nutritionSource === "mixed" ? "bg-amber-900 text-amber-300 border border-amber-700" :
                          "bg-slate-700 text-slate-300 border border-slate-600"
                        }`}>
                          {meal.nutritionSource === "database" ? "DB" :
                           meal.nutritionSource === "mixed" ? "MIX" : "AI"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <div className="flex items-center gap-1 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[100px]">
                      <button
                        onClick={() => {
                          setEditingMealId(meal._id);
                          setEditMealForm({
                            name: meal.name,
                            calories: meal.calories,
                            protein: meal.protein,
                            carbs: meal.carbs,
                            fat: meal.fat,
                            time: meal.time,
                            aiSuggestion: meal.aiSuggestion || null,
                            components: meal.components || null,
                          });
                        }}
                        className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setLogAgainMeal(meal)}
                        className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                        title="Log again"
                      >
                        <Repeat size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => setExpandedMealId(expandedMealId === meal._id ? null : meal._id)}
                      className="p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                      title="Details"
                    >
                      {expandedMealId === meal._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => onDeleteMeal(meal._id)} className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {expandedMealId === meal._id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-3 pt-3 border-t border-[var(--border-default)] space-y-2">
                        {meal.ingredientBreakdown && (() => {
                          try {
                            const bd = typeof meal.ingredientBreakdown === "string"
                              ? JSON.parse(meal.ingredientBreakdown)
                              : meal.ingredientBreakdown;
                            return bd.items && bd.items.length > 0 ? (
                              <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="text-[10px] font-mono uppercase text-accent mb-2 tracking-wider">Ingredients</div>
                                <div className="space-y-1.5">
                                  {bd.items.map((item: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-xs font-mono">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[var(--text-secondary)]">{item.matched_food_name}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">({item.grams}g)</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[var(--text-secondary)]">{item.calories_kcal} kcal</span>
                                        <span className={`text-[10px] px-1 py-0.5 ${
                                          item.source === "usda" ? "bg-green-900 text-green-300" :
                                          item.source === "off" ? "bg-blue-900 text-blue-300" :
                                          item.source === "cache" ? "bg-slate-700 text-slate-300" :
                                          "bg-amber-900 text-amber-300"
                                        }`}>
                                          {item.source === "usda" ? "USDA" :
                                           item.source === "off" ? "OFF" :
                                           item.source === "estimated" ? "EST" :
                                           item.source?.toUpperCase() || "UNK"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {bd.unresolved && bd.unresolved.length > 0 && (
                                  <div className="mt-2 text-[10px] font-mono text-amber-400 tracking-wide">
                                    Unresolved: {bd.unresolved.join(", ")}
                                  </div>
                                )}
                              </div>
                            ) : null;
                          } catch { return null; }
                        })()}
                        {meal.components && (
                          <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                            <div className="text-[10px] font-mono uppercase text-accent tracking-wider mb-1">Components</div>
                            <p className="text-sm text-[var(--text-secondary)] tracking-wide">{meal.components}</p>
                          </div>
                        )}
                        {meal.aiSuggestion && (
                          <div className="p-3 bg-accent/5 border border-accent/20">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono uppercase text-accent tracking-wider">Next Meal Insight</span>
                              <button
                                onClick={() => handleRegenerateSuggestion(meal._id, { name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, time: meal.time, components: meal.components })}
                                disabled={regeneratingSuggestionId === meal._id}
                                className="p-1 text-[var(--text-muted)] hover:text-accent transition-colors disabled:opacity-50"
                                title="Regenerate insight"
                              >
                                <Sparkles size={12} className={regeneratingSuggestionId === meal._id ? "animate-pulse" : ""} />
                              </button>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] tracking-wide italic">{meal.aiSuggestion}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                            <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">CALORIES</div>
                            <div className="font-heading">{meal.calories}</div>
                          </div>
                          <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                            <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">PROTEIN</div>
                            <div className="font-heading">{meal.protein}g</div>
                          </div>
                          <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                            <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">CARBS</div>
                            <div className="font-heading">{meal.carbs.toFixed(2)}g</div>
                          </div>
                          <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                            <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">FAT</div>
                            <div className="font-heading">{meal.fat}g</div>
                          </div>
                        </div>
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

      {showScanner && (
        <NutritionScanner
          onConfirm={async (mealData) => {
            await onCommitMeal(mealData, mealForm.date);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
          time={mealForm.time}
        />
      )}
    </motion.div>
  );
}

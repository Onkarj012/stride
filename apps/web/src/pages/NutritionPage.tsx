import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Pencil, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { EditLogModal, type EditableMeal } from "@/components/coach/EditLogModal";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { ProgressBar } from "@/components/primitives/ProgressBar";
import { Skeleton } from "@/components/primitives/Skeleton";
import { MealLogCard } from "@/components/ui-kit";
import { MacroCard, MealLogCardEmpty } from "@/components/ui-kit";
import { MobileIcon, ScreenHeader, SegToggle } from "@/components/mobile/MobileKit";
import { useToast } from "@/context/ToastContext";
import { localDateStr, cn } from "@/lib/utils";
import { RecipesContent } from "@/pages/RecipesPage";

const SECTIONS = ["Breakfast", "Lunch", "Snack", "Dinner"] as const;
type Section = (typeof SECTIONS)[number];

function groupByTime(meals: Array<{ time?: string; mealType?: string } & Record<string, any>>) {
  const groups: Record<Section, typeof meals> = { Breakfast: [], Lunch: [], Snack: [], Dinner: [] };
  for (const m of meals) {
    if (m.mealType && m.mealType !== "unspecified") {
      const key = (m.mealType.charAt(0).toUpperCase() + m.mealType.slice(1)) as Section;
      if (key in groups) { groups[key].push(m); continue; }
    }
    const h = m.time ? parseInt(m.time.split(":")[0], 10) : 12;
    if (h < 11) groups.Breakfast.push(m);
    else if (h < 15) groups.Lunch.push(m);
    else if (h < 18) groups.Snack.push(m);
    else groups.Dinner.push(m);
  }
  return groups;
}

function mealDetail(meal: { ingredientBreakdown?: string }) {
  if (!meal.ingredientBreakdown) return undefined;
  try {
    const parsed = JSON.parse(meal.ingredientBreakdown);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const SECTION_LOG_KEY: Record<Section, string> = {
  Breakfast: "breakfast",
  Lunch: "lunch",
  Snack: "snack",
  Dinner: "dinner",
};

const MODALITIES = [
  { id: "type", label: "Type it", icon: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z" /> },
  { id: "voice", label: "Voice note", icon: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3" /></> },
  { id: "photo", label: "Photo of meal", icon: <><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></> },
  { id: "barcode", label: "Scan barcode", icon: <path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12" /> },
  { id: "ocr", label: "Nutrition label", icon: <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" /> },
];

function AddSheet({ onClose, onPick }: { onClose: () => void; onPick: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <motion.div
        className="relative w-full bg-surface dark:bg-[#11141f] rounded-t-[28px] p-5 pb-8 shadow-[0_-20px_60px_rgba(13,16,27,0.25)]"
        initial={{ y: 360 }} animate={{ y: 0 }} exit={{ y: 360 }} transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="w-10 h-1 rounded-full bg-ink/15 dark:bg-white/15 mx-auto mb-5" />
        <h3 className="text-[18px] font-extrabold text-ink dark:text-surface mb-1">Log anything</h3>
        <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mb-5">Stry parses it into a meal automatically</p>
        <div className="grid grid-cols-1 gap-2">
          {MODALITIES.map((m) => (
            <button key={m.id} onClick={onPick} className="flex items-center gap-3 rounded-[14px] bg-white dark:bg-[#1a1e2e] px-4 py-3.5 text-left active:scale-[0.98] transition-transform shadow-[0_4px_14px_rgba(13,16,27,0.05)]">
              <span className="w-10 h-10 rounded-full bg-lavender/15 flex items-center justify-center text-lavender shrink-0"><MobileIcon size={20}>{m.icon}</MobileIcon></span>
              <span className="text-[15px] font-bold text-ink dark:text-surface">{m.label}</span>
              <span className="ml-auto text-ink/25 dark:text-white/25"><MobileIcon size={18}><path d="M9 6l6 6-6 6" /></MobileIcon></span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function NutritionPage() {
  const navigate = useNavigate();
  const today = localDateStr();
  const meals = (useQuery(api.meals.getMeals, { date: today }) ?? []) as any[];
  const brief = useQuery(api.insights.getTodayBrief, { today });
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"log" | "recipes">("log");
  const [adding, setAdding] = useState(false);
  const [editEntry, setEditEntry] = useState<EditableMeal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"meals"> | null>(null);

  const kcal = Math.round(meals.reduce((s, m) => s + m.calories, 0));
  const protein = Math.round(meals.reduce((s, m) => s + m.protein, 0));
  const carbs = Math.round(meals.reduce((s, m) => s + (m.carbs ?? 0), 0));
  const fat = Math.round(meals.reduce((s, m) => s + (m.fat ?? 0), 0));

  const stats = brief?.stats;
  const kcalTarget = Math.round(stats?.adjustedCalorieTarget ?? stats?.calorieTarget ?? 0);
  const proteinTarget = Math.round(stats?.proteinTarget ?? 0);
  const carbTarget = Math.round(stats?.carbTarget ?? 0);
  const fatTarget = Math.round(stats?.fatTarget ?? 0);

  const kcalPct = kcalTarget > 0 ? (kcal / kcalTarget) * 100 : 0;
  const groups = groupByTime(meals as any);
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  async function handleDelete(id: Id<"meals">) {
    try {
      await deleteMeal({ id });
      toast.success("Meal removed");
    } catch {
      toast.error("Couldn't delete meal");
    } finally {
      setConfirmDelete(null);
    }
  }

  if (brief === undefined) {
    return (
      <div className="flex items-center justify-center min-h-dvh px-5">
        <div className="space-y-3 w-full max-w-xs">
          <Skeleton className="h-8 w-3/4 rounded-[14px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
          <Skeleton className="h-24 w-full rounded-[20px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <EditLogModal kind="meal" entry={editEntry} onClose={() => setEditEntry(null)} />

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDelete(null)}>
          <div className="rounded-[20px] bg-card p-5 max-w-sm w-full shadow-[var(--shadow-elev)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-bold text-text mb-1">Delete this meal?</p>
            <p className="text-[13px] text-text-muted mb-4">This can't be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" full onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button full onClick={() => void handleDelete(confirmDelete)}
                className="bg-bubblegum text-white hover:opacity-90">
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {adding && <AddSheet onClose={() => setAdding(false)} onPick={() => { setAdding(false); navigate("/coach"); }} />}
      </AnimatePresence>

      <div className="lg:hidden px-5 pt-4 pb-6 relative">
        <ScreenHeader title="Nutrition" sub="Today's meals & recipes" />
        <div className="mb-5">
          <SegToggle value={activeTab} onChange={setActiveTab} layoutId="m-nutri-seg" options={[{ id: "log", label: "Today's meals" }, { id: "recipes", label: "Recipes" }]} />
        </div>
        {activeTab === "recipes" ? (
          <RecipesContent embedded />
        ) : (
          <div className="space-y-4">
            <MacroCard kcal={kcal} protein={protein} carbs={carbs} fat={fat} />
            {meals.map((m: any) => (
              <MealLogCard
                key={m._id}
                meal={m.name}
                time={m.time || m.mealType || "Meal"}
                macros={{ kcal: Math.round(m.calories), protein: Math.round(m.protein), carbs: Math.round(m.carbs ?? 0), fat: Math.round(m.fat ?? 0) }}
                confirmed={false}
                detail={mealDetail(m)}
              />
            ))}
            <MealLogCardEmpty />
          </div>
        )}
        {activeTab === "log" && (
          <button
            onClick={() => setAdding(true)}
            aria-label="Log meal"
            className="fixed right-5 bottom-28 z-20 w-14 h-14 rounded-full bg-ink dark:bg-lavender text-white dark:text-ink flex items-center justify-center shadow-[0_16px_40px_rgba(13,16,27,0.3)] active:scale-90 transition-transform"
          >
            <MobileIcon size={26} sw={2.6}><path d="M12 5v14M5 12h14" /></MobileIcon>
          </button>
        )}
      </div>

      <div className="hidden lg:block page-container">
        <PageHeader
          left={
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-text">Nutrition</h1>
              <p className="text-[11.5px] text-text-muted mt-0.5">{todayLabel}</p>
            </div>
          }
          right={
            <div className="flex items-center gap-2">
              <NavTrigger className="lg:hidden" />
            </div>
          }
        />

        {/* Log | Recipes tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl bg-card-elev w-fit">
          {(["log", "recipes"] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={cn("px-4 py-1.5 rounded-lg text-[13px] font-bold capitalize transition-colors",
                activeTab === tab ? "bg-card text-text shadow-[var(--shadow-soft)]" : "text-text-muted hover:text-text")}>
              {tab === "log" ? "Log" : "Recipes"}
            </button>
          ))}
        </div>

        {activeTab === "recipes" && <RecipesContent embedded />}

        {activeTab === "log" && <>
        {/* Macro summary card */}
        <Card tone="ink" radius="lg" padding="md" className="flex items-center gap-4 mb-4">
          <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
            <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="9" />
            <circle
              cx="36" cy="36" r="28" fill="none" stroke="#FDB572"
              strokeWidth="9" strokeLinecap="round"
              strokeDasharray={175.9}
              strokeDashoffset={175.9 * (1 - kcalPct / 100)}
              transform="rotate(-90 36 36)"
            />
            <text x="36" y="40" textAnchor="middle" fontSize="12" fontWeight="800" fontFamily="Manrope" fill="#fff">
              {Math.round(kcalPct)}%
            </text>
          </svg>
          <div className="flex-1 flex flex-col gap-2">
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/55 font-semibold">Calories</span>
                <span className="text-white font-extrabold">{kcal} / {kcalTarget}</span>
              </div>
              <ProgressBar className="mt-1" height="sm" tone="peach" track="rgba(255,255,255,0.18)"
                value={kcalTarget > 0 ? kcal / kcalTarget : 0} />
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/55 font-semibold">Protein</span>
                <span className="text-white font-extrabold">{protein}g / {proteinTarget}g</span>
              </div>
              <ProgressBar className="mt-1" height="sm" tone="lavender" track="rgba(255,255,255,0.18)"
                value={proteinTarget > 0 ? protein / proteinTarget : 0} />
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/55 font-semibold">Carbs</span>
                <span className="text-white font-extrabold">{carbs}g / {carbTarget}g</span>
              </div>
              <ProgressBar className="mt-1" height="sm" tone="sky" track="rgba(255,255,255,0.18)"
                value={carbTarget > 0 ? carbs / carbTarget : 0} />
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/55 font-semibold">Fat</span>
                <span className="text-white font-extrabold">{fat}g / {fatTarget}g</span>
              </div>
              <ProgressBar className="mt-1" height="sm" tone="bubblegum" track="rgba(255,255,255,0.18)"
                value={fatTarget > 0 ? fat / fatTarget : 0} />
            </div>
          </div>
        </Card>

        {/* Meals by section */}
        <div className="flex flex-col gap-2">
          {SECTIONS.map((section) => {
            const sectionMeals = groups[section];
            if (sectionMeals.length === 0 && section !== "Dinner") return null;
            return (
              <div key={section}>
                <div className="flex items-center justify-between mt-3 mb-1.5">
                  <p className="text-[10px] font-extrabold tracking-[0.9px] uppercase text-text-muted">{section}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/?log=${SECTION_LOG_KEY[section]}`)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-lavender hover:text-lavender/80 transition-colors"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} /> Log
                  </button>
                </div>
                {sectionMeals.length > 0 ? sectionMeals.map((m: any) => (
                  <div key={m._id} className="group relative mb-1.5">
                    <MealLogCard
                      meal={m.name}
                      time={m.time || section}
                      macros={{
                        kcal: Math.round(m.calories),
                        protein: Math.round(m.protein),
                        carbs: Math.round(m.carbs ?? 0),
                        fat: Math.round(m.fat ?? 0),
                      }}
                      confirmed={false}
                      detail={mealDetail(m)}
                    />
                    <div className="absolute top-3.5 right-3.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditEntry({ _id: m._id, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs ?? 0, fat: m.fat ?? 0, time: m.time ?? "", mealType: m.mealType, aiSuggestion: m.aiSuggestion, components: m.components })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card-elev text-text-subtle opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-text transition-all"
                        aria-label="Edit meal"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(m._id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card-elev text-text-subtle opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-bubblegum transition-all"
                        aria-label="Delete meal"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-[14px] border border-dashed border-border px-3 py-3 mb-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-medium text-text-muted">Not logged yet</span>
                      {section === "Dinner" && protein < proteinTarget && (
                        <span className="text-[11.5px] font-extrabold text-lavender">+{proteinTarget - protein}g needed</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Log meal button */}
        <button
          type="button"
          onClick={() => navigate("/?log=breakfast")}
          className="w-full mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border py-3 text-[13px] font-bold text-text-muted hover:bg-card transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Log a meal
        </button>
        </>}
      </div>
    </>
  );
}

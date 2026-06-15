import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Pencil, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { EditLogModal, type EditableMeal } from "@/components/coach/EditLogModal";
import { useToast } from "@/context/ToastContext";
import { localDateStr, cn } from "@/lib/utils";

function MacroBar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  return (
    <div className="h-1 rounded-full bg-input overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

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

const SECTION_LOG_KEY: Record<Section, string> = {
  Breakfast: "breakfast",
  Lunch: "lunch",
  Snack: "snack",
  Dinner: "dinner",
};

export function NutritionPage() {
  const navigate = useNavigate();
  const today = localDateStr();
  const meals = useQuery(api.meals.getMeals, { date: today }) ?? [];
  const profile = useQuery(api.profile.getProfile);
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const toast = useToast();

  const [editEntry, setEditEntry] = useState<EditableMeal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"meals"> | null>(null);

  const kcal = Math.round(meals.reduce((s, m) => s + m.calories, 0));
  const protein = Math.round(meals.reduce((s, m) => s + m.protein, 0));
  const carbs = Math.round(meals.reduce((s, m) => s + (m.carbs ?? 0), 0));
  const fat = Math.round(meals.reduce((s, m) => s + (m.fat ?? 0), 0));

  const kcalTarget = profile?.calorieTarget ?? 2000;
  const proteinTarget = profile?.proteinTarget ?? 90;
  const carbTarget = 200;
  const fatTarget = 65;

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
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-full border border-border py-2.5 text-[13px] font-bold text-text-muted hover:bg-card-elev transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => void handleDelete(confirmDelete)}
                className="flex-1 rounded-full bg-bubblegum py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl lg:max-w-4xl mx-auto">
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

        {/* Macro summary card */}
        <div className="rounded-[20px] bg-ink p-4 flex items-center gap-4 mb-4">
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
              <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(kcalPct, 100)}%`, background: "var(--color-peach)" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/55 font-semibold">Protein</span>
                <span className="text-white font-extrabold">{protein}g / {proteinTarget}g</span>
              </div>
              <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min((protein / proteinTarget) * 100, 100)}%`, background: "var(--color-lavender)" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/55 font-semibold">Carbs</span>
                <span className="text-white font-extrabold">{carbs}g / {carbTarget}g</span>
              </div>
              <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min((carbs / carbTarget) * 100, 100)}%`, background: "var(--color-sky)" }} />
              </div>
            </div>
          </div>
        </div>

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
                  <div key={m._id} className="group rounded-[14px] bg-card px-3 py-2.5 shadow-[0_2px_10px_rgba(13,16,27,0.06)] mb-1.5">
                    <div className="flex justify-between items-start">
                      <span className="text-[13px] font-bold text-text flex-1 min-w-0 mr-2">{m.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11.5px] font-extrabold text-text-muted">{Math.round(m.calories)} kcal</span>
                        <button
                          type="button"
                          onClick={() => setEditEntry({ _id: m._id, name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs ?? 0, fat: m.fat ?? 0, time: m.time ?? "", mealType: m.mealType, aiSuggestion: m.aiSuggestion, components: m.components })}
                          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-text-subtle opacity-0 group-hover:opacity-100 hover:bg-card-elev hover:text-text transition-all"
                          aria-label="Edit meal"
                        >
                          <Pencil className="h-3 w-3" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(m._id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-subtle opacity-0 group-hover:opacity-100 hover:bg-card-elev hover:text-bubblegum transition-all"
                          aria-label="Delete meal"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-lavender-soft">{Math.round(m.protein)}g P</span>
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-peach-soft">{Math.round(m.carbs ?? 0)}g C</span>
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-mint-soft">{Math.round(m.fat ?? 0)}g F</span>
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
      </div>
    </>
  );
}

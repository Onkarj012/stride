import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { localDateStr } from "@/lib/utils";
import { cn } from "@/lib/utils";

function MacroBar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  return (
    <div className="h-1 rounded-full bg-input overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function groupByTime(meals: Array<{ time?: string; name: string; calories: number; protein: number; carbs: number; fat: number }>) {
  const groups: Record<string, typeof meals> = { Breakfast: [], Lunch: [], Snack: [], Dinner: [] };
  for (const m of meals) {
    const h = m.time ? parseInt(m.time.split(":")[0], 10) : 12;
    if (h < 11) groups.Breakfast.push(m);
    else if (h < 15) groups.Lunch.push(m);
    else if (h < 18) groups.Snack.push(m);
    else groups.Dinner.push(m);
  }
  return groups;
}

export function NutritionPage() {
  const today = localDateStr();
  const meals = useQuery(api.meals.getMeals, { date: today }) ?? [];
  const profile = useQuery(api.profile.getProfile);

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

  return (
    <div className="max-w-2xl mx-auto">
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
        {/* Circular progress */}
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
        {Object.entries(groups).map(([section, sectionMeals]) => (
          <div key={section}>
            {(sectionMeals.length > 0 || section === "Dinner") && (
              <>
                <p className="text-[10px] font-extrabold tracking-[0.9px] uppercase text-text-muted mb-1.5 mt-3">{section}</p>
                {sectionMeals.length > 0 ? sectionMeals.map((m, i) => (
                  <div key={i} className="rounded-[14px] bg-card px-3 py-2.5 shadow-[0_2px_10px_rgba(13,16,27,0.06)] mb-1.5">
                    <div className="flex justify-between items-start">
                      <span className="text-[13px] font-bold text-text">{m.name}</span>
                      <span className="text-[11.5px] font-extrabold text-text-muted">{Math.round(m.calories)} kcal</span>
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
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add meal button */}
      <button
        type="button"
        className="w-full mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border py-3 text-[13px] font-bold text-text-muted hover:bg-card transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Log a meal
      </button>
    </div>
  );
}

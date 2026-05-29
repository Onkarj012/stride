import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Zap } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { localDateStr } from "@/lib/utils";

interface QuickItem {
  key: string;
  label: string;
  kcal: number;
  run: () => Promise<void>;
}

/**
 * One-tap quick-log row (Task 13). Surfaces saved recipes + recent foods,
 * ordered by behavior (items the user acts on most appear first).
 */
export function QuickLogBar() {
  const recipes = useQuery(api.recipes.getRecipes, {}) as any[] | undefined;
  const recent = useQuery(api.foods.getRecentFoods, {}) as any[] | undefined;
  const behavior = useQuery(api.behavior.getBehaviorProfile, {}) as any;

  const logRecipe = useMutation(api.recipes.logRecipe);
  const addMeal = useMutation(api.meals.addMeal);
  const recordActivity = useMutation(api.gamification.recordActivity);
  const recordBehavior = useMutation(api.behavior.recordBehavior);
  const toast = useToast();

  const items = useMemo<QuickItem[]>(() => {
    const list: QuickItem[] = [];
    for (const r of recipes ?? []) {
      list.push({
        key: `r-${r._id}`,
        label: r.name,
        kcal: Math.round(r.perServing.kcal),
        run: async () => {
          await logRecipe({ id: r._id, servings: 1, date: localDateStr() });
          await recordActivity({ type: "meal" }).catch(() => {});
          toast.success(`Logged ${r.name}`);
        },
      });
    }
    for (const f of recent ?? []) {
      list.push({
        key: `f-${f.name}`,
        label: f.name,
        kcal: Math.round(f.caloriesPer100g),
        run: async () => {
          const time = new Date().toTimeString().slice(0, 5);
          await addMeal({
            name: f.name, calories: f.caloriesPer100g, protein: f.proteinPer100g,
            carbs: f.carbsPer100g, fat: f.fatPer100g, time, date: localDateStr(),
          });
          await recordActivity({ type: "meal" }).catch(() => {});
          await recordBehavior({ kind: "suggestion", key: f.name }).catch(() => {});
          toast.success(`Logged ${f.name}`, "100g");
        },
      });
    }
    // Order by behavior: items the user has acted on most come first.
    const top: string[] = behavior?.topSuggestions ?? [];
    const rank = (label: string) => {
      const i = top.indexOf(label);
      return i === -1 ? Infinity : i;
    };
    return list.sort((a, b) => rank(a.label) - rank(b.label)).slice(0, 12);
  }, [recipes, recent, behavior, logRecipe, addMeal, recordActivity, recordBehavior, toast]);

  if (items.length === 0) return null;

  return (
    <section aria-label="Quick log" className="w-full">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Zap className="h-3.5 w-3.5 text-peach" strokeWidth={2.5} />
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Quick log</h2>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {items.map((it) => (
          <button
            key={it.key} type="button" onClick={() => void it.run()}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-text hover:border-peach focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peach transition-colors"
          >
            <span className="truncate max-w-[140px]">{it.label}</span>
            <span className="text-[11px] font-medium text-text-muted">{it.kcal} kcal</span>
          </button>
        ))}
      </div>
    </section>
  );
}

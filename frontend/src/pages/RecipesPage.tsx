import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Plus, Trash2, Utensils, ChefHat } from "lucide-react";
import { Card } from "@/components/primitives/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { FoodSearch, type PickedFood } from "@/components/food/FoodSearch";
import { useToast } from "@/context/ToastContext";
import { localDateStr } from "@/lib/utils";

const r1 = (n: number) => Math.round(n * 10) / 10;

function totals(ings: PickedFood[], servings: number) {
  const s = Math.max(1, servings || 1);
  const t = ings.reduce(
    (acc, i) => {
      const ratio = i.grams / 100;
      acc.kcal += i.caloriesPer100g * ratio;
      acc.p += i.proteinPer100g * ratio;
      acc.c += i.carbsPer100g * ratio;
      acc.f += i.fatPer100g * ratio;
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  return {
    total: { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) },
    perServing: { kcal: Math.round(t.kcal / s), p: r1(t.p / s), c: r1(t.c / s), f: r1(t.f / s) },
  };
}

function RecipeBuilder({ onSaved }: { onSaved: () => void }) {
  const createRecipe = useMutation(api.recipes.createRecipe);
  const toast = useToast();
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<PickedFood[]>([]);
  const [saving, setSaving] = useState(false);

  const { total, perServing } = useMemo(() => totals(ingredients, servings), [ingredients, servings]);

  async function save() {
    if (!name.trim() || ingredients.length === 0) {
      toast.error("Add a name and at least one ingredient");
      return;
    }
    setSaving(true);
    try {
      await createRecipe({ name: name.trim(), servings: Math.max(1, servings), ingredients });
      toast.success("Recipe saved");
      setName(""); setServings(1); setIngredients([]);
      onSaved();
    } catch (e) {
      toast.error("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="card" radius="xl" padding="lg" className="space-y-4">
      <div className="flex items-center gap-2">
        <ChefHat className="h-4 w-4 text-lavender" strokeWidth={2} />
        <h3 className="text-h3 text-text">New recipe</h3>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 flex flex-col gap-1">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Overnight oats"
            className="bg-input border border-border rounded-lg px-3 py-2.5 text-[14px] text-text focus:outline-none focus:border-lavender" />
        </label>
        <label className="flex flex-col gap-1 sm:w-28">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Servings</span>
          <input type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))}
            className="bg-input border border-border rounded-lg px-3 py-2.5 text-[14px] text-text focus:outline-none focus:border-lavender" />
        </label>
      </div>

      {ingredients.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {ingredients.map((i, idx) => (
            <li key={idx} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-[14px] text-text truncate">{i.name} <span className="text-text-muted">· {i.grams}g</span></span>
              <span className="text-[12px] text-text-muted">{Math.round(i.caloriesPer100g * i.grams / 100)} kcal</span>
              <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setIngredients((a) => a.filter((_, k) => k !== idx))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FoodSearch onAdd={(f) => setIngredients((a) => [...a, f])} ctaLabel="Add ingredient" />
      <CustomIngredient onAdd={(f) => setIngredients((a) => [...a, f])} />

      <div className="flex items-center justify-between rounded-lg bg-card-elev px-4 py-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Per serving</p>
          <p className="text-[15px] font-extrabold text-text">{perServing.kcal} kcal</p>
          <p className="text-[12px] text-text-muted">P {perServing.p}g · C {perServing.c}g · F {perServing.f}g</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Total</p>
          <p className="text-[15px] font-extrabold text-text">{total.kcal} kcal</p>
        </div>
      </div>

      <button type="button" onClick={save} disabled={saving}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink text-text-on-ink px-3 py-2.5 text-[14px] font-bold disabled:opacity-60">
        {saving ? "Saving…" : "Save recipe"}
      </button>
    </Card>
  );
}

function CustomIngredient({ onAdd }: { onAdd: (f: PickedFood) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", grams: 100, kcal: 0, p: 0, c: 0, fat: 0 });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-muted hover:text-text">
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add custom ingredient
      </button>
    );
  }
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Custom item name"
        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender" />
      <div className="grid grid-cols-5 gap-1.5">
        {([["grams", "g"], ["kcal", "kcal/100g"], ["p", "P/100g"], ["c", "C/100g"], ["fat", "F/100g"]] as const).map(([k, lbl]) => (
          <label key={k} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-text-muted">{lbl}</span>
            <input type="number" min={0} value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: num(e.target.value) })}
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-lavender" />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => {
          if (!f.name.trim()) return;
          onAdd({ name: f.name.trim(), grams: f.grams, caloriesPer100g: f.kcal, proteinPer100g: f.p, carbsPer100g: f.c, fatPer100g: f.fat, source: "custom" });
          setF({ name: "", grams: 100, kcal: 0, p: 0, c: 0, fat: 0 }); setOpen(false);
        }} className="rounded-lg bg-ink text-text-on-ink px-3 py-1.5 text-[13px] font-bold">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-text-muted">Cancel</button>
      </div>
    </div>
  );
}

function SavedRecipeRow({ recipe }: { recipe: any }) {
  const logRecipe = useMutation(api.recipes.logRecipe);
  const deleteRecipe = useMutation(api.recipes.deleteRecipe);
  const recordActivity = useMutation(api.gamification.recordActivity);
  const toast = useToast();
  const [servings, setServings] = useState(1);

  async function log() {
    try {
      await logRecipe({ id: recipe._id, servings, date: localDateStr() });
      await recordActivity({ type: "meal" }).catch(() => {});
      toast.success(`Logged ${recipe.name}`, `${Math.round(recipe.perServing.kcal * servings)} kcal`);
    } catch (e) {
      toast.error("Couldn't log", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <Card tone="card" radius="lg" padding="md" className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-peach/20">
        <Utensils className="h-4 w-4 text-peach" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-semibold text-text truncate">{recipe.name}</p>
        <p className="text-[12px] text-text-muted">{recipe.perServing.kcal} kcal/serving · P {recipe.perServing.p}g</p>
      </div>
      <label className="flex items-center gap-1">
        <span className="sr-only">Servings to log</span>
        <input type="number" min={0.25} step={0.25} value={servings} aria-label={`Servings of ${recipe.name}`}
          onChange={(e) => setServings(Math.max(0.25, Number(e.target.value) || 1))}
          className="w-16 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-lavender" />
      </label>
      <button type="button" onClick={log}
        className="inline-flex items-center gap-1 rounded-lg bg-ink text-text-on-ink px-3 py-2 text-[13px] font-bold">Log</button>
      <button type="button" aria-label={`Delete ${recipe.name}`} onClick={() => { if (confirm(`Delete ${recipe.name}?`)) deleteRecipe({ id: recipe._id }); }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </button>
    </Card>
  );
}

export function RecipesPage() {
  const recipes = useQuery(api.recipes.getRecipes, {}) as any[] | undefined;
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader center="Recipes" />
      <RecipeBuilder onSaved={() => { /* query auto-refreshes */ }} />
      <section className="space-y-2">
        <h3 className="text-h3 text-text px-1">Saved recipes</h3>
        {recipes === undefined ? (
          <p className="text-text-muted text-[14px] px-1">Loading…</p>
        ) : recipes.length === 0 ? (
          <p className="text-text-muted text-[14px] px-1">No recipes yet — build one above.</p>
        ) : (
          recipes.map((r) => <SavedRecipeRow key={r._id} recipe={r} />)
        )}
      </section>
    </div>
  );
}

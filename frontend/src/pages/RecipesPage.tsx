import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Plus, Trash2, Utensils, ChefHat, Sparkles, Loader2, ArrowLeft, Pencil } from "lucide-react";
import { Card } from "@/components/primitives/Card";
import { type PickedFood } from "@/components/food/FoodSearch";
import { useToast } from "@/context/ToastContext";
import { localDateStr } from "@/lib/utils";

const r1 = (n: number) => Math.round(n * 10) / 10;

function totals(ings: PickedFood[], servings: number) {
  const s = Math.max(1, servings || 1);
  const t = ings.reduce(
    (acc, i) => {
      const ratio = Math.max(0, i.grams) / 100;
      acc.kcal += Math.max(0, i.caloriesPer100g) * ratio;
      acc.p += Math.max(0, i.proteinPer100g) * ratio;
      acc.c += Math.max(0, i.carbsPer100g) * ratio;
      acc.f += Math.max(0, i.fatPer100g) * ratio;
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  return {
    total: { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) },
    perServing: { kcal: Math.round(t.kcal / s), p: r1(t.p / s), c: r1(t.c / s), f: r1(t.f / s) },
  };
}

function parseIngs(json: string): PickedFood[] {
  try { return JSON.parse(json); } catch { return []; }
}

const fieldCls = "w-full bg-input border border-border rounded-xl px-4 py-3 text-[15px] text-text focus:outline-none focus:border-lavender";
const labelCls = "text-[12px] font-semibold uppercase tracking-wider text-text-muted";

/** Trim names and drop blank rows before persisting or logging. */
function normalizeIngredients(list: PickedFood[]): PickedFood[] | null {
  const cleaned = list.map((i) => ({ ...i, name: i.name.trim() })).filter((i) => i.name);
  return cleaned.length > 0 ? cleaned : null;
}

/* ── AI natural-language ingredient input (no DB lookups, handles real portions) ── */
function AIIngredientInput({ onAdd }: { onAdd: (items: PickedFood[]) => void }) {
  const parse = useAction(api.ai.parseIngredients);
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const items = await parse({ text: v });
      if (items.length === 0) toast.error("Couldn't read that — try rephrasing");
      else { onAdd(items); setText(""); }
    } catch (e) {
      toast.error("Couldn't reach AI", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-lavender/40 bg-lavender/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-lavender" strokeWidth={2} />
        <span className="text-[13px] font-bold text-text">Add ingredients with AI</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
        placeholder="Type naturally — “2 eggs, a banana, 50g oats, a tbsp peanut butter, 1 cup cooked rice”"
        className={`${fieldCls} resize-none`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">No lookups, no per-100g math — AI estimates real portions.</span>
        <button type="button" onClick={add} disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-4 py-2 text-[13px] font-bold disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
          {busy ? "Estimating…" : "Add"}
        </button>
      </div>
    </div>
  );
}

/* ── A single ingredient cell: grams always editable, macros editable on expand ── */
function IngredientRow({ ing, onChange, onRemove }: { ing: PickedFood; onChange: (next: PickedFood) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const macroFields = [
    ["caloriesPer100g", "kcal/100g"], ["proteinPer100g", "P/100g"],
    ["carbsPer100g", "C/100g"], ["fatPer100g", "F/100g"],
  ] as const;
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-1">
        <input value={ing.name} onChange={(e) => onChange({ ...ing, name: e.target.value })} aria-label="Ingredient name"
          className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-text focus:outline-none" />
        <button type="button" aria-label={`Edit macros for ${ing.name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${open ? "bg-lavender/15 text-lavender" : "text-text-muted hover:text-text"}`}>
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button type="button" aria-label={`Remove ${ing.name}`} onClick={onRemove}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <input type="number" min={0} value={ing.grams} aria-label={`Grams of ${ing.name}`}
          onChange={(e) => onChange({ ...ing, grams: num(e.target.value) })}
          className="w-16 bg-input border border-border rounded-lg px-2 py-1 text-[13px] text-text text-right focus:outline-none focus:border-lavender" />
        <span className="text-[12px] text-text-muted">g</span>
        <span className="ml-auto text-[12px] font-semibold text-text-muted">{Math.round(ing.caloriesPer100g * ing.grams / 100)} kcal</span>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {macroFields.map(([k, lbl]) => (
            <label key={k} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-text-muted">{lbl}</span>
              <input type="number" min={0} value={(ing as any)[k]} aria-label={`${lbl} for ${ing.name}`}
                onChange={(e) => onChange({ ...ing, [k]: num(e.target.value) })}
                className="w-full bg-input border border-border rounded-lg px-2 py-1 text-[13px] text-text focus:outline-none focus:border-lavender" />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Editable ingredient list (AI add + custom + inline gram & macro tweak) ── */
function IngredientEditor({ ingredients, onChange, grid = false }: { ingredients: PickedFood[]; onChange: (i: PickedFood[]) => void; grid?: boolean }) {
  return (
    <div className="space-y-4">
      {ingredients.length > 0 && (
        <div className={grid ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-2.5"}>
          {ingredients.map((i, idx) => (
            <IngredientRow key={idx} ing={i}
              onChange={(next) => onChange(ingredients.map((x, k) => k === idx ? next : x))}
              onRemove={() => onChange(ingredients.filter((_, k) => k !== idx))} />
          ))}
        </div>
      )}
      <AIIngredientInput onAdd={(items) => onChange([...ingredients, ...items])} />
      <CustomIngredient onAdd={(f) => onChange([...ingredients, f])} />
    </div>
  );
}

function CustomIngredient({ onAdd }: { onAdd: (f: PickedFood) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", grams: 100, kcal: 0, p: 0, c: 0, fat: 0 });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-muted hover:text-text">
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add ingredient manually
      </button>
    );
  }
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Custom item name" className={fieldCls} />
      <div className="grid grid-cols-5 gap-2">
        {([["grams", "g"], ["kcal", "kcal/100g"], ["p", "P/100g"], ["c", "C/100g"], ["fat", "F/100g"]] as const).map(([k, lbl]) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-[10px] text-text-muted">{lbl}</span>
            <input type="number" min={0} value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: num(e.target.value) })}
              className="w-full bg-input border border-border rounded-lg px-2.5 py-2 text-[14px] text-text focus:outline-none focus:border-lavender" />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => {
          if (!f.name.trim()) return;
          onAdd({ name: f.name.trim(), grams: f.grams, caloriesPer100g: f.kcal, proteinPer100g: f.p, carbsPer100g: f.c, fatPer100g: f.fat, source: "custom" });
          setF({ name: "", grams: 100, kcal: 0, p: 0, c: 0, fat: 0 }); setOpen(false);
        }} className="rounded-lg bg-ink text-text-on-ink px-4 py-2 text-[14px] font-bold">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="text-[14px] text-text-muted px-2">Cancel</button>
      </div>
    </div>
  );
}

/* ── AI natural-language steps input (describe the method → ordered steps) ── */
function AIStepsInput({ onAdd }: { onAdd: (steps: string[]) => void }) {
  const parse = useAction(api.ai.parseSteps);
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const steps = await parse({ text: v });
      if (steps.length === 0) toast.error("Couldn't read that — try rephrasing");
      else { onAdd(steps); setText(""); }
    } catch (e) {
      toast.error("Couldn't reach AI", e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-lavender/40 bg-lavender/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-lavender" strokeWidth={2} />
        <span className="text-[13px] font-bold text-text">Add steps with AI</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
        placeholder="Describe how you make it — “mix oats and milk, refrigerate overnight, top with banana”"
        className={`${fieldCls} resize-none`} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">AI splits it into clear, ordered steps.</span>
        <button type="button" onClick={add} disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-4 py-2 text-[13px] font-bold disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
          {busy ? "Writing…" : "Add"}
        </button>
      </div>
    </div>
  );
}

/* ── Editable steps list ── */
function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (s: string[]) => void }) {
  return (
    <div className="space-y-4">
      {steps.length > 0 && (
        <div className="space-y-2.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card-elev text-[13px] font-bold text-text-muted">{i + 1}</span>
              <textarea value={s} onChange={(e) => onChange(steps.map((x, k) => k === i ? e.target.value : x))} rows={1}
                placeholder={`Step ${i + 1}`} className={`${fieldCls} resize-none py-2.5`} />
              <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
      <AIStepsInput onAdd={(s) => onChange([...steps, ...s])} />
      <button type="button" onClick={() => onChange([...steps, ""])}
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-muted hover:text-text">
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add step manually
      </button>
    </div>
  );
}

/* ── Compact live totals card (sits top-right beside the name) ── */
function TotalsCard({ ingredients, servings }: { ingredients: PickedFood[]; servings: number }) {
  const { total, perServing } = useMemo(() => totals(ingredients, servings), [ingredients, servings]);
  return (
    <Card tone="lavender" radius="xl" padding="lg" className="flex flex-col justify-center">
      <span className="text-[12px] font-bold uppercase tracking-wider text-ink/60">Per serving</span>
      <p className="text-[30px] font-extrabold text-ink leading-none mt-1">{perServing.kcal} <span className="text-[15px] font-bold">kcal</span></p>
      <p className="text-[13px] text-ink/75 mt-1.5">P {perServing.p}g · C {perServing.c}g · F {perServing.f}g · {total.kcal} kcal total</p>
    </Card>
  );
}

/* ── AI insight (auto-fetched once) ── */
function AiInsight({ name, perServing, ingredients }: { name: string; perServing: { kcal: number; p: number; c: number; f: number }; ingredients: string[] }) {
  const recipeInsight = useAction(api.ai.recipeInsight);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(false);
    recipeInsight({ name, perServing, ingredients })
      .then((r) => { if (!cancelled) setText(r); })
      .catch(() => { if (!cancelled) setErr(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card tone="lavender" radius="xl" padding="lg" className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
        <span className="text-[12px] font-bold uppercase tracking-wider text-ink/60">AI insight</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[14px] text-ink/70"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
      ) : err ? (
        <p className="text-[14px] text-ink/70">Couldn't generate an insight right now.</p>
      ) : (
        <p className="text-[15px] leading-relaxed text-ink/85">{text}</p>
      )}
    </Card>
  );
}

/* ── Top bar (back + title + actions) ── */
function TopBar({ onBack, title, actions }: { onBack: () => void; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button type="button" onClick={onBack} aria-label="Back to recipes"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted hover:bg-card-elev shrink-0">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      </button>
      <h1 className="text-h2 text-text flex-1 min-w-0 truncate">{title}</h1>
      {actions}
    </div>
  );
}

/* ── Builder (full page) ── */
function RecipeBuilderView({ onDone }: { onDone: () => void }) {
  const createRecipe = useMutation(api.recipes.createRecipe);
  const toast = useToast();
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<PickedFood[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    const cleaned = normalizeIngredients(ingredients);
    if (!name.trim() || !cleaned) {
      toast.error("Add a name and at least one ingredient with a name");
      return;
    }
    setSaving(true);
    try {
      await createRecipe({
        name: name.trim(),
        servings: Math.max(1, servings),
        ingredients: cleaned,
        steps: steps.filter((s) => s.trim()),
      });
      toast.success("Recipe saved");
      onDone();
    } catch (e) { toast.error("Couldn't save", e instanceof Error ? e.message : undefined); }
    finally { setSaving(false); }
  }

  const SaveBtn = (
    <button type="button" onClick={save} disabled={saving}
      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink px-6 py-2.5 text-[14px] font-bold disabled:opacity-60 shrink-0">
      {saving ? "Saving…" : "Save recipe"}
    </button>
  );

  return (
    <div className="w-full max-w-7xl mx-auto">
      <TopBar onBack={onDone} title="New recipe" actions={SaveBtn} />
      <div className="space-y-6">
        {/* Top row: name/servings (wide) + compact per-serving card */}
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          <Card tone="card" radius="xl" padding="lg" className="lg:col-span-2 grid gap-4 sm:grid-cols-[1fr_140px]">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Recipe name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Overnight oats" className={fieldCls} autoFocus />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Servings</span>
              <input type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))} className={fieldCls} />
            </label>
          </Card>
          <TotalsCard ingredients={ingredients} servings={servings} />
        </div>

        {/* Ingredients — full width, items in a responsive grid */}
        <Card tone="card" radius="xl" padding="lg" className="space-y-4">
          <h3 className="text-h3 text-text">Ingredients</h3>
          <IngredientEditor ingredients={ingredients} onChange={setIngredients} grid />
        </Card>

        {/* Steps — full width below */}
        <Card tone="card" radius="xl" padding="lg" className="space-y-4">
          <h3 className="text-h3 text-text">Steps <span className="text-[13px] font-normal text-text-subtle">(optional)</span></h3>
          <StepsEditor steps={steps} onChange={setSteps} />
        </Card>

        <div className="flex justify-end">{SaveBtn}</div>
      </div>
    </div>
  );
}

/* ── Detail + logging (full page) ── */
function RecipeDetailView({ recipe: initialRecipe, onBack }: { recipe: any; onBack: () => void }) {
  const recipeId = initialRecipe._id as Id<"recipes">;
  const liveRecipe = useQuery(api.recipes.getRecipe, { id: recipeId });
  const recipe = liveRecipe ?? initialRecipe;

  const logRecipe = useMutation(api.recipes.logRecipe);
  const deleteRecipe = useMutation(api.recipes.deleteRecipe);
  const recordActivity = useMutation(api.gamification.recordActivity);
  const toast = useToast();

  const baseIngs = useMemo(() => parseIngs(recipe.ingredients), [recipe.ingredients]);
  const steps: string[] = recipe.steps ?? [];

  const [portions, setPortions] = useState(1);
  const [adjust, setAdjust] = useState(false);
  const [editIngs, setEditIngs] = useState<PickedFood[]>(baseIngs);
  const [note, setNote] = useState("");
  const [logging, setLogging] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (liveRecipe === null) onBack();
  }, [liveRecipe, onBack]);

  const ingsForLog = adjust ? editIngs : baseIngs;
  const ps = useMemo(() => totals(ingsForLog, recipe.servings).perServing, [ingsForLog, recipe.servings]);
  const logKcal = Math.round(ps.kcal * portions);

  async function log() {
    const cleaned = adjust ? normalizeIngredients(editIngs) : undefined;
    if (adjust && !cleaned) {
      toast.error("Every ingredient needs a name");
      return;
    }
    setLogging(true);
    try {
      await logRecipe({
        id: recipe._id,
        servings: portions,
        date: localDateStr(),
        ingredients: cleaned,
        note: note.trim() || undefined,
      });
      await recordActivity({ type: "meal" }).catch(() => {});
      toast.success(`Logged ${recipe.name}`, `${logKcal} kcal`);
      onBack();
    } catch (e) { toast.error("Couldn't log", e instanceof Error ? e.message : undefined); }
    finally { setLogging(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteRecipe({ id: recipeId });
      toast.success("Recipe deleted");
      onBack();
    } catch (e) {
      toast.error("Couldn't delete recipe", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleting(false);
    }
  }

  const DeleteBtn = (
    <button type="button" aria-label={`Delete ${recipe.name}`}
      onClick={() => void handleDelete()}
      disabled={deleting}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted hover:text-bubblegum shrink-0 disabled:opacity-50">
      <Trash2 className="h-4 w-4" strokeWidth={2} />
    </button>
  );

  return (
    <div className="w-full max-w-7xl mx-auto">
      <TopBar onBack={onBack} title={recipe.name} actions={DeleteBtn} />
      <p className="text-[14px] text-text-muted -mt-3 mb-6 pl-[52px]">{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""} · {recipe.perServing.kcal} kcal each</p>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card tone="card" radius="xl" padding="lg" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([["Calories", `${recipe.perServing.kcal}`], ["Protein", `${recipe.perServing.p}g`], ["Carbs", `${recipe.perServing.c}g`], ["Fat", `${recipe.perServing.f}g`]] as const).map(([lbl, val]) => (
                <div key={lbl} className="rounded-xl bg-card-elev px-3 py-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{lbl}</p>
                  <p className="text-[20px] font-extrabold text-text mt-0.5">{val}</p>
                </div>
              ))}
            </div>
            <AiInsight name={recipe.name} perServing={recipe.perServing} ingredients={baseIngs.map((i) => i.name)} />
          </Card>

          <Card tone="card" radius="xl" padding="lg" className="space-y-3">
            <h3 className="text-h3 text-text">Ingredients</h3>
            <ul className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
              {baseIngs.map((i, idx) => (
                <li key={idx} className="flex items-center justify-between px-4 py-3 bg-card text-[15px]">
                  <span className="text-text truncate">{i.name}</span>
                  <span className="text-text-muted shrink-0">{i.grams}g · {Math.round(i.caloriesPer100g * i.grams / 100)} kcal</span>
                </li>
              ))}
            </ul>
          </Card>

          {steps.length > 0 && (
            <Card tone="card" radius="xl" padding="lg" className="space-y-3">
              <h3 className="text-h3 text-text">Steps</h3>
              <ol className="space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-text">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card-elev text-[13px] font-bold text-text-muted">{i + 1}</span>
                    <span className="leading-relaxed pt-1">{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {/* Log panel */}
        <div className="lg:sticky lg:top-6">
          <Card tone="card" radius="xl" padding="lg" className="space-y-4">
            <h3 className="text-h3 text-text">Log this</h3>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-text">Servings</span>
                <input type="number" min={0.25} step={0.25} value={portions} aria-label="Servings to log"
                  onChange={(e) => setPortions(Math.max(0.25, Number(e.target.value) || 1))}
                  className="w-24 bg-input border border-border rounded-lg px-3 py-2 text-[15px] text-text focus:outline-none focus:border-lavender" />
              </label>
              <p className="text-[24px] font-extrabold text-text">{logKcal}<span className="text-[14px] font-bold text-text-muted"> kcal</span></p>
            </div>

            <button type="button" onClick={() => { setAdjust((a) => !a); setEditIngs(baseIngs); }}
              className="text-[13px] font-semibold text-lavender hover:underline">
              {adjust ? "Cancel adjustments" : "Adjust ingredients for accuracy"}
            </button>
            {adjust && (
              <div className="space-y-2 rounded-xl border border-border bg-card-elev p-3">
                <IngredientEditor ingredients={editIngs} onChange={setEditIngs} />
                <p className="text-[11px] text-text-muted">Applies to this log only — your saved recipe stays unchanged.</p>
              </div>
            )}

            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="Note (optional) — e.g. extra cheese, skipped the oil" className={`${fieldCls} resize-none`} />

            <button type="button" onClick={log} disabled={logging}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink px-4 py-3 text-[15px] font-bold disabled:opacity-60">
              {logging ? "Logging…" : `Log ${portions} serving${portions !== 1 ? "s" : ""}`}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Recipe card ── */
function RecipeCard({ recipe, onOpen }: { recipe: any; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="text-left w-full rounded-2xl border border-border bg-card hover:border-lavender hover:shadow-[var(--shadow-elev)] transition-all p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peach/20">
          <Utensils className="h-5 w-5 text-peach" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-text truncate">{recipe.name}</p>
          <p className="text-[13px] text-text-muted">{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-extrabold text-text">{recipe.perServing.kcal}</span>
        <span className="text-[13px] text-text-muted">kcal/serving · P {recipe.perServing.p}g</span>
      </div>
    </button>
  );
}

type View = { mode: "list" } | { mode: "new" } | { mode: "detail"; recipe: any };

export function RecipesPage() {
  const recipes = useQuery(api.recipes.getRecipes, {}) as any[] | undefined;
  const [view, setView] = useState<View>({ mode: "list" });

  const body = (() => {
    if (view.mode === "new") return <RecipeBuilderView onDone={() => setView({ mode: "list" })} />;
    if (view.mode === "detail") return <RecipeDetailView recipe={view.recipe} onBack={() => setView({ mode: "list" })} />;
    return (
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-text">Recipes</h1>
          <button type="button" onClick={() => setView({ mode: "new" })}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-5 py-2.5 text-[14px] font-bold">
            <Plus className="h-4 w-4" strokeWidth={2.5} /> New recipe
          </button>
        </div>

        {recipes === undefined ? (
          <p className="text-text-muted text-[14px]">Loading…</p>
        ) : recipes.length === 0 ? (
          <Card tone="card" radius="xl" padding="lg" className="flex flex-col items-center gap-3 text-center py-16">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-lavender/20">
              <ChefHat className="h-6 w-6 text-lavender" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-text">No recipes yet</p>
              <p className="text-[14px] text-text-muted">Build one to log meals in a single tap.</p>
            </div>
            <button type="button" onClick={() => setView({ mode: "new" })}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-5 py-2.5 text-[14px] font-bold">
              <Plus className="h-4 w-4" strokeWidth={2.5} /> New recipe
            </button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recipes.map((r) => <RecipeCard key={r._id} recipe={r} onOpen={() => setView({ mode: "detail", recipe: r })} />)}
          </div>
        )}
      </div>
    );
  })();

  return (
    <motion.div key={view.mode === "detail" ? `d-${view.recipe._id}` : view.mode}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {body}
    </motion.div>
  );
}

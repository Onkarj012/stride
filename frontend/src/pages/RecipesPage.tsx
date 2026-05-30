import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { Plus, Trash2, Utensils, ChefHat, X, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/primitives/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { type PickedFood } from "@/components/food/FoodSearch";
import { useToast } from "@/context/ToastContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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

/* ── Reusable modal shell (portal, ESC, scroll-lock, bottom-sheet on mobile) ── */
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const isLarge = useMediaQuery("(min-width: 768px)");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onClick={onClose} role="dialog" aria-modal="true"
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/45 backdrop-blur-sm md:p-4"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <motion.div key="card" onClick={(e) => e.stopPropagation()}
            initial={isLarge ? { opacity: 0, scale: 0.96, y: 8 } : { y: "100%" }}
            animate={isLarge ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={isLarge ? { opacity: 0, scale: 0.96, y: 4 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="w-full md:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-3xl md:rounded-3xl bg-card border border-border shadow-[var(--shadow-elev)]">
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── Editable steps list ── */
function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (s: string[]) => void }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card-elev text-[12px] font-bold text-text-muted">{i + 1}</span>
          <input value={s} onChange={(e) => onChange(steps.map((x, k) => k === i ? e.target.value : x))}
            placeholder={`Step ${i + 1}`}
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender" />
          <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...steps, ""])}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-muted hover:text-text">
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add step
      </button>
    </div>
  );
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
    <div className="space-y-2">
      <div className="relative">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
          placeholder="Add ingredients in plain language — “2 eggs, a banana, 50g oats, a tbsp peanut butter”"
          className="w-full resize-none bg-input border border-border rounded-xl px-3 py-2.5 text-[14px] text-text placeholder:text-text-subtle focus:outline-none focus:border-lavender" />
      </div>
      <button type="button" onClick={add} disabled={busy || !text.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-ink text-text-on-ink px-3 py-2 text-[13px] font-bold disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
        {busy ? "Estimating…" : "Add with AI"}
      </button>
    </div>
  );
}

/* ── Editable ingredient list (AI add + custom + inline gram tweak) ── */
function IngredientEditor({ ingredients, onChange }: { ingredients: PickedFood[]; onChange: (i: PickedFood[]) => void }) {
  const setGrams = (idx: number, grams: number) =>
    onChange(ingredients.map((x, k) => k === idx ? { ...x, grams: Math.max(0, grams) } : x));
  return (
    <div className="space-y-3">
      {ingredients.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {ingredients.map((i, idx) => (
            <li key={idx} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-[14px] text-text truncate">{i.name}</span>
              <label className="flex items-center gap-1">
                <span className="sr-only">Grams of {i.name}</span>
                <input type="number" min={0} value={i.grams} aria-label={`Grams of ${i.name}`}
                  onChange={(e) => setGrams(idx, Number(e.target.value) || 0)}
                  className="w-16 bg-input border border-border rounded-lg px-2 py-1 text-[13px] text-text text-right focus:outline-none focus:border-lavender" />
                <span className="text-[12px] text-text-muted">g</span>
              </label>
              <span className="w-14 text-right text-[12px] text-text-muted">{Math.round(i.caloriesPer100g * i.grams / 100)} kcal</span>
              <button type="button" aria-label={`Remove ${i.name}`} onClick={() => onChange(ingredients.filter((_, k) => k !== idx))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
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

/* ── New recipe builder (inside modal) ── */
function RecipeBuilder({ onClose }: { onClose: () => void }) {
  const createRecipe = useMutation(api.recipes.createRecipe);
  const toast = useToast();
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<PickedFood[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { total, perServing } = useMemo(() => totals(ingredients, servings), [ingredients, servings]);

  async function save() {
    if (!name.trim() || ingredients.length === 0) {
      toast.error("Add a name and at least one ingredient");
      return;
    }
    setSaving(true);
    try {
      await createRecipe({ name: name.trim(), servings: Math.max(1, servings), ingredients, steps: steps.filter((s) => s.trim()) });
      toast.success("Recipe saved");
      onClose();
    } catch (e) {
      toast.error("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-lavender" strokeWidth={2} />
          <h3 className="text-h3 text-text">New recipe</h3>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Ingredients</span>
          <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
        </div>

        <div className="space-y-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Steps <span className="font-normal normal-case text-text-subtle">(optional)</span></span>
          <StepsEditor steps={steps} onChange={setSteps} />
        </div>
      </div>

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
    </div>
  );
}

/* ── AI insight (auto-fetched once when detail opens) ── */
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
    <Card tone="lavender" radius="lg" padding="md" className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
        <span className="text-[12px] font-bold uppercase tracking-wider text-ink/60">AI insight</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ink/70"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>
      ) : err ? (
        <p className="text-[13px] text-ink/70">Couldn't generate an insight right now.</p>
      ) : (
        <p className="text-[14px] leading-relaxed text-ink/85">{text}</p>
      )}
    </Card>
  );
}

/* ── Per-recipe detail + editable logging ── */
function RecipeDetailModal({ recipe, onClose }: { recipe: any; onClose: () => void }) {
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

  const ingsForLog = adjust ? editIngs : baseIngs;
  const ps = useMemo(() => totals(ingsForLog, recipe.servings).perServing, [ingsForLog, recipe.servings]);
  const logKcal = Math.round(ps.kcal * portions);

  async function log() {
    setLogging(true);
    try {
      await logRecipe({
        id: recipe._id,
        servings: portions,
        date: localDateStr(),
        ingredients: adjust ? editIngs : undefined,
        note: note.trim() || undefined,
      });
      await recordActivity({ type: "meal" }).catch(() => {});
      toast.success(`Logged ${recipe.name}`, `${logKcal} kcal`);
      onClose();
    } catch (e) {
      toast.error("Couldn't log", e instanceof Error ? e.message : undefined);
    } finally { setLogging(false); }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-extrabold text-text leading-tight truncate">{recipe.name}</h2>
          <p className="text-[13px] text-text-muted">{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""} · {recipe.perServing.kcal} kcal each</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" aria-label={`Delete ${recipe.name}`}
            onClick={() => { deleteRecipe({ id: recipe._id }); toast.success("Recipe deleted"); onClose(); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Body: 2-col on desktop — recipe content | log panel */}
      <div className="md:grid md:grid-cols-2 md:gap-5 md:items-start space-y-4 md:space-y-0">
        <div className="space-y-4">
          {/* Macro chips */}
          <div className="grid grid-cols-4 gap-px bg-border rounded-lg overflow-hidden">
        {([["kcal", recipe.perServing.kcal], ["P", `${recipe.perServing.p}g`], ["C", `${recipe.perServing.c}g`], ["F", `${recipe.perServing.f}g`]] as const).map(([lbl, val]) => (
          <div key={lbl} className="bg-card px-2 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{lbl}</p>
            <p className="text-[14px] font-extrabold text-text">{val}</p>
          </div>
        ))}
      </div>

      {/* AI insight */}
      <AiInsight name={recipe.name} perServing={recipe.perServing} ingredients={baseIngs.map((i) => i.name)} />

      {/* Ingredients (read-only view) */}
      <div className="space-y-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Ingredients</span>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {baseIngs.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between px-3 py-2 text-[14px]">
              <span className="text-text truncate">{i.name}</span>
              <span className="text-text-muted shrink-0">{i.grams}g</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Steps</span>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] text-text">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card-elev text-[12px] font-bold text-text-muted">{i + 1}</span>
                <span className="leading-relaxed pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
        </div>

      {/* Log panel (right column on desktop) */}
      <div className="space-y-3 rounded-xl border border-border bg-card-elev p-4 md:sticky md:top-0">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-text">Servings to log</span>
            <input type="number" min={0.25} step={0.25} value={portions} aria-label="Servings to log"
              onChange={(e) => setPortions(Math.max(0.25, Number(e.target.value) || 1))}
              className="w-20 bg-input border border-border rounded-lg px-2 py-1.5 text-[14px] text-text focus:outline-none focus:border-lavender" />
          </label>
          <p className="text-[15px] font-extrabold text-text">{logKcal} kcal</p>
        </div>

        {/* Adjust for accuracy */}
        <button type="button" onClick={() => { setAdjust((a) => !a); setEditIngs(baseIngs); }}
          className="text-[12px] font-semibold text-lavender hover:underline">
          {adjust ? "Cancel adjustments" : "Adjust ingredients for accuracy"}
        </button>
        {adjust && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <IngredientEditor ingredients={editIngs} onChange={setEditIngs} />
            <p className="text-[11px] text-text-muted">Adjustments apply to this log only — your saved recipe stays unchanged.</p>
          </div>
        )}

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional) — e.g. extra cheese, skipped oil"
          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender" />

        <button type="button" onClick={log} disabled={logging}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink text-text-on-ink px-3 py-2.5 text-[14px] font-bold disabled:opacity-60">
          {logging ? "Logging…" : `Log ${portions} serving${portions !== 1 ? "s" : ""}`}
        </button>
      </div>
      </div>
    </div>
  );
}

/* ── Recipe card in the grid ── */
function RecipeCard({ recipe, onOpen }: { recipe: any; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="text-left w-full rounded-2xl border border-border bg-card hover:border-lavender hover:shadow-[var(--shadow-elev)] transition-all p-4 space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-peach/20">
          <Utensils className="h-4 w-4 text-peach" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-text truncate">{recipe.name}</p>
          <p className="text-[12px] text-text-muted">{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] font-extrabold text-text">{recipe.perServing.kcal}</span>
        <span className="text-[12px] text-text-muted">kcal/serving · P {recipe.perServing.p}g</span>
      </div>
    </button>
  );
}

export function RecipesPage() {
  const recipes = useQuery(api.recipes.getRecipes, {}) as any[] | undefined;
  const [builderOpen, setBuilderOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        center="Recipes"
        right={
          <button type="button" onClick={() => setBuilderOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-4 py-2 text-[13px] font-bold">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New recipe
          </button>
        }
      />

      {recipes === undefined ? (
        <p className="text-text-muted text-[14px] px-1">Loading…</p>
      ) : recipes.length === 0 ? (
        <Card tone="card" radius="xl" padding="lg" className="flex flex-col items-center gap-3 text-center py-10">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-lavender/20">
            <ChefHat className="h-5 w-5 text-lavender" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-text">No recipes yet</p>
            <p className="text-[13px] text-text-muted">Build one to log meals in a single tap.</p>
          </div>
          <button type="button" onClick={() => setBuilderOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-4 py-2 text-[13px] font-bold">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New recipe
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.map((r) => <RecipeCard key={r._id} recipe={r} onOpen={() => setActive(r)} />)}
        </div>
      )}

      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)}>
        <RecipeBuilder onClose={() => setBuilderOpen(false)} />
      </Modal>
      <Modal open={!!active} onClose={() => setActive(null)}>
        {active && <RecipeDetailModal recipe={active} onClose={() => setActive(null)} />}
      </Modal>
    </div>
  );
}

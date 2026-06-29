import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Search, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickedFood {
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source?: string;
}

interface FoodResult {
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source?: string;
}

/**
 * Reusable food search + recent quick-add (Task 12). Debounced search via
 * foods.searchFoods, recent foods as quick chips, pick → set grams → onAdd.
 * Accessible listbox semantics with arrow-key navigation.
 */
export function FoodSearch({ onAdd, ctaLabel = "Add" }: { onAdd: (food: PickedFood) => void; ctaLabel?: string }) {
  const search = useAction(api.foods.searchFoods);
  const recent = useQuery(api.foods.getRecentFoods, {}) as FoodResult[] | undefined;

  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<FoodResult | null>(null);
  const [grams, setGrams] = useState(100);
  const reqId = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = (await search({ query: q.trim() })) as FoodResult[];
        if (id === reqId.current) { setResults(res); setActive(-1); }
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, search]);

  function choose(food: FoodResult) {
    setPicked(food);
    setGrams(100);
    setResults([]);
    setQ("");
  }

  function confirm() {
    if (!picked) return;
    onAdd({
      name: picked.name,
      grams,
      caloriesPer100g: picked.caloriesPer100g,
      proteinPer100g: picked.proteinPer100g,
      carbsPer100g: picked.carbsPer100g,
      fatPer100g: picked.fatPer100g,
      source: picked.source,
    });
    setPicked(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(results[active]); }
  }

  if (picked) {
    const ratio = grams / 100;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-text truncate">{picked.name}</p>
          <button type="button" onClick={() => setPicked(null)} className="text-[12px] text-text-muted hover:text-text">Change</button>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Grams</span>
          <input
            type="number" min={1} value={grams}
            onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 0))}
            className="w-24 bg-input border border-border rounded-lg px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
          />
        </label>
        <p className="text-[12px] text-text-muted">
          {Math.round(picked.caloriesPer100g * ratio)} kcal · P {Math.round(picked.proteinPer100g * ratio)}g ·
          C {Math.round(picked.carbsPer100g * ratio)}g · F {Math.round(picked.fatPer100g * ratio)}g
        </p>
        <button
          type="button" onClick={confirm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink text-text-on-ink px-3 py-2 text-[13px] font-bold"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> {ctaLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" strokeWidth={2} />
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Search foods (e.g. banana)…"
          role="combobox" aria-expanded={results.length > 0} aria-controls="food-results" aria-autocomplete="list"
          className="w-full bg-input border border-border rounded-lg pl-9 pr-9 py-2.5 text-[14px] text-text focus:outline-none focus:border-lavender"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted animate-spin" />}
      </div>

      {results.length > 0 && (
        <ul id="food-results" role="listbox" className="max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {results.map((f, i) => (
            <li key={`${f.name}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button" onClick={() => choose(f)} onMouseEnter={() => setActive(i)}
                className={cn("w-full text-left px-3 py-2 transition-colors", i === active ? "bg-lavender/10" : "hover:bg-card-elev")}
              >
                <span className="text-[14px] font-medium text-text">{f.name}</span>
                {f.brand && <span className="text-[12px] text-text-muted"> · {f.brand}</span>}
                <span className="block text-[12px] text-text-muted">{f.caloriesPer100g} kcal / 100g</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {q.trim().length < 2 && recent && recent.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {recent.slice(0, 8).map((f, i) => (
            <button
              key={`${f.name}-${i}`} type="button" onClick={() => choose(f)}
              className="inline-flex items-center rounded-full border border-border bg-card-elev px-3 py-1 text-[12px] font-medium text-text hover:border-lavender"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

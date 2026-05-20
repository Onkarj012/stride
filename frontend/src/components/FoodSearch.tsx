import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, X, ChevronRight, Check, AlertCircle, Camera } from "lucide-react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import { BarcodeScanner } from "./BarcodeScanner";

interface FoodItem {
  name: string;
  brand?: string;
  barcode?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: number;
  servingUnit?: string;
  imageUrl?: string;
  source?: string;
  verified?: boolean;
}

interface FoodSearchProps {
  date: string;
  mealType: string;
  time?: string;
  onLogged: (meal: { name: string; calories: number; protein: number; carbs: number; fat: number; time: string; mealType: string }) => void;
}

function computeNutrition(food: FoodItem, grams: number) {
  const r = grams / 100;
  return {
    calories: Math.round(food.caloriesPer100g * r),
    protein: Math.round(food.proteinPer100g * r * 10) / 10,
    carbs: Math.round(food.carbsPer100g * r * 10) / 10,
    fat: Math.round(food.fatPer100g * r * 10) / 10,
  };
}

function SourceBadge({ source, verified }: { source?: string; verified?: boolean }) {
  const colors: Record<string, string> = {
    off: "text-green-400 border-green-400/30",
    usda: "text-blue-400 border-blue-400/30",
    user: "text-accent border-accent/30",
  };
  const labels: Record<string, string> = { off: "OFF", usda: "USDA", user: "MY FOOD" };
  const cls = colors[source ?? "off"] ?? colors.off;
  return (
    <span className={`text-[9px] font-mono border px-1 py-0.5 ${cls}`}>
      {labels[source ?? "off"] ?? source?.toUpperCase()}
      {verified && " ✓"}
    </span>
  );
}

export function FoodSearch({ date, mealType, time, onLogged }: FoodSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

  const searchFoods = useAction(api.foods.searchFoods);
  const lookupBarcode = useAction(api.foods.lookupBarcode);
  const addMeal = useMutation(api.meals.addMeal);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchFoods({ query: query.trim() });
        setResults(r as FoodItem[]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleBarcodeScanned = async (barcode: string) => {
    setShowScanner(false);
    setBarcodeError(null);
    setLoading(true);
    try {
      const food = await lookupBarcode({ barcode }) as FoodItem | null;
      if (food) {
        setSelected(food);
        const defaultGrams = food.servingSize ? String(food.servingSize) : "100";
        setGrams(defaultGrams);
      } else {
        setBarcodeError(`No product found for barcode ${barcode}. Enter it manually.`);
      }
    } catch {
      setBarcodeError("Barcode lookup failed. Try searching by name.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFood = (food: FoodItem) => {
    setSelected(food);
    setGrams(food.servingSize ? String(food.servingSize) : "100");
    setQuery("");
    setResults([]);
  };

  const handleLog = async () => {
    if (!selected || !grams) return;
    const g = Number(grams);
    if (isNaN(g) || g <= 0) return;

    const nutrition = computeNutrition(selected, g);
    const now = time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const servingLabel = selected.servingSize ? `${g}${selected.servingUnit ?? "g"} serving` : `${g}g`;
    const fullName = selected.brand ? `${selected.name} (${selected.brand}) – ${servingLabel}` : `${selected.name} – ${servingLabel}`;

    await addMeal({
      name: fullName,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      time: now,
      date,
      mealType,
    });

    setLogged(true);
    onLogged({ name: fullName, ...nutrition, time: now, mealType });
    setTimeout(() => {
      setLogged(false);
      setSelected(null);
      setGrams("");
    }, 1500);
  };

  const previewNutrition = selected && grams ? computeNutrition(selected, Number(grams)) : null;

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods — chicken breast, oats, Oreo..."
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] transition-colors"
            />
            {query && (
              <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowScanner(true)}
            className="px-3 py-2.5 border border-[var(--border-default)] hover:border-accent text-[var(--text-muted)] hover:text-accent transition-colors"
            title="Scan barcode"
          >
            <Camera size={15} />
          </button>
        </div>

        {/* Results dropdown */}
        <AnimatePresence>
          {(results.length > 0 || loading) && !selected && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 right-0 z-20 mt-1 bg-[var(--bg-card)] border border-[var(--border-default)] shadow-xl max-h-64 overflow-y-auto"
            >
              {loading && (
                <div className="flex items-center gap-2 px-4 py-3 text-[var(--text-muted)]">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-xs font-mono">Searching...</span>
                </div>
              )}
              {results.map((food, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectFood(food)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors text-left border-b border-[var(--border-default)] last:border-0"
                >
                  {food.imageUrl ? (
                    <img src={food.imageUrl} alt="" className="w-8 h-8 object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-8 h-8 bg-[var(--bg-elevated)] border border-[var(--border-default)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono truncate">{food.name}</div>
                    {food.brand && <div className="text-[10px] text-[var(--text-muted)]">{food.brand}</div>}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="text-xs font-mono font-bold">{food.caloriesPer100g} <span className="text-[var(--text-muted)] font-normal">kcal</span></div>
                    <SourceBadge source={food.source} verified={food.verified} />
                  </div>
                  <ChevronRight size={12} className="text-[var(--text-muted)] shrink-0" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Barcode error */}
      {barcodeError && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
          <AlertCircle size={12} /> {barcodeError}
        </div>
      )}

      {/* Serving picker */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 border border-accent/40 bg-accent/5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-mono font-bold leading-tight">{selected.name}</div>
                  {selected.brand && <div className="text-[10px] text-[var(--text-muted)]">{selected.brand}</div>}
                </div>
                <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={14} />
                </button>
              </div>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1 tracking-wider">
                    Amount ({selected.servingUnit ?? "g"})
                  </label>
                  <input
                    type="number"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                {selected.servingSize && (
                  <button
                    onClick={() => setGrams(String(selected.servingSize))}
                    className="px-3 py-2 border border-[var(--border-default)] font-mono text-[10px] uppercase hover:border-accent transition-colors whitespace-nowrap"
                  >
                    1 serving ({selected.servingSize}{selected.servingUnit ?? "g"})
                  </button>
                )}
                <button
                  onClick={() => setGrams("100")}
                  className="px-3 py-2 border border-[var(--border-default)] font-mono text-[10px] uppercase hover:border-accent transition-colors"
                >
                  100g
                </button>
              </div>

              {previewNutrition && Number(grams) > 0 && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="font-mono font-bold text-sm">{previewNutrition.calories}</div>
                    <div className="text-[9px] font-mono text-[var(--text-muted)]">KCAL</div>
                  </div>
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="font-mono font-bold text-sm">{previewNutrition.protein}g</div>
                    <div className="text-[9px] font-mono text-[var(--text-muted)]">PROTEIN</div>
                  </div>
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="font-mono font-bold text-sm">{previewNutrition.carbs}g</div>
                    <div className="text-[9px] font-mono text-[var(--text-muted)]">CARBS</div>
                  </div>
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="font-mono font-bold text-sm">{previewNutrition.fat}g</div>
                    <div className="text-[9px] font-mono text-[var(--text-muted)]">FAT</div>
                  </div>
                </div>
              )}

              <button
                onClick={handleLog}
                disabled={!grams || Number(grams) <= 0 || logged}
                className="w-full py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {logged ? <><Check size={14} /> Logged!</> : "Log This Food"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barcode scanner modal */}
      {showScanner && (
        <BarcodeScanner
          onBarcode={handleBarcodeScanned}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

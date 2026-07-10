import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Barcode, X, Check, Loader2 } from "lucide-react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

type Product = {
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: number;
  servingUnit?: string;
  imageUrl?: string;
  source?: string;
  verified?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  date?: string;
};

function getNearDuplicateData(err: unknown): { message?: string } | null {
  if (!(err instanceof ConvexError)) return null;
  const data = err.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const payload = data as { code?: string; message?: string };
  return payload.code === "NEAR_DUPLICATE" ? payload : null;
}

export function BarcodeModal({ open, onClose, date }: Props) {
  const [barcode, setBarcode] = useState("");
  const [grams, setGrams] = useState<number>(100);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useAction(api.foods.lookupBarcode);
  const addMeal = useMutation(api.meals.addMeal);
  const toast = useToast();

  function reset() {
    setBarcode(""); setProduct(null); setError(null); setGrams(100);
  }

  async function search() {
    const code = barcode.trim();
    if (!code) return;
    setLoading(true); setError(null);
    try {
      const result = await lookup({ barcode: code });
      if (!result) {
        setError("Product not found in Open Food Facts. Try another barcode or log manually.");
      } else {
        setProduct(result);
        if (result.servingSize) setGrams(result.servingSize);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function logIt() {
    if (!product) return;
    const ratio = grams / 100;
    const time = new Date().toTimeString().slice(0, 5);
    try {
      const payload = {
        name: product.brand ? `${product.brand} ${product.name}` : product.name,
        calories: Math.round(product.caloriesPer100g * ratio),
        protein: Math.round(product.proteinPer100g * ratio * 10) / 10,
        carbs: Math.round(product.carbsPer100g * ratio * 10) / 10,
        fat: Math.round(product.fatPer100g * ratio * 10) / 10,
        time,
        date,
        confidence: product.verified ? 0.95 : 0.82,
        nutritionSource: product.source ? `barcode_${product.source}` : "barcode",
        nutritionVerified: !!product.verified,
        logSource: "barcode",
        components: product.name,
        structuredItems: JSON.stringify([{
          food_text: product.name,
          matched_food_name: product.name,
          grams,
          calories_kcal: Math.round(product.caloriesPer100g * ratio),
          protein_g: Math.round(product.proteinPer100g * ratio * 10) / 10,
          carbs_g: Math.round(product.carbsPer100g * ratio * 10) / 10,
          fat_g: Math.round(product.fatPer100g * ratio * 10) / 10,
          source: product.source ?? "barcode",
          verified: product.verified,
          confidence: product.verified ? 0.95 : 0.82,
        }]),
        ingredientBreakdown: JSON.stringify({
          calories_kcal: Math.round(product.caloriesPer100g * ratio),
          protein_g: Math.round(product.proteinPer100g * ratio * 10) / 10,
          carbs_g: Math.round(product.carbsPer100g * ratio * 10) / 10,
          fat_g: Math.round(product.fatPer100g * ratio * 10) / 10,
          confidence: product.verified ? 0.95 : 0.82,
          items: [{
            food_text: product.name,
            matched_food_name: product.name,
            grams,
            calories_kcal: Math.round(product.caloriesPer100g * ratio),
            protein_g: Math.round(product.proteinPer100g * ratio * 10) / 10,
            carbs_g: Math.round(product.carbsPer100g * ratio * 10) / 10,
            fat_g: Math.round(product.fatPer100g * ratio * 10) / 10,
            source: product.source ?? "barcode",
            verified: product.verified,
            confidence: product.verified ? 0.95 : 0.82,
          }],
          unresolved: [],
        }),
      };
      try {
        await addMeal(payload);
      } catch (err) {
        const duplicate = getNearDuplicateData(err);
        if (!duplicate) throw err;
        if (!window.confirm(duplicate.message ?? "Looks like you already logged this — log anyway?")) {
          reset(); onClose();
          return;
        }
        await addMeal({ ...payload, allowDuplicate: true });
      }
      toast.success("Logged via barcode", `${product.name} · ${grams}g`);
      reset(); onClose();
    } catch (err) {
      toast.error("Couldn't log", err instanceof Error ? err.message : "Try again");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-bg/70 backdrop-blur-sm"
            onClick={() => { reset(); onClose(); }}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-[56] -translate-x-1/2 -translate-y-1/2 w-[min(420px,calc(100vw-2rem))] rounded-2xl bg-card border border-border-strong shadow-[var(--shadow-elev)] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Barcode className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
              <h3 className="text-[15px] font-bold text-text flex-1">Scan barcode</h3>
              <button type="button" onClick={() => { reset(); onClose(); }} aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-card-elev">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {!product && (
                <>
                  <p className="text-[13px] text-text-muted">
                    Enter a barcode number — we'll look it up in Open Food Facts and log the macros.
                  </p>
                  <form onSubmit={(e) => { e.preventDefault(); search(); }}
                    className="flex items-center gap-2 rounded-full bg-card-elev border border-border px-4 py-1.5">
                    <input
                      type="text" inputMode="numeric" autoFocus value={barcode}
                      onChange={(e) => setBarcode(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="e.g. 5449000000996"
                      className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none py-1"
                    />
                    <button type="submit" disabled={!barcode || loading}
                      className={cn(
                        "rounded-full bg-ink text-text-on-ink px-3 py-1 text-[12px] font-semibold transition-opacity",
                        (!barcode || loading) && "opacity-50",
                      )}>
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Lookup"}
                    </button>
                  </form>
                  {error && <p className="text-[12px] text-bubblegum">{error}</p>}
                </>
              )}

              {product && (
                <>
                  <div className="flex items-start gap-3">
                    {product.imageUrl && (
                      <img src={product.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
                    )}
                    <div className="flex-1 min-w-0">
                      {product.brand && <p className="text-[11px] text-text-muted uppercase tracking-wider">{product.brand}</p>}
                      <p className="text-[14px] font-bold text-text">{product.name}</p>
                      <p className="text-[12px] text-text-muted mt-0.5">
                        Per 100g: {product.caloriesPer100g}kcal · {product.proteinPer100g}p · {product.carbsPer100g}c · {product.fatPer100g}f
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-text-subtle">
                        <span className="rounded-full bg-card-elev border border-border px-2 py-0.5">
                          {product.source === "off" ? "Open Food Facts" : product.source === "usda" ? "USDA" : product.source ?? "Barcode"}
                        </span>
                        {product.verified && (
                          <span className="rounded-full bg-mint-soft text-mint px-2 py-0.5">Verified</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-text-muted">Portion (grams)</label>
                    <input
                      type="number" min={1} value={grams}
                      onChange={(e) => setGrams(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full rounded-lg bg-card-elev border border-border px-3 py-2 text-[14px] text-text focus:outline-none focus:border-lavender"
                    />
                    <p className="text-[12px] text-text-muted">
                      → {Math.round(product.caloriesPer100g * grams / 100)} kcal
                      · {Math.round(product.proteinPer100g * grams / 100 * 10) / 10}g protein
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setProduct(null)}
                      className="flex-1 rounded-full border border-border bg-card px-3 py-2 text-[13px] font-semibold text-text-muted hover:text-text">
                      Cancel
                    </button>
                    <button type="button" onClick={logIt}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink px-3 py-2 text-[13px] font-semibold">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      Log meal
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Barcode, X, Loader2, Check, Upload, Utensils } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import { BarcodeScanner } from "./BarcodeScanner";
import { Card } from "./ui/Card";

interface ScannedProduct {
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
  source: string;
}

interface NutritionScannerProps {
  onConfirm: (meal: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    time: string;
    components?: string;
  }) => void;
  onClose: () => void;
  time: string;
}

export function NutritionScanner({ onConfirm, onClose, time }: NutritionScannerProps) {
  const [mode, setMode] = useState<"menu" | "barcode" | "image" | "portion">("menu");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grams, setGrams] = useState("");
  const [portionDesc, setPortionDesc] = useState("");
  const [calculated, setCalculated] = useState<{ calories: number; protein: number; carbs: number; fat: number; grams: number } | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lookupBarcode = useAction(api.foods.lookupBarcode);
  const parseNutritionImage = useAction(api.ai.parseNutritionImage);
  const estimatePortion = useAction(api.ai.estimatePortion);

  const handleBarcodeResult = async (barcode: string) => {
    setShowBarcodeScanner(false);
    setLoading(true);
    setError(null);
    try {
      const food = await lookupBarcode({ barcode }) as ScannedProduct | null;
      if (food) {
        setProduct(food);
        setProductName(food.name);
        setGrams(food.servingSize ? String(food.servingSize) : "100");
        setMode("portion");
      } else {
        setError(`No product found for barcode ${barcode}. Try scanning the nutrition label instead.`);
        setMode("menu");
      }
    } catch {
      setError("Barcode lookup failed. Try again or use nutrition label scan.");
      setMode("menu");
    } finally {
      setLoading(false);
    }
  };

  const handleImageFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await parseNutritionImage({ imageDataUrl: dataUrl });
      if (result) {
        const name = result.name || "Scanned Product";
        setProduct({
          name,
          caloriesPer100g: result.caloriesPer100g || 0,
          proteinPer100g: result.proteinPer100g || 0,
          carbsPer100g: result.carbsPer100g || 0,
          fatPer100g: result.fatPer100g || 0,
          servingSize: result.servingSize || undefined,
          servingUnit: result.servingUnit || "g",
          source: "scan",
        });
        setProductName(name);
        setGrams(result.servingSize ? String(result.servingSize) : "100");
        setMode("portion");
      } else {
        setError("Could not read nutrition label. Try a clearer photo or enter manually.");
        setMode("menu");
      }
    } catch (err: any) {
      setError(err.message || "Failed to scan nutrition label.");
      setMode("menu");
    } finally {
      setLoading(false);
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const computeFromGrams = useCallback((g: number) => {
    if (!product) return null;
    const ratio = g / 100;
    return {
      grams: g,
      calories: Math.round(product.caloriesPer100g * ratio),
      protein: Math.round(product.proteinPer100g * ratio * 10) / 10,
      carbs: Math.round(product.carbsPer100g * ratio * 10) / 10,
      fat: Math.round(product.fatPer100g * ratio * 10) / 10,
    };
  }, [product]);

  const handleCalculate = async () => {
    if (!product) return;
    setError(null);

    // If user entered grams directly, calculate client-side
    const g = Number(grams);
    if (!isNaN(g) && g > 0 && !portionDesc.trim()) {
      const result = computeFromGrams(g);
      if (result) setCalculated(result);
      return;
    }

    // If user entered a description, use AI to estimate
    if (portionDesc.trim()) {
      setLoading(true);
      try {
        const result = await estimatePortion({
          baseName: product.name,
          caloriesPer100g: product.caloriesPer100g,
          proteinPer100g: product.proteinPer100g,
          carbsPer100g: product.carbsPer100g,
          fatPer100g: product.fatPer100g,
          servingSize: product.servingSize,
          servingUnit: product.servingUnit,
          portionDescription: portionDesc.trim(),
        });
        setCalculated(result);
        setGrams(String(result.grams));
      } catch (err: any) {
        setError(err.message || "Failed to estimate portion. Try entering grams directly.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleLog = () => {
    if (!product || !calculated) return;
    const servingLabel = calculated.grams > 0 ? `${calculated.grams}g` : "";
    const fullName = product.brand
      ? `${productName || product.name} (${product.brand}) – ${servingLabel}`
      : `${productName || product.name} – ${servingLabel}`;
    onConfirm({
      name: fullName,
      calories: calculated.calories,
      protein: calculated.protein,
      carbs: calculated.carbs,
      fat: calculated.fat,
      time: time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      components: productName || product.name,
    });
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-default)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)] shrink-0">
          <span className="text-xs font-mono uppercase tracking-wider">
            {mode === "menu" && "Scan Food"}
            {mode === "barcode" && "Barcode Scanner"}
            {mode === "image" && "Nutrition Label Scan"}
            {mode === "portion" && "Portion Size"}
          </span>
          <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto">
          {mode === "menu" && (
            <div className="space-y-3">
              {error && (
                <div className="p-3 bg-red-600/10 border border-red-600/30 text-red-400 text-xs font-mono">
                  {error}
                </div>
              )}
              <button
                onClick={() => setShowBarcodeScanner(true)}
                className="w-full flex items-center gap-3 p-4 border border-[var(--border-default)] hover:border-accent hover:bg-[var(--bg-elevated)] transition-colors text-left"
              >
                <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                  <Barcode size={20} className="text-accent" />
                </div>
                <div>
                  <div className="text-sm font-mono tracking-wide">Scan Barcode</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Point camera at product barcode</div>
                </div>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 p-4 border border-[var(--border-default)] hover:border-accent hover:bg-[var(--bg-elevated)] transition-colors text-left"
              >
                <div className="w-10 h-10 bg-accent/10 flex items-center justify-center">
                  <Camera size={20} className="text-accent" />
                </div>
                <div>
                  <div className="text-sm font-mono tracking-wide">Scan Nutrition Label</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Take a photo of the nutrition table</div>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {mode === "portion" && product && (
            <div className="space-y-4">
              {/* Product info */}
              <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full bg-transparent text-sm font-mono font-bold focus:outline-none border-b border-transparent focus:border-accent"
                />
                {product.brand && <div className="text-[10px] text-[var(--text-muted)]">{product.brand}</div>}
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-xs font-mono font-bold">{Math.round(product.caloriesPer100g)}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">kcal/100g</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold">{Math.round(product.proteinPer100g * 10) / 10}g</div>
                    <div className="text-[9px] text-[var(--text-muted)]">P/100g</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold">{Math.round(product.carbsPer100g * 10) / 10}g</div>
                    <div className="text-[9px] text-[var(--text-muted)]">C/100g</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold">{Math.round(product.fatPer100g * 10) / 10}g</div>
                    <div className="text-[9px] text-[var(--text-muted)]">F/100g</div>
                  </div>
                </div>
                {product.servingSize && (
                  <div className="mt-2 text-[10px] text-[var(--text-muted)] font-mono">
                    Serving: {product.servingSize}{product.servingUnit || "g"}
                  </div>
                )}
              </div>

              {/* Portion inputs */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-1.5 tracking-wider">
                    How much did you have?
                  </label>
                  <input
                    value={portionDesc}
                    onChange={(e) => setPortionDesc(e.target.value)}
                    placeholder="e.g. 4 biscuits, half packet, 1 bowl..."
                    className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-[var(--border-default)]" />
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">OR ENTER GRAMS</span>
                  <div className="h-px flex-1 bg-[var(--border-default)]" />
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    placeholder="grams"
                    className="flex-1 px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                  />
                  {product.servingSize && (
                    <button
                      onClick={() => setGrams(String(product.servingSize))}
                      className="px-3 py-2.5 border border-[var(--border-default)] font-mono text-[10px] uppercase hover:border-accent transition-colors whitespace-nowrap"
                    >
                      1 serving
                    </button>
                  )}
                  <button
                    onClick={() => setGrams("100")}
                    className="px-3 py-2.5 border border-[var(--border-default)] font-mono text-[10px] uppercase hover:border-accent transition-colors"
                  >
                    100g
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-600/10 border border-red-600/30 text-red-400 text-xs font-mono">
                  {error}
                </div>
              )}

              {/* Calculated preview */}
              <AnimatePresence>
                {calculated && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-accent/5 border border-accent/30">
                      <div className="text-[10px] font-mono uppercase text-accent mb-2 tracking-wider">Estimated Macros</div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-sm font-mono font-bold">{calculated.calories}</div>
                          <div className="text-[9px] text-[var(--text-muted)]">kcal</div>
                        </div>
                        <div>
                          <div className="text-sm font-mono font-bold">{calculated.protein}g</div>
                          <div className="text-[9px] text-[var(--text-muted)]">protein</div>
                        </div>
                        <div>
                          <div className="text-sm font-mono font-bold">{calculated.carbs}g</div>
                          <div className="text-[9px] text-[var(--text-muted)]">carbs</div>
                        </div>
                        <div>
                          <div className="text-sm font-mono font-bold">{calculated.fat}g</div>
                          <div className="text-[9px] text-[var(--text-muted)]">fat</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2">
                <button
                  onClick={() => { setMode("menu"); setProduct(null); setProductName(""); setCalculated(null); setError(null); }}
                  className="flex-1 py-2.5 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCalculate}
                  disabled={loading || (!grams && !portionDesc)}
                  className="flex-1 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Calculate"}
                </button>
              </div>

              {calculated && (
                <button
                  onClick={handleLog}
                  className="w-full py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
                >
                  <Utensils size={14} /> Log This Meal
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barcode scanner overlay */}
      {showBarcodeScanner && (
        <BarcodeScanner
          onBarcode={handleBarcodeResult}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </motion.div>,
    document.body
  );
}

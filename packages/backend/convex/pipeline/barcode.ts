import { resolvePortion, type Nutrients } from "@stride/core";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery, type ActionCtx } from "../_generated/server";
import { nutrientsValidator } from "../ledger_validators";
import { isRecord } from "./openrouter";

/** Open Food Facts product endpoint, v2, only the fields the pipeline reads. */
export function offProductUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_quantity,serving_quantity_unit`;
}

const OFF_TIMEOUT_MS = 10_000;
const KJ_PER_KCAL = 4.184;
/** EAN-8, UPC-A, EAN-13 and GTIN-14 are 8-14 digits. */
const BARCODE_RE = /^\d{8,14}$/;
/** `food_portions` description for an OFF product's label serving. */
export const OFF_SERVING = "serving";

/** A barcode product as the pipeline uses it. `servingGrams` is null when the label serving cannot become grams. */
export const barcodeFoodValidator = v.object({
  foodId: v.id("foods"),
  name: v.string(),
  per100g: nutrientsValidator,
  servingGrams: v.union(v.number(), v.null()),
});
export type BarcodeFood = Infer<typeof barcodeFoodValidator>;

/** A product parsed from OFF, ready to cache into `foods`. */
export interface OffProduct {
  name: string;
  per100g: Nutrients;
  servingGrams: number | null;
}

/** A non-negative number from an OFF field, which may arrive as a number or a numeric string. */
function offNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parses an OFF v2 response. Needs kcal (or kJ) and all three macros per 100 g, else null.
 * A label serving in ml goes through the density table and is never read as grams (HANDOFF #14).
 */
export function parseOffProduct(data: unknown): OffProduct | null {
  if (!isRecord(data) || !isRecord(data.product)) return null;
  const product = data.product;
  const n = isRecord(product.nutriments) ? product.nutriments : {};
  const kcal = offNumber(n["energy-kcal_100g"]) ?? (() => {
    const kj = offNumber(n["energy-kj_100g"]) ?? offNumber(n.energy_100g);
    return kj === null ? null : kj / KJ_PER_KCAL;
  })();
  const protein = offNumber(n.proteins_100g);
  const carbs = offNumber(n.carbohydrates_100g);
  const fat = offNumber(n.fat_100g);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  const sodiumG = offNumber(n.sodium_100g);
  const brand = typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() ?? "" : "";
  const baseName = typeof product.product_name === "string" ? product.product_name.trim() : "";
  if (baseName === "") return null;
  const name = brand !== "" && !baseName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${baseName}` : baseName;

  let servingGrams: number | null = null;
  const servingQty = offNumber(product.serving_quantity);
  const servingUnit = typeof product.serving_quantity_unit === "string" ? product.serving_quantity_unit.trim().toLowerCase() : "";
  if (servingQty !== null && servingQty > 0 && servingUnit !== "") {
    const portion = resolvePortion({ quantity: servingQty, unit: servingUnit }, { foodName: name });
    servingGrams = portion.status === "resolved" && (portion.method === "mass" || portion.method === "volume") ? portion.grams : null;
  }
  return {
    name: name.slice(0, 120),
    per100g: {
      kcal,
      protein,
      carbs,
      fat,
      fiber: offNumber(n.fiber_100g),
      sugar: offNumber(n.sugars_100g),
      sodiumMg: sodiumG === null ? null : sodiumG * 1000,
    },
    servingGrams,
  };
}

/** A barcode already cached in `foods`, with its serving grams. */
export const cachedProduct = internalQuery({
  args: { barcode: v.string() },
  returns: v.union(barcodeFoodValidator, v.null()),
  handler: async (ctx, { barcode }) => {
    const food = await ctx.db
      .query("foods")
      .withIndex("by_source_and_sourceId", (q) => q.eq("source", "off").eq("sourceId", barcode))
      .unique();
    if (food === null) return null;
    const serving = await ctx.db
      .query("food_portions")
      .withIndex("by_foodId_and_description", (q) => q.eq("foodId", food._id).eq("description", OFF_SERVING))
      .unique();
    return { foodId: food._id, name: food.name, per100g: food.per100g, servingGrams: serving?.gramsPerMeasure ?? null };
  },
});

/** Caches an OFF product into `foods` (source "off", unverified) and its label serving into `food_portions`. */
export const cacheProduct = internalMutation({
  args: { barcode: v.string(), name: v.string(), per100g: nutrientsValidator, servingGrams: v.union(v.number(), v.null()) },
  returns: v.id("foods"),
  handler: async (ctx, { barcode, name, per100g, servingGrams }): Promise<Id<"foods">> => {
    const row: Omit<Doc<"foods">, "_id" | "_creationTime"> = {
      name,
      aliases: [],
      searchText: name,
      per100g,
      source: "off",
      sourceId: barcode,
      verified: false,
    };
    const existing = await ctx.db
      .query("foods")
      .withIndex("by_source_and_sourceId", (q) => q.eq("source", "off").eq("sourceId", barcode))
      .unique();
    const foodId = existing === null ? await ctx.db.insert("foods", row) : existing._id;
    if (existing !== null) await ctx.db.replace("foods", existing._id, row);
    const serving = await ctx.db
      .query("food_portions")
      .withIndex("by_foodId_and_description", (q) => q.eq("foodId", foodId).eq("description", OFF_SERVING))
      .unique();
    if (servingGrams === null) {
      if (serving !== null) await ctx.db.delete("food_portions", serving._id);
    } else {
      const portion: Omit<Doc<"food_portions">, "_id" | "_creationTime"> = {
        foodId,
        source: "off",
        measure: OFF_SERVING,
        description: OFF_SERVING,
        gramsPerMeasure: servingGrams,
      };
      if (serving === null) await ctx.db.insert("food_portions", portion);
      else await ctx.db.replace("food_portions", serving._id, portion);
    }
    return foodId;
  },
});

/** Finds a barcode in the cache, else fetches it from OFF and caches it. Null when OFF has no usable product. */
export async function lookupBarcodeFood(ctx: ActionCtx, barcode: string): Promise<BarcodeFood | null> {
  const code = barcode.trim();
  if (!BARCODE_RE.test(code)) throw new Error("Barcode must be 8-14 digits");
  const cached: BarcodeFood | null = await ctx.runQuery(internal.pipeline.barcode.cachedProduct, { barcode: code });
  if (cached !== null) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  let data: unknown;
  try {
    const res = await fetch(offProductUrl(code), {
      headers: { "User-Agent": "Stride/1.0 (personal nutrition tracker)" },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timeout);
  }
  const product = parseOffProduct(data);
  if (product === null) return null;
  const foodId: Id<"foods"> = await ctx.runMutation(internal.pipeline.barcode.cacheProduct, { barcode: code, ...product });
  return { foodId, ...product };
}

/** Barcode scan for the input bar: the cached or freshly fetched product. The client logs it with `entries.addEntries`. */
export const lookupBarcode = action({
  args: { barcode: v.string() },
  returns: v.union(barcodeFoodValidator, v.null()),
  handler: async (ctx, { barcode }): Promise<BarcodeFood | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Unauthenticated");
    return await lookupBarcodeFood(ctx, barcode);
  },
});

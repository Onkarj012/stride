import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const OFF_FIELDS = "product_name,brands,nutriments,code,image_front_small_url,serving_quantity,serving_quantity_unit,ingredients_text_en,completeness";
const LIVE_LOOKUP_TIMEOUT_MS = 2500;
let warnedAboutUsdaDemoKey = false;

function getUsdaApiKey(): string {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey && !warnedAboutUsdaDemoKey) {
    console.warn("USDA_API_KEY is not set; falling back to DEMO_KEY.");
    warnedAboutUsdaDemoKey = true;
  }
  return apiKey || "DEMO_KEY";
}

// ─── Normalized food structure ────────────────────────────────────────────────

interface NormalizedFood {
  name: string;
  brand?: string;
  barcode?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: number;
  servingUnit?: string;
  ingredients?: string;
  imageUrl?: string;
  source: string;
  verified?: boolean;
  fdcId?: string;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeOFFProduct(product: any): NormalizedFood | null {
  const n = product.nutriments || {};
  const cal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0);
  const protein = n["proteins_100g"] ?? 0;
  const carbs = n["carbohydrates_100g"] ?? 0;
  const fat = n["fat_100g"] ?? 0;
  const name = (product.product_name || product.product_name_en || "").trim();
  if (!name || cal < 0) return null;

  return {
    name,
    brand: product.brands ? product.brands.split(",")[0].trim() : undefined,
    barcode: product.code || undefined,
    caloriesPer100g: Math.round(cal),
    proteinPer100g: Math.round(protein * 10) / 10,
    carbsPer100g: Math.round(carbs * 10) / 10,
    fatPer100g: Math.round(fat * 10) / 10,
    servingSize: product.serving_quantity ? Number(product.serving_quantity) : undefined,
    servingUnit: product.serving_quantity_unit || "g",
    ingredients: product.ingredients_text_en || undefined,
    imageUrl: product.image_front_small_url || undefined,
    source: "off",
    verified: (product.completeness ?? 0) > 0.6,
  };
}

function normalizeUSDAFood(food: any): NormalizedFood | null {
  const nutrients: any[] = food.foodNutrients || [];
  const get = (id: number) => nutrients.find((n: any) => n.nutrientId === id)?.value ?? 0;
  const cal = get(1008);
  const name = (food.description || "").trim();
  if (!name) return null;

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    brand: food.brandName || food.brandOwner || undefined,
    caloriesPer100g: Math.round(cal),
    proteinPer100g: Math.round(get(1003) * 10) / 10,
    carbsPer100g: Math.round(get(1005) * 10) / 10,
    fatPer100g: Math.round(get(1004) * 10) / 10,
    source: "usda",
    verified: true,
    fdcId: String(food.fdcId),
  };
}

// ─── Internal DB functions ────────────────────────────────────────────────────

export const searchFoodsInCache = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query: q }) => {
    if (!q.trim()) return [];
    return ctx.db
      .query("food_cache")
      .withSearchIndex("by_name_search", (s) => s.search("name", q))
      .take(12);
  },
});

export const getFoodByBarcode = internalQuery({
  args: { barcode: v.string() },
  handler: async (ctx, { barcode }) => {
    return ctx.db
      .query("food_cache")
      .withIndex("by_barcode", (q) => q.eq("barcode", barcode))
      .unique();
  },
});

export const cacheFood = internalMutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    barcode: v.optional(v.string()),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatPer100g: v.number(),
    servingSize: v.optional(v.number()),
    servingUnit: v.optional(v.string()),
    ingredients: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    source: v.string(),
    verified: v.optional(v.boolean()),
    fdcId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Avoid duplicates (same name + source)
    const existing = await ctx.db
      .query("food_cache")
      .withSearchIndex("by_name_search", (q) => q.search("name", args.name))
      .filter((q) => q.eq(q.field("source"), args.source))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("food_cache", { ...args, searchCount: 0 });
  },
});

export const bumpSearchCount = internalMutation({
  args: { id: v.id("food_cache") },
  handler: async (ctx, { id }) => {
    const food = await ctx.db.get(id);
    if (food) await ctx.db.patch(id, { searchCount: (food.searchCount ?? 0) + 1 });
  },
});

async function fetchJsonWithTimeout(url: string, init?: RequestInit): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheFoods(ctx: any, foods: NormalizedFood[]) {
  const cached: Array<NormalizedFood & { _id?: string }> = [];
  for (const food of foods) {
    try {
      const id = await ctx.runMutation(internal.foods.cacheFood, {
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        caloriesPer100g: food.caloriesPer100g,
        proteinPer100g: food.proteinPer100g,
        carbsPer100g: food.carbsPer100g,
        fatPer100g: food.fatPer100g,
        servingSize: food.servingSize,
        servingUnit: food.servingUnit,
        ingredients: food.ingredients,
        imageUrl: food.imageUrl,
        source: food.source,
        verified: food.verified,
        fdcId: food.fdcId,
      });
      cached.push({ ...food, _id: id });
    } catch {
      cached.push(food);
    }
  }
  return cached;
}

export const searchFoodsLive = internalAction({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query: q, limit = 8 }): Promise<Array<NormalizedFood & { _id?: string }>> => {
    const trimmed = q.trim();
    if (!trimmed) return [];

    const offUrl = `${OFF_SEARCH_URL}?search_terms=${encodeURIComponent(trimmed)}&search_simple=1&action=process&json=1&page_size=${Math.min(limit, 8)}&fields=${OFF_FIELDS}`;
    const usdaKey = getUsdaApiKey();
    const usdaUrl = `${USDA_SEARCH_URL}?query=${encodeURIComponent(trimmed)}&pageSize=${Math.min(limit, 6)}&api_key=${usdaKey}`;

    const [offData, usdaData] = await Promise.all([
      fetchJsonWithTimeout(offUrl, { headers: { "User-Agent": "Stride Fitness App" } }),
      fetchJsonWithTimeout(usdaUrl),
    ]);

    const foods: NormalizedFood[] = [];
    for (const p of (offData?.products || [])) {
      const norm = normalizeOFFProduct(p);
      if (norm) foods.push(norm);
    }
    for (const f of (usdaData?.foods || []).slice(0, limit)) {
      const norm = normalizeUSDAFood(f);
      if (norm) foods.push(norm);
    }

    return (await cacheFoods(ctx, foods)).slice(0, limit);
  },
});

// ─── Public queries ───────────────────────────────────────────────────────────

export const getRecentFoods = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("food_cache")
      .withIndex("by_search_count")
      .order("desc")
      .take(20);
  },
});

// ─── Food search action ───────────────────────────────────────────────────────

export const searchFoods = action({
  args: { query: v.string() },
  handler: async (ctx, { query: q }): Promise<NormalizedFood[]> => {
    const trimmed = q.trim();
    if (!trimmed) return [];

    // 1. Search local cache first
    const cached = (await ctx.runQuery(internal.foods.searchFoodsInCache, { query: trimmed })) as any[];

    // Rank: verified + high searchCount first, exact match boosted
    const ranked = cached
      .map((f: any) => {
        let score = 0;
        const nameLower = f.name.toLowerCase();
        const qLower = trimmed.toLowerCase();
        if (nameLower === qLower) score += 100;
        else if (nameLower.startsWith(qLower)) score += 50;
        if (f.verified) score += 20;
        if (f.brand) score += 5;
        score += Math.min(f.searchCount ?? 0, 20);
        return { ...f, _score: score };
      })
      .sort((a: any, b: any) => b._score - a._score);

    if (ranked.length >= 8) {
      for (const item of ranked) {
        ctx.runMutation(internal.foods.bumpSearchCount, { id: item._id }).catch(() => {});
      }
      return ranked.slice(0, 12);
    }

    // 2. Query Open Food Facts
    const offResults: NormalizedFood[] = [];
    try {
      const url = `${OFF_SEARCH_URL}?search_terms=${encodeURIComponent(trimmed)}&search_simple=1&action=process&json=1&page_size=8&fields=${OFF_FIELDS}`;
      const res = await fetch(url, { headers: { "User-Agent": "Stride Fitness App" } });
      if (res.ok) {
        const data = await res.json() as any;
        for (const p of (data.products || [])) {
          const norm = normalizeOFFProduct(p);
          if (norm) offResults.push(norm);
        }
      }
    } catch { /* ignore */ }

    // 3. Query USDA for generic/raw foods
    const usdaResults: NormalizedFood[] = [];
    try {
      const apiKey = getUsdaApiKey();
      const url = `${USDA_SEARCH_URL}?query=${encodeURIComponent(trimmed)}&pageSize=6&api_key=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        for (const f of (data.foods || []).slice(0, 6)) {
          const norm = normalizeUSDAFood(f);
          if (norm) usdaResults.push(norm);
        }
      }
    } catch { /* ignore */ }

    // 4. Cache new results asynchronously
    const newFoods = [...offResults, ...usdaResults];
    for (const food of newFoods) {
      try {
        await ctx.runMutation(internal.foods.cacheFood, {
          name: food.name,
          brand: food.brand,
          barcode: food.barcode,
          caloriesPer100g: food.caloriesPer100g,
          proteinPer100g: food.proteinPer100g,
          carbsPer100g: food.carbsPer100g,
          fatPer100g: food.fatPer100g,
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
          ingredients: food.ingredients,
          imageUrl: food.imageUrl,
          source: food.source,
          verified: food.verified,
          fdcId: food.fdcId,
        });
      } catch { /* skip duplicates */ }
    }

    // 5. Bump search counts for all ranked cached results (fire-and-forget)
    for (const item of ranked) {
      ctx.runMutation(internal.foods.bumpSearchCount, { id: item._id }).catch(() => {});
    }

    // 6. Merge and deduplicate by name
    const seen = new Set<string>(ranked.map((f: any) => f.name.toLowerCase()));
    const merged: any[] = [...ranked];
    for (const f of newFoods) {
      const key = f.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(f);
      }
    }

    return merged.slice(0, 15);
  },
});

// ─── Barcode lookup action ────────────────────────────────────────────────────

export const lookupBarcode = action({
  args: { barcode: v.string() },
  handler: async (ctx, { barcode }): Promise<NormalizedFood | null> => {
    // 1. Check local cache
    const cached = await ctx.runQuery(internal.foods.getFoodByBarcode, { barcode }) as any;
    if (cached) {
      await ctx.runMutation(internal.foods.bumpSearchCount, { id: cached._id });
      return {
        name: cached.name,
        brand: cached.brand,
        barcode: cached.barcode,
        caloriesPer100g: cached.caloriesPer100g,
        proteinPer100g: cached.proteinPer100g,
        carbsPer100g: cached.carbsPer100g,
        fatPer100g: cached.fatPer100g,
        servingSize: cached.servingSize,
        servingUnit: cached.servingUnit,
        imageUrl: cached.imageUrl,
        source: cached.source,
        verified: cached.verified,
      };
    }

    // 2. Query Open Food Facts
    try {
      const url = `${OFF_PRODUCT_URL}/${barcode}.json?fields=${OFF_FIELDS}`;
      const res = await fetch(url, { headers: { "User-Agent": "Stride Fitness App" } });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.status === 1 && data.product) {
          const norm = normalizeOFFProduct(data.product);
          if (norm) {
            norm.barcode = barcode;
            await ctx.runMutation(internal.foods.cacheFood, {
              ...norm,
              brand: norm.brand,
              barcode: norm.barcode,
              servingSize: norm.servingSize,
              servingUnit: norm.servingUnit,
              ingredients: norm.ingredients,
              imageUrl: norm.imageUrl,
              verified: norm.verified,
            });
            return norm;
          }
        }
      }
    } catch { /* ignore */ }

    // 3. Not found anywhere — return null to trigger manual entry
    return null;
  },
});

// ─── Compute nutrition for a portion ─────────────────────────────────────────

export function computeNutrition(food: NormalizedFood, grams: number) {
  const ratio = grams / 100;
  return {
    calories: Math.round(food.caloriesPer100g * ratio),
    protein: Math.round(food.proteinPer100g * ratio * 10) / 10,
    carbs: Math.round(food.carbsPer100g * ratio * 10) / 10,
    fat: Math.round(food.fatPer100g * ratio * 10) / 10,
  };
}

import { hasAtwaterMismatch, type Nutrients } from "@stride/core";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, mutation } from "./_generated/server";
import { callOpenRouter, isRecord, PHOTO_MODEL } from "./pipeline/openrouter";
import { requireOwnUpload } from "./uploads";
import { imageUrl } from "./pipeline/log";
import { saveUserFoodRow } from "./foods_db";
import { assertLedgerWritable } from "./users";

export type LabelBasis = "per_100g" | "per_100ml" | "per_serving";
export type LabelEnergyUnit = "kcal" | "kJ";
export type LabelServingUnit = "g" | "ml";

/** One field read from the printed nutrition panel, with null meaning unreadable or absent. */
export interface LabelNutritionCandidate {
  name: string | null;
  basis: LabelBasis | null;
  servingAmount: number | null;
  servingUnit: LabelServingUnit | null;
  energy: number | null;
  energyUnit: LabelEnergyUnit | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodiumMg: number | null;
}

/** Turns a user-reviewed required nutrient into a finite nonnegative number. */
function requiredLabelValue(field: string, value: number | null): number {
  if (value === null || !Number.isFinite(value) || value < 0) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: `Enter a valid ${field} value from the label.` });
  }
  return value;
}

/** Rejects incomplete values and converts a reviewed label basis into nutrients per 100 g. */
export function normalizeLabelNutrients(candidate: {
  basis: LabelBasis;
  servingAmount: number | null;
  servingUnit?: LabelServingUnit | null;
  densityGramsPer100ml?: number | null;
  energy: number | null;
  energyUnit: LabelEnergyUnit;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodiumMg: number | null;
}): Nutrients {
  const energy = requiredLabelValue("energy", candidate.energy);
  const protein = requiredLabelValue("protein", candidate.protein);
  const carbs = requiredLabelValue("carbs", candidate.carbs);
  const fat = requiredLabelValue("fat", candidate.fat);
  const optional = [candidate.fiber, candidate.sugar, candidate.sodiumMg];
  if (optional.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Optional nutrition values must be zero or higher." });
  }
  if (candidate.servingAmount !== null && (!Number.isFinite(candidate.servingAmount) || candidate.servingAmount <= 0)) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Serving size must be above zero." });
  }
  if ((candidate.servingAmount === null) !== (candidate.servingUnit === null)) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Check both the serving size and its unit." });
  }
  if (candidate.densityGramsPer100ml !== undefined && candidate.densityGramsPer100ml !== null && (!Number.isFinite(candidate.densityGramsPer100ml) || candidate.densityGramsPer100ml <= 0)) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Grams in 100 ml must be above zero." });
  }
  let grams = 100;
  if (candidate.basis === "per_100ml") {
    const density = candidate.densityGramsPer100ml;
    if (density === null || density === undefined || !Number.isFinite(density) || density <= 0) {
      throw new ConvexError({ code: "LABEL_MASS_REQUIRED", message: "Enter how many grams are in 100 ml before saving." });
    }
    grams = density;
  } else if (candidate.basis === "per_serving") {
    const amount = candidate.servingAmount;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      throw new ConvexError({ code: "LABEL_MASS_REQUIRED", message: "Enter the serving size from the label." });
    }
    if (candidate.servingUnit === "g") grams = amount;
    else if (candidate.servingUnit === "ml") {
      const density = candidate.densityGramsPer100ml;
      if (density === null || density === undefined || !Number.isFinite(density) || density <= 0) {
        throw new ConvexError({ code: "LABEL_MASS_REQUIRED", message: "Enter how many grams are in 100 ml before saving." });
      }
      grams = (amount * density) / 100;
    } else throw new ConvexError({ code: "LABEL_MASS_REQUIRED", message: "Choose whether the serving amount is g or ml." });
  }
  const factor = 100 / grams;
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(factor)) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Check the serving amount and density values." });
  }
  const values: Nutrients = {
    kcal: energy * (candidate.energyUnit === "kJ" ? 1 / 4.184 : 1) * factor,
    protein: protein * factor,
    carbs: carbs * factor,
    fat: fat * factor,
    fiber: candidate.fiber === null ? null : candidate.fiber * factor,
    sugar: candidate.sugar === null ? null : candidate.sugar * factor,
    sodiumMg: candidate.sodiumMg === null ? null : candidate.sodiumMg * factor,
  };
  if (Object.values(values).some((value) => value !== null && !Number.isFinite(value))) {
    throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Those values exceed the usable range. Check the label digits and serving size." });
  }
  if (values.protein + values.carbs + values.fat > 100) throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Protein, carbohydrate and fat exceed 100 g per 100 g. Check the label values." });
  if (hasAtwaterMismatch(values)) throw new ConvexError({ code: "LABEL_REVIEW_REQUIRED", message: "Energy does not match the macros. Check the label values and units." });
  return values;
}

/** Saves a reviewed label as a private, explicitly unverified personal food. */
export const saveReviewedLabel = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    basis: v.union(v.literal("per_100g"), v.literal("per_100ml"), v.literal("per_serving")),
    servingAmount: v.union(v.number(), v.null()),
    servingUnit: v.union(v.literal("g"), v.literal("ml"), v.null()),
    densityGramsPer100ml: v.union(v.number(), v.null()),
    energy: v.union(v.number(), v.null()),
    energyUnit: v.union(v.literal("kcal"), v.literal("kJ")),
    protein: v.union(v.number(), v.null()),
    carbs: v.union(v.number(), v.null()),
    fat: v.union(v.number(), v.null()),
    fiber: v.union(v.number(), v.null()),
    sugar: v.union(v.number(), v.null()),
    sodiumMg: v.union(v.number(), v.null()),
  },
  returns: v.id("foods"),
  handler: async (ctx, args): Promise<Id<"foods">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    const userId = identity.subject;
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings?.foodShortcutsEnabled !== true) throw new ConvexError({ code: "FOOD_SHORTCUTS_DISABLED", message: "Turn on saved meals and label capture in Settings first." });
    await assertLedgerWritable(ctx, userId);
    const per100g = normalizeLabelNutrients(args);
    return await saveUserFoodRow(ctx, userId, args.name, [], per100g, {
      storageId: args.storageId,
      basis: args.basis,
      servingAmount: args.servingAmount,
      servingUnit: args.servingUnit,
      densityGramsPer100ml: args.densityGramsPer100ml,
    });
  },
});

/** Reads a nutrition panel from an owned upload and returns nulls for anything the model cannot read. */
export const readNutritionLabel = action({
  args: { storageId: v.id("_storage") },
  returns: v.object({
    name: v.union(v.string(), v.null()),
    basis: v.union(v.literal("per_100g"), v.literal("per_100ml"), v.literal("per_serving"), v.null()),
    servingAmount: v.union(v.number(), v.null()),
    servingUnit: v.union(v.literal("g"), v.literal("ml"), v.null()),
    energy: v.union(v.number(), v.null()),
    energyUnit: v.union(v.literal("kcal"), v.literal("kJ"), v.null()),
    protein: v.union(v.number(), v.null()),
    carbs: v.union(v.number(), v.null()),
    fat: v.union(v.number(), v.null()),
    fiber: v.union(v.number(), v.null()),
    sugar: v.union(v.number(), v.null()),
    sodiumMg: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { storageId }): Promise<LabelNutritionCandidate> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Unauthenticated" });
    const userId = identity.subject;
    const enabled: boolean = await ctx.runQuery(internal.food_shortcuts.enabled, { userId });
    if (!enabled) throw new ConvexError({ code: "FOOD_SHORTCUTS_DISABLED", message: "Turn on saved meals and label capture in Settings first." });
    await requireOwnUpload(ctx, userId, storageId);
    const photoUrl = await imageUrl(ctx, storageId);
    const result = await callOpenRouter(ctx, userId, {
      model: PHOTO_MODEL,
      maxTokens: 500,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "nutrition_label",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: ["string", "null"] },
              basis: { type: ["string", "null"], enum: ["per_100g", "per_100ml", "per_serving", null] },
              servingAmount: { type: ["number", "null"] },
              servingUnit: { type: ["string", "null"], enum: ["g", "ml", null] },
              energy: { type: ["number", "null"] },
              energyUnit: { type: ["string", "null"], enum: ["kcal", "kJ", null] },
              protein: { type: ["number", "null"] },
              carbs: { type: ["number", "null"] },
              fat: { type: ["number", "null"] },
              fiber: { type: ["number", "null"] },
              sugar: { type: ["number", "null"] },
              sodiumMg: { type: ["number", "null"] },
            },
            required: ["name", "basis", "servingAmount", "servingUnit", "energy", "energyUnit", "protein", "carbs", "fat", "fiber", "sugar", "sodiumMg"],
          },
        },
      },
      messages: [
        { role: "system", content: "Read only printed values visible in the nutrition panel. Do not estimate or infer any number, serving size, or unit. Use null for every absent, illegible, or ambiguous value. Read the basis exactly as per 100 g, per 100 ml, or per serving. Return the energy unit exactly as printed, kcal or kJ. Sodium must be in mg; if only salt is shown, return null. Do not treat the confirmation step as proof that values are lab verified." },
        { role: "user", content: [
          { type: "text", text: "Read the nutrition label in this package photo." },
          { type: "image_url", image_url: { url: photoUrl } },
        ] },
      ],
    });
    if (result.content === null) throw new ConvexError({ code: "LABEL_UNREADABLE", message: "I couldn't read this nutrition panel. Try a clearer photo." });
    let value: unknown;
    try {
      value = JSON.parse(result.content);
    } catch {
      throw new ConvexError({ code: "LABEL_UNREADABLE", message: "I couldn't read this nutrition panel. Try a clearer photo." });
    }
    if (!isRecord(value)) throw new ConvexError({ code: "LABEL_UNREADABLE", message: "I couldn't read this nutrition panel. Try a clearer photo." });
    return candidateFrom(value);
  },
});

/** Keeps only typed label fields and turns malformed values into null for review. */
function candidateFrom(value: Record<string, unknown>): LabelNutritionCandidate {
  const number = (key: string) => {
    const current = value[key];
    return typeof current === "number" && Number.isFinite(current) ? current : null;
  };
  const text = (key: string) => {
    const current = value[key];
    return typeof current === "string" ? current : null;
  };
  const basis = value.basis === "per_100g" || value.basis === "per_100ml" || value.basis === "per_serving" ? value.basis : null;
  const servingUnit = value.servingUnit === "g" || value.servingUnit === "ml" ? value.servingUnit : null;
  const energyUnit = value.energyUnit === "kcal" || value.energyUnit === "kJ" ? value.energyUnit : null;
  return {
    name: text("name"), basis, servingAmount: number("servingAmount"), servingUnit, energy: number("energy"), energyUnit,
    protein: number("protein"), carbs: number("carbs"), fat: number("fat"), fiber: number("fiber"), sugar: number("sugar"), sodiumMg: number("sodiumMg"),
  };
}

import { daysBetween, isLocalDate, roundNutrients, type Nutrients } from "@stride/core";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { nutrientsValidator } from "./ledger_validators";
import { localDateOrToday, requireUserId } from "./time_zone";

type DayTotalsRow = Omit<Doc<"day_totals">, "_id" | "_creationTime">;
type OptionalKey = "fiber" | "sugar" | "sodiumMg";

/** Most live entries one user may have on one day. Keeps `entriesForDay` a bounded read. */
export const MAX_DAY_ENTRIES = 200;

/** Longest span `dayTotalsInRange` returns, in days inclusive. One row per day keeps the read bounded. */
export const MAX_TOTALS_RANGE_DAYS = 62;

/** Optional nutrients and the counter of live entries that lack each one. */
const UNKNOWN_COUNTER = { fiber: "fiberUnknown", sugar: "sugarUnknown", sodiumMg: "sodiumMgUnknown" } as const;
const OPTIONAL_KEYS: readonly OptionalKey[] = ["fiber", "sugar", "sodiumMg"];

/** Adds (sign 1) or removes (sign -1) one live entry's unrounded nutrients from its day's running totals. */
export async function applyToDayTotals(
  ctx: MutationCtx,
  userId: string,
  localDate: string,
  nutrients: Nutrients,
  sign: 1 | -1,
): Promise<void> {
  const existing = await ctx.db
    .query("day_totals")
    .withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", localDate))
    .unique();
  const base: DayTotalsRow = existing === null ? emptyTotals(userId, localDate) : withoutSystemFields(existing);
  const next: DayTotalsRow = {
    ...base,
    entryCount: base.entryCount + sign,
    kcal: base.kcal + sign * nutrients.kcal,
    protein: base.protein + sign * nutrients.protein,
    carbs: base.carbs + sign * nutrients.carbs,
    fat: base.fat + sign * nutrients.fat,
  };
  for (const key of OPTIONAL_KEYS) {
    const value = nutrients[key];
    const counter = UNKNOWN_COUNTER[key];
    if (value === null) next[counter] = base[counter] + sign;
    else next[key] = base[key] + sign * value;
  }
  if (next.entryCount < 0) throw new Error(`day_totals underflow for ${localDate}`);
  if (next.entryCount > MAX_DAY_ENTRIES) throw new Error(`A day holds at most ${MAX_DAY_ENTRIES} entries`);
  // Floating-point add then subtract can leave dust like 1e-13; an empty day is exactly zero.
  const row = next.entryCount === 0 ? emptyTotals(userId, localDate) : next;
  if (existing === null) await ctx.db.insert("day_totals", row);
  else await ctx.db.replace("day_totals", existing._id, row);
}

/** A stored totals row minus `_id` and `_creationTime`, ready for `replace`. */
function withoutSystemFields(doc: Doc<"day_totals">): DayTotalsRow {
  const { _id, _creationTime, ...fields } = doc;
  return fields;
}

/** A zeroed totals row for one day. */
function emptyTotals(userId: string, localDate: string): DayTotalsRow {
  return {
    userId,
    localDate,
    entryCount: 0,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodiumMg: 0,
    fiberUnknown: 0,
    sugarUnknown: 0,
    sodiumMgUnknown: 0,
  };
}

/** Unrounded nutrients of a totals row; an optional nutrient is null while any live entry lacks it. */
export function totalsToNutrients(row: DayTotalsRow): Nutrients {
  return {
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiberUnknown > 0 ? null : row.fiber,
    sugar: row.sugarUnknown > 0 ? null : row.sugar,
    sodiumMg: row.sodiumMgUnknown > 0 ? null : row.sodiumMg,
  };
}

/** Day totals for the caller, rounded once. Defaults to today in the caller's zone. */
export const dayTotals = query({
  args: { localDate: v.optional(v.string()) },
  returns: v.object({ localDate: v.string(), entryCount: v.number(), nutrients: nutrientsValidator }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const localDate = await localDateOrToday(ctx, userId, args.localDate);
    const row = await ctx.db
      .query("day_totals")
      .withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).eq("localDate", localDate))
      .unique();
    const totals = row ?? emptyTotals(userId, localDate);
    return { localDate, entryCount: totals.entryCount, nutrients: roundNutrients(totalsToNutrients(totals)) };
  },
});

/** The caller's logged days from `from` to `to` inclusive, oldest first, each rounded once. Days with no live entries are left out. */
export const dayTotalsInRange = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(v.object({ localDate: v.string(), entryCount: v.number(), nutrients: nutrientsValidator })),
  handler: async (ctx, { from, to }) => {
    const userId = await requireUserId(ctx);
    if (!isLocalDate(from) || !isLocalDate(to)) throw new Error("from and to must be YYYY-MM-DD dates");
    const span = daysBetween(from, to) + 1;
    if (span < 1 || span > MAX_TOTALS_RANGE_DAYS) {
      throw new Error(`Range must cover 1-${MAX_TOTALS_RANGE_DAYS} days, got ${span}`);
    }
    const rows = await ctx.db
      .query("day_totals")
      .withIndex("by_userId_and_localDate", (q) => q.eq("userId", userId).gte("localDate", from).lte("localDate", to))
      .take(MAX_TOTALS_RANGE_DAYS);
    return rows
      .filter((row) => row.entryCount > 0)
      .map((row) => ({ localDate: row.localDate, entryCount: row.entryCount, nutrients: roundNutrients(totalsToNutrients(row)) }));
  },
});

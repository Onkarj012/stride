import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface PatternInput {
  meals: { date: string; protein: number }[];
  workouts: { date: string }[];
  sleep: { date: string; hours?: number }[];
  water: { date: string; ml: number }[];
  proteinTarget: number;
  waterTarget: number;
}

function dow(date: string): number {
  return new Date(date + "T00:00:00").getDay();
}
function nextDate(date: string): string {
  return new Date(new Date(date + "T00:00:00").getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** Deterministic pattern detection with thresholds to avoid noise on sparse data. */
export function derivePatterns(input: PatternInput): string[] {
  const out: { text: string; salience: number }[] = [];

  // 1. Protein by day-of-week — find the weekday most below the overall daily avg.
  const proteinByDate = new Map<string, number>();
  for (const m of input.meals) proteinByDate.set(m.date, (proteinByDate.get(m.date) ?? 0) + m.protein);
  if (proteinByDate.size >= 7) {
    const sums = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
    let grand = 0;
    for (const [date, p] of proteinByDate) {
      sums[dow(date)].total += p;
      sums[dow(date)].days += 1;
      grand += p;
    }
    const overallAvg = grand / proteinByDate.size;
    let worst = -1;
    let worstAvg = Infinity;
    sums.forEach((s, i) => {
      if (s.days >= 2) {
        const avg = s.total / s.days;
        if (avg < worstAvg) { worstAvg = avg; worst = i; }
      }
    });
    if (worst >= 0 && worstAvg < overallAvg * 0.8) {
      out.push({
        text: `You tend to fall short on protein on ${DOW[worst]}s (avg ${Math.round(worstAvg)}g vs ${Math.round(overallAvg)}g overall).`,
        salience: (overallAvg - worstAvg) / overallAvg,
      });
    }
  }

  // 2. Sleep → next-day activity.
  if (input.sleep.length >= 5) {
    const workoutDates = new Set(input.workouts.map((w) => w.date));
    let poorNights = 0, poorThenActive = 0, goodNights = 0, goodThenActive = 0;
    for (const s of input.sleep) {
      if (s.hours == null) continue;
      const active = workoutDates.has(nextDate(s.date));
      if (s.hours < 6.5) { poorNights++; if (active) poorThenActive++; }
      else { goodNights++; if (active) goodThenActive++; }
    }
    if (poorNights >= 2 && goodNights >= 2) {
      const poorRate = poorThenActive / poorNights;
      const goodRate = goodThenActive / goodNights;
      if (goodRate - poorRate >= 0.3) {
        out.push({
          text: `After nights under 6.5h sleep, you train ${Math.round(poorRate * 100)}% of the time vs ${Math.round(goodRate * 100)}% after good sleep.`,
          salience: goodRate - poorRate,
        });
      }
    }
  }

  // 3. Hydration adherence.
  const waterByDate = new Map<string, number>();
  for (const w of input.water) waterByDate.set(w.date, (waterByDate.get(w.date) ?? 0) + w.ml);
  if (waterByDate.size >= 5) {
    const hit = Array.from(waterByDate.values()).filter((ml) => ml >= input.waterTarget).length;
    const rate = hit / waterByDate.size;
    if (rate < 0.5) {
      out.push({
        text: `You hit your hydration goal on only ${Math.round(rate * 100)}% of logged days — an easy win to target.`,
        salience: 0.5 - rate,
      });
    }
  }

  // 4. Recovery cadence.
  if (input.workouts.length >= 3) {
    const dates = Array.from(new Set(input.workouts.map((w) => w.date))).sort();
    let maxGap = 0;
    for (let i = 1; i < dates.length; i++) {
      const gap = Math.round(
        (new Date(dates[i] + "T00:00:00").getTime() - new Date(dates[i - 1] + "T00:00:00").getTime()) / 86_400_000,
      );
      if (gap > maxGap) maxGap = gap;
    }
    if (maxGap >= 5) {
      out.push({
        text: `Your longest training gap was ${maxGap} days — shorter, more frequent sessions may help consistency.`,
        salience: Math.min(1, maxGap / 14),
      });
    }
  }

  return out.sort((a, b) => b.salience - a.salience).slice(0, 3).map((p) => p.text);
}

export const getPatterns = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const userId = await requireUserId(ctx);
    const windowDays = days ?? 28;
    const start = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

    const between = (table: "meals" | "workouts" | "sleep_logs" | "water_logs") =>
      ctx.db
        .query(table)
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", start))
        .collect();

    const [meals, workouts, sleep, water, profile] = await Promise.all([
      between("meals"),
      between("workouts"),
      between("sleep_logs"),
      between("water_logs"),
      ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ]);

    return derivePatterns({
      meals: meals.map((m: any) => ({ date: m.date, protein: m.protein })),
      workouts: workouts.map((w: any) => ({ date: w.date })),
      sleep: sleep.filter((s: any) => !s.undoneAt && (!s.kind || s.kind === "sleep")).map((s: any) => ({ date: s.date, hours: s.hours })),
      water: water.map((w: any) => ({ date: w.date, ml: w.ml })),
      proteinTarget: profile?.proteinTarget ?? 90,
      waterTarget: profile?.waterTarget ?? 2000,
    });
  },
});

export const getPatternsForContext = internalQuery({
  args: { userId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { userId, days = 28 }) => {
    const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const between = (table: "meals" | "workouts" | "sleep_logs" | "water_logs") =>
      ctx.db
        .query(table)
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", start))
        .collect();
    const [meals, workouts, sleep, water, profile] = await Promise.all([
      between("meals"),
      between("workouts"),
      between("sleep_logs"),
      between("water_logs"),
      ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ]);
    return derivePatterns({
      meals: meals.map((m: any) => ({ date: m.date, protein: m.protein })),
      workouts: workouts.map((w: any) => ({ date: w.date })),
      sleep: sleep.filter((s: any) => !s.undoneAt && (!s.kind || s.kind === "sleep")).map((s: any) => ({ date: s.date, hours: s.hours })),
      water: water.map((w: any) => ({ date: w.date, ml: w.ml })),
      proteinTarget: profile?.proteinTarget ?? 90,
      waterTarget: profile?.waterTarget ?? 2000,
    });
  },
});

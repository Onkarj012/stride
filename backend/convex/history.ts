import { query } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export const getCalendar = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, { year, month }) => {
    const userId = await requireUserId(ctx);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const [mealRows, workoutRows] = await Promise.all([
      ctx.db
        .query("meals")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), endDate))
        .collect(),
      ctx.db
        .query("workouts")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), endDate))
        .collect(),
    ]);

    const result: Record<string, { meals: number; workouts: number; calories: number; burned: number }> = {};
    for (const m of mealRows) {
      const r = result[m.date] ?? { meals: 0, workouts: 0, calories: 0, burned: 0 };
      result[m.date] = { ...r, meals: r.meals + 1, calories: r.calories + m.calories };
    }
    for (const w of workoutRows) {
      const r = result[w.date] ?? { meals: 0, workouts: 0, calories: 0, burned: 0 };
      result[w.date] = { ...r, workouts: r.workouts + 1, burned: r.burned + (w.caloriesBurned ?? 0) };
    }
    // Round calories
    for (const k of Object.keys(result)) {
      result[k].calories = Math.round(result[k].calories);
      result[k].burned = Math.round(result[k].burned);
    }
    return result;
  },
});

export const getDayHistory = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const [mealRows, workoutRows] = await Promise.all([
      ctx.db
        .query("meals")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
        .order("asc")
        .collect(),
      ctx.db
        .query("workouts")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
        .collect(),
    ]);
    return {
      meals: mealRows.map((m: any) => ({
        _id: m._id,
        name: m.name,
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
        time: m.time,
        mealType: m.mealType,
        aiSuggestion: m.aiSuggestion,
        date: m.date,
      })),
      workouts: workoutRows.map((w: any) => ({
        _id: w._id,
        name: w.name,
        intensity: w.intensity,
        duration: w.duration,
        sets: w.sets,
        exercises: w.exercises ?? null,
        caloriesBurned: w.caloriesBurned ?? null,
        date: w.date,
        rationale: w.rationale ?? null,
      })),
    };
  },
});

export const getHistoryInsights = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const userId = await requireUserId(ctx);
    const dayCount = Math.min(90, Math.max(7, days ?? 30));
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - dayCount * 86400000).toISOString().split("T")[0];

    const [mealRows, workoutRows, goalRows] = await Promise.all([
      ctx.db
        .query("meals")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), endDate))
        .collect(),
      ctx.db
        .query("workouts")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), endDate))
        .collect(),
      ctx.db
        .query("daily_goals")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), endDate))
        .order("desc")
        .collect(),
    ]);
    const goalRow = goalRows[0];

    const mealMap = new Map<string, { cals: number; prot: number; carbs: number; fat: number; count: number }>();
    for (const m of mealRows) {
      const e = mealMap.get(m.date) ?? { cals: 0, prot: 0, carbs: 0, fat: 0, count: 0 };
      mealMap.set(m.date, { cals: e.cals + m.calories, prot: e.prot + m.protein, carbs: e.carbs + m.carbs, fat: e.fat + m.fat, count: e.count + 1 });
    }
    const workoutMap = new Map<string, { count: number; burned: number }>();
    for (const w of workoutRows) {
      const e = workoutMap.get(w.date) ?? { count: 0, burned: 0 };
      workoutMap.set(w.date, { count: e.count + 1, burned: e.burned + (w.caloriesBurned ?? 0) });
    }

    const daily = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const m = mealMap.get(dateStr);
      const w = workoutMap.get(dateStr);
      daily.unshift({
        date: dateStr,
        calories: Math.round(m?.cals ?? 0),
        protein: Math.round(m?.prot ?? 0),
        carbs: Math.round(m?.carbs ?? 0),
        fat: Math.round(m?.fat ?? 0),
        meals: m?.count ?? 0,
        workouts: w?.count ?? 0,
        burned: Math.round(w?.burned ?? 0),
      });
    }

    return {
      daily,
      goals: {
        calories: goalRow?.calorieGoal ?? 2400,
        protein: goalRow?.proteinGoal ?? 180,
        carbs: goalRow?.carbGoal ?? 280,
        fat: goalRow?.fatGoal ?? 80,
      },
    };
  },
});

export const getStreak = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const today = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    const [mealRows, workoutRows] = await Promise.all([
      ctx.db
        .query("meals")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), today))
        .collect(),
      ctx.db
        .query("workouts")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", startDate))
        .filter((q: any) => q.lte(q.field("date"), today))
        .collect(),
    ]);

    const datesWithActivity = new Set<string>();
    for (const m of mealRows) datesWithActivity.add(m.date);
    for (const w of workoutRows) datesWithActivity.add(w.date);

    let streak = 0;
    let currentDate = new Date();

    // Check if today has activity, if not start from yesterday
    if (!datesWithActivity.has(today)) {
      currentDate.setDate(currentDate.getDate() - 1);
    }

    // Count consecutive days with activity
    while (true) {
      const dateStr = currentDate.toISOString().split("T")[0];
      if (datesWithActivity.has(dateStr)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
      if (streak > 90) break; // Safety limit
    }

    return { streak, todayLogged: datesWithActivity.has(today) };
  },
});

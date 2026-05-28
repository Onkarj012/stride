import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  return monday.toISOString().split("T")[0];
}

export const getDailyInsights = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("insights")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
    if (!row) return { insights: [] };
    try {
      const parsed = JSON.parse(row.content);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return { insights: parsed };
      }
      return { insights: [row.content] };
    } catch {
      return { insights: [row.content] };
    }
  },
});

export const getWeeklySummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const weekStart = currentWeekStart();
    const row = await ctx.db
      .query("weekly_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStart", weekStart))
      .first();
    if (!row) return null;
    return { content: row.content };
  },
});

export const saveInsights = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    insights: v.array(v.string()),
  },
  handler: async (ctx, { userId, date, insights }) => {
    const content = JSON.stringify(insights);
    const existing = await ctx.db
      .query("insights")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content });
    } else {
      await ctx.db.insert("insights", { userId, date, content });
    }
  },
});

export const saveWeeklySummary = internalMutation({
  args: {
    userId: v.string(),
    weekStart: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { userId, weekStart, content }) => {
    const existing = await ctx.db
      .query("weekly_summaries")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStart", weekStart))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content });
    } else {
      await ctx.db.insert("weekly_summaries", { userId, weekStart, content });
    }
  },
});


// ─── Today's Brief (for HomePage daily guidance) ─────────────────────────────

export const getTodayBrief = query({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, { today: todayArg }) => {
    const userId = await requireUserId(ctx);
    const today = todayArg ?? new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

    const [profile, todayMeals, todayWorkouts, yMeals, yWorkouts, water, sleep] = await Promise.all([
      ctx.db.query("user_profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db.query("meals")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .collect(),
      ctx.db.query("workouts")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .collect(),
      ctx.db.query("meals")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", yesterday))
        .collect(),
      ctx.db.query("workouts")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", yesterday))
        .collect(),
      ctx.db.query("water_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .collect(),
      ctx.db.query("sleep_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .first(),
    ]);

    const calorieTarget = profile?.calorieTarget ?? 2000;
    const proteinTarget = profile?.proteinTarget ?? 90;
    const todayCals = todayMeals.reduce((s, m) => s + m.calories, 0);
    const todayProtein = todayMeals.reduce((s, m) => s + m.protein, 0);
    const yCals = yMeals.reduce((s, m) => s + m.calories, 0);
    const yProtein = yMeals.reduce((s, m) => s + m.protein, 0);
    const waterMl = water.reduce((s, w) => s + w.ml, 0);
    const waterTarget = 2000;

    const hour = new Date().getHours();
    const window: "morning" | "day" | "evening" | "night" =
      hour >= 5 && hour < 11 ? "morning" :
      hour >= 11 && hour < 18 ? "day" :
      hour >= 18 && hour < 22 ? "evening" : "night";

    // Pick the highest-priority insight for the current window
    let headline = "";
    let priority = "";
    let nudgeAction = "";
    let nudgeReason = "";

    if (window === "morning") {
      if (sleep && sleep.hours < 6.5) {
        headline = "Yesterday's sleep was short";
        priority = `You slept ${sleep.hours.toFixed(1)}h. Today, keep activity moderate and aim for an earlier wind-down.`;
      } else if (yProtein > 0 && yProtein < proteinTarget * 0.7) {
        headline = "Front-load protein today";
        priority = `Yesterday hit ${Math.round(yProtein)}g of ${proteinTarget}g protein. A high-protein breakfast sets the day right.`;
      } else if (yMeals.length === 0 && yWorkouts.length === 0) {
        headline = "Fresh start";
        priority = "No logs yesterday — let's keep it light and steady today. Start with breakfast.";
      } else {
        headline = "Morning, let's go";
        priority = `Yesterday: ${Math.round(yCals)}kcal, ${yWorkouts.length} workout${yWorkouts.length !== 1 ? "s" : ""}. Keep that rhythm.`;
      }
      nudgeAction = "Log breakfast or set today's intent";
      nudgeReason = todayMeals.length === 0 ? "Nothing logged yet today" : `${todayMeals.length} logged so far`;
    } else if (window === "day") {
      const remaining = Math.max(0, calorieTarget - todayCals);
      if (todayMeals.length === 0 && hour >= 13) {
        headline = "Mid-day check";
        priority = "Haven't logged a meal yet. Want help estimating something quick?";
      } else if (todayProtein < proteinTarget * (hour - 8) / 14) {
        headline = "Protein behind pace";
        priority = `${Math.round(todayProtein)}g of ${proteinTarget}g target. Add a protein-forward snack.`;
      } else {
        headline = "On track";
        priority = `${Math.round(todayCals)} of ${calorieTarget}kcal · ${remaining}kcal remaining.`;
      }
      nudgeAction = waterMl < waterTarget * 0.6 ? `Drink another glass — ${Math.round(waterMl/1000*10)/10}L of 2L today` : "Keep moving — small wins compound";
      nudgeReason = `${Math.round(waterMl/250)} of 8 glasses logged`;
    } else if (window === "evening") {
      headline = "How was today, 1–5?";
      const burned = todayWorkouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);
      priority = `${todayMeals.length} meal${todayMeals.length !== 1 ? "s" : ""}, ${todayWorkouts.length} workout${todayWorkouts.length !== 1 ? "s" : ""}, ${Math.round(todayCals)}kcal in / ${Math.round(burned)}kcal out.`;
      nudgeAction = "Quick reflection helps tomorrow";
      nudgeReason = "90 seconds, then I'm out of your way";
    } else {
      headline = "Wind-down time";
      priority = sleep ? `Sleep target set. Aim for a steady ${sleep.hours}h.` : "Set tonight's sleep target so I can flag tomorrow.";
      nudgeAction = "Heading to bed?";
      nudgeReason = "I'll mark sleep started now";
    }

    return {
      window,
      headline,
      priority,
      nudge: { action: nudgeAction, reason: nudgeReason },
      stats: {
        todayCals: Math.round(todayCals),
        calorieTarget,
        todayProtein: Math.round(todayProtein),
        proteinTarget,
        waterMl,
        waterTarget,
        mealsLogged: todayMeals.length,
        workoutsLogged: todayWorkouts.length,
      },
    };
  },
});

import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { adjustCaloriesForDay, type NutritionPlan } from "./tdee_engine";
import { getNextCheckInForContext, getTodayCheckInAnswerContext } from "./checkins";

const windowValidator = v.union(
  v.literal("morning"),
  v.literal("day"),
  v.literal("evening"),
  v.literal("night"),
);
type DailyWindow = "morning" | "day" | "evening" | "night";

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

function localNowFromOffset(offsetMinutes: number) {
  return new Date(Date.now() - offsetMinutes * 60_000);
}

function dateBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
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
  args: { today: v.optional(v.string()), window: v.optional(windowValidator) },
  handler: async (ctx, { today: todayArg, window: windowArg }) => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db.query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const offsetMin = settings?.timezoneOffsetMinutes ?? 0;
    const localNow = localNowFromOffset(offsetMin);
    const today = todayArg ?? localNow.toISOString().split("T")[0];
    const yesterday = dateBefore(today);

    const [profile, todayMeals, todayWorkouts, yMeals, yWorkouts, water, sleep, steps, moods] = await Promise.all([
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
      ctx.db.query("steps_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .first(),
      ctx.db.query("mood_logs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today))
        .take(10),
    ]);

    const calorieTarget = profile?.calorieTarget ?? 2000;
    const proteinTarget = profile?.proteinTarget ?? 90;
    const carbTarget = profile?.carbTarget ?? 250;
    const fatTarget = profile?.fatTarget ?? 65;
    const todayCals = todayMeals.reduce((s, m) => s + m.calories, 0);
    const todayProtein = todayMeals.reduce((s, m) => s + m.protein, 0);
    const todayCarbs = todayMeals.reduce((s, m) => s + m.carbs, 0);
    const todayFat = todayMeals.reduce((s, m) => s + m.fat, 0);
    const yCals = yMeals.reduce((s, m) => s + m.calories, 0);
    const yProtein = yMeals.reduce((s, m) => s + m.protein, 0);
    const waterMl = water.reduce((s, w) => s + w.ml, 0);
    const waterTarget = profile?.waterTarget ?? 2000;

    // Suppress check-in questions if the user has already chatted on the homepage today
    const homepageSession = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), `__HOMEPAGE_${today}__`))
      .first();
    const todayStartMs = new Date(today + "T00:00:00.000Z").getTime() + offsetMin * 60_000;
    let hasHomepageMessagesToday = false;
    if (homepageSession) {
      const recentMsg = await ctx.db
        .query("chat_messages")
        .withIndex("by_session", (q) => q.eq("sessionId", homepageSession._id))
        .order("desc")
        .first();
      hasHomepageMessagesToday = !!recentMsg && (recentMsg._creationTime ?? 0) >= todayStartMs;
    }

    // Task 19: dynamic per-day target from base plan + today's actual burn.
    let plan: NutritionPlan | null = null;
    try {
      const p = profile?.planBreakdown ? JSON.parse(profile.planBreakdown) : null;
      if (p && typeof p.plannedDailyEAT === "number") plan = p as NutritionPlan;
    } catch { /* no plan */ }
    const todayBurn = todayWorkouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);
    const dayAdj = plan ? adjustCaloriesForDay(plan, todayBurn) : null;
    const adjustedCalorieTarget = dayAdj?.calorieGoal ?? calorieTarget;
    const adjustmentNote = dayAdj && dayAdj.calorieGoal !== plan!.calories ? dayAdj.note : null;

    const hour = localNow.getUTCHours();
    const window: DailyWindow = windowArg ?? (
      hour >= 5 && hour < 11 ? "morning" :
      hour >= 11 && hour < 18 ? "day" :
      hour >= 18 && hour < 22 ? "evening" : "night"
    );
    const checkInAnswerContext = await getTodayCheckInAnswerContext(ctx, userId, today);

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

    type CommandCategory = "meal" | "workout" | "recovery" | "water" | "reflection";
    type CommandTone = "steady" | "recovery" | "momentum" | "light";

    let doToday: { title: string; action: string; reason: string; category: CommandCategory };
    let recoverFrom: { title: string; action: string } | null = null;
    let ignoreToday: { title: string; reason: string } | null = null;
    let tone: CommandTone = "steady";

    const proteinBehind = todayProtein < proteinTarget * Math.min(1, Math.max(0.15, (hour - 7) / 12));
    const noLogsYesterday = yMeals.length === 0 && yWorkouts.length === 0;
    const shortSleep = !!sleep && sleep.hours < 6.5;
    const waterBehind = waterMl < waterTarget * Math.min(1, Math.max(0.2, (hour - 7) / 12));
    const mealsMissingLate = todayMeals.length === 0 && hour >= 13;

    if (shortSleep) {
      tone = "recovery";
      doToday = {
        title: "Keep today recovery-first",
        action: "Choose a lighter workout or a 20-minute walk.",
        reason: `Sleep came in at ${sleep.hours.toFixed(1)}h, so consistency beats intensity today.`,
        category: "recovery",
      };
      recoverFrom = {
        title: "Short sleep",
        action: "Aim for steady meals, extra water, and an earlier wind-down.",
      };
      ignoreToday = {
        title: "A perfect training day",
        reason: "Pushing hard after short sleep usually costs more than it gives back.",
      };
    } else if (proteinBehind && (todayMeals.length > 0 || window !== "morning")) {
      tone = "steady";
      const needed = Math.max(20, Math.round(Math.min(45, proteinTarget - todayProtein)));
      doToday = {
        title: "Make the next meal protein-forward",
        action: `Get about ${needed}g protein in your next meal or snack.`,
        reason: `${Math.round(todayProtein)}g of ${proteinTarget}g logged so far.`,
        category: "meal",
      };
      if (yProtein > 0 && yProtein < proteinTarget * 0.7) {
        recoverFrom = {
          title: "Low protein yesterday",
          action: "Front-load protein once today instead of trying to fix everything later.",
        };
      }
      ignoreToday = {
        title: "Macro perfection",
        reason: "Hit the protein anchor first; the rest can stay flexible.",
      };
    } else if (mealsMissingLate) {
      tone = "light";
      doToday = {
        title: "Log one real meal",
        action: "Estimate lunch or your last meal in plain language.",
        reason: "One useful log is enough to restart the day.",
        category: "meal",
      };
      recoverFrom = noLogsYesterday ? {
        title: "A quiet logging streak",
        action: "Start small: one meal, no backfilling needed.",
      } : null;
      ignoreToday = {
        title: "Catching up perfectly",
        reason: "Do not spend energy reconstructing the whole day.",
      };
    } else if (waterBehind && window !== "night") {
      tone = "light";
      doToday = {
        title: "Fix hydration the easy way",
        action: "Drink one glass of water now.",
        reason: `${Math.round(waterMl / 250)} of 8 glasses logged today.`,
        category: "water",
      };
      ignoreToday = {
        title: "Big habit overhaul",
        reason: "A single glass is the right-sized next step.",
      };
    } else if (window === "evening" || window === "night") {
      tone = todayMeals.length > 0 || todayWorkouts.length > 0 ? "momentum" : "light";
      doToday = {
        title: "Close the loop",
        action: "Rate today from 1 to 5 and leave one note for tomorrow.",
        reason: "A short reflection gives tomorrow's guidance better context.",
        category: "reflection",
      };
      recoverFrom = noLogsYesterday ? {
        title: "Missed context",
        action: "No need to backfill; just mark how today felt.",
      } : null;
      ignoreToday = {
        title: "More dashboard checking",
        reason: "You have enough data for today. Capture the feeling and move on.",
      };
    } else {
      tone = noLogsYesterday ? "light" : "momentum";
      doToday = {
        title: noLogsYesterday ? "Restart with one easy log" : "Keep the rhythm simple",
        action: noLogsYesterday ? "Log breakfast or your first drink." : "Log the next meal when it happens.",
        reason: noLogsYesterday ? "Yesterday was quiet, so the win is showing up lightly." : "Your recent activity gives today enough momentum.",
        category: "meal",
      };
      recoverFrom = noLogsYesterday ? {
        title: "No logs yesterday",
        action: "One small entry is the whole comeback.",
      } : null;
      ignoreToday = {
        title: "Doing everything at once",
        reason: "One clear action is better than opening five trackers.",
      };
    }

    const selectedCheckIn = await getNextCheckInForContext(ctx, {
      userId,
      date: today,
      window,
      profile,
      todayMeals,
      todayWorkouts,
      waterMl,
      sleep,
      steps,
      moodCount: moods.length,
      units: settings?.units,
    });

    return {
      window,
      headline,
      priority,
      nudge: { action: nudgeAction, reason: nudgeReason },
      command: {
        doToday,
        recoverFrom,
        ignoreToday,
        why: doToday.reason,
        tone,
      },
      checkIn: (!hasHomepageMessagesToday && selectedCheckIn) ? selectedCheckIn : null,
      checkInContext: checkInAnswerContext || null,
      stats: {
        todayCals: Math.round(todayCals),
        calorieTarget,
        adjustedCalorieTarget,
        adjustmentNote,
        todayProtein: Math.round(todayProtein),
        proteinTarget,
        todayCarbs: Math.round(todayCarbs),
        carbTarget,
        todayFat: Math.round(todayFat),
        fatTarget,
        waterMl,
        waterTarget,
        mealsLogged: todayMeals.length,
        workoutsLogged: todayWorkouts.length,
      },
    };
  },
});

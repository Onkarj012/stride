import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ─── Mission definitions ──────────────────────────────────────────────────────

export const MISSIONS: Record<string, { title: string; description: string; xp: number }> = {
  first_meal:     { title: "First Bite",       description: "Log your first meal",                    xp: 10  },
  day_complete:   { title: "Well Fed",          description: "Log 3+ meals in a single day",           xp: 30  },
  first_workout:  { title: "Iron Will",         description: "Log your first workout",                 xp: 20  },
  hit_protein:    { title: "Protein Locked",    description: "Hit your daily protein target",          xp: 25  },
  hit_calories:   { title: "Calorie Precision", description: "Stay within 10% of your calorie goal",  xp: 25  },
  streak_3:       { title: "On a Roll",         description: "Log for 3 days in a row",               xp: 50  },
  streak_7:       { title: "Week Warrior",      description: "7-day logging streak",                   xp: 100 },
  streak_14:      { title: "Fortnight Fighter", description: "14-day logging streak",                  xp: 200 },
  streak_30:      { title: "Month Strong",      description: "30-day logging streak",                  xp: 500 },
  meals_50:       { title: "Century Club",      description: "Log 50 total meals",                    xp: 100 },
  meals_100:      { title: "Consistent",        description: "Log 100 total meals",                   xp: 200 },
};

// XP required to reach each level
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1200, 2400, 5000];
const LEVEL_NAMES = ["Beginner", "Consistent", "Dedicated", "Strong", "Elite", "Champion", "Legend"];

function computeLevel(xp: number): { level: number; name: string; nextThreshold: number; progress: number } {
  let level = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i;
  }
  const nextThreshold = LEVEL_THRESHOLDS[Math.min(level + 1, LEVEL_THRESHOLDS.length - 1)];
  const currentThreshold = LEVEL_THRESHOLDS[level];
  const progress = nextThreshold === currentThreshold ? 100
    : Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100);
  return { level, name: LEVEL_NAMES[level], nextThreshold, progress };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

export const getStateInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("user_gamification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// ─── Public queries ───────────────────────────────────────────────────────────

export const getState = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const state = await ctx.db
      .query("user_gamification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!state) {
      return {
        xp: 0, streakDays: 0, longestStreak: 0, streakFreezes: 0,
        totalMealsLogged: 0, totalWorkoutsLogged: 0, totalDaysLogged: 0,
        missionsCompleted: [] as string[],
        frozenDates: [] as string[],
        level: computeLevel(0),
        missions: Object.entries(MISSIONS).map(([id, m]) => ({ id, ...m, completed: false })),
      };
    }

    const completed = state.missionsCompleted ?? [];
    const levelInfo = computeLevel(state.xp);

    return {
      xp: state.xp,
      streakDays: state.streakDays,
      longestStreak: state.longestStreak,
      streakFreezes: state.streakFreezes,
      frozenDates: state.frozenDates ?? [],
      totalMealsLogged: state.totalMealsLogged,
      totalWorkoutsLogged: state.totalWorkoutsLogged,
      totalDaysLogged: state.totalDaysLogged,
      missionsCompleted: completed,
      level: levelInfo,
      missions: Object.entries(MISSIONS).map(([id, m]) => ({
        id, ...m, completed: completed.includes(id),
      })),
    };
  },
});

// ─── Update progress mutation ─────────────────────────────────────────────────

export const recordActivity = mutation({
  args: {
    type: v.union(v.literal("meal"), v.literal("workout")),
    date: v.optional(v.string()),
    // For macro adherence checks
    totalCalories: v.optional(v.number()),
    totalProtein: v.optional(v.number()),
    calorieTarget: v.optional(v.number()),
    proteinTarget: v.optional(v.number()),
    mealsLoggedToday: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;
    const today = args.date ?? new Date().toISOString().split("T")[0];

    let state = await ctx.db
      .query("user_gamification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const isNew = !state;
    const existing = state ?? {
      userId,
      xp: 0, streakDays: 0, longestStreak: 0,
      lastLoggedDate: undefined, streakFreezes: 0,
      frozenDates: [], totalDaysLogged: 0,
      totalMealsLogged: 0, totalWorkoutsLogged: 0,
      missionsCompleted: [],
    };

    let xpGained = 0;
    const newMissions: string[] = [];
    const completed = existing.missionsCompleted ?? [];
    const frozenDates = existing.frozenDates ?? [];

    // ── Update streak ──────────────────────────────────────────────────────────
    let { streakDays, longestStreak, lastLoggedDate, totalDaysLogged } = existing;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const isNewDay = lastLoggedDate !== today;

    if (isNewDay) {
      if (lastLoggedDate === yesterday) {
        // Consecutive day
        streakDays += 1;
      } else if (lastLoggedDate) {
        // Potentially broken — check if last missed day is in frozen dates
        const frozenIdx = frozenDates.indexOf(today);
        const prevDayFrozen = frozenDates.includes(yesterday);
        if (prevDayFrozen) {
          // Freeze covered yesterday, streak continues
          streakDays += 1;
        } else {
          // Streak broken — but check if we're within 1 day (just barely missed)
          const dayDiff = Math.round((new Date(today).getTime() - new Date(lastLoggedDate).getTime()) / 86400000);
          if (dayDiff <= 2 && frozenDates.length === 0) {
            // Grace: within 2 days without a freeze, reset but don't punish harshly
            streakDays = 1;
          } else {
            streakDays = 1;
          }
        }
      } else {
        streakDays = 1;
      }
      lastLoggedDate = today;
      totalDaysLogged += 1;
      longestStreak = Math.max(longestStreak, streakDays);
      xpGained += 10; // Base daily log XP
    }

    // ── Streak bonus XP ────────────────────────────────────────────────────────
    if (isNewDay) {
      xpGained += Math.min(streakDays * 2, 20);
    }

    // ── Activity XP ───────────────────────────────────────────────────────────
    if (args.type === "meal") {
      xpGained += 10;
    } else {
      xpGained += 20;
    }

    // ── Earn streak freezes (1 per 7-day milestone) ───────────────────────────
    let newFreezes = existing.streakFreezes;
    if (streakDays > 0 && streakDays % 7 === 0 && isNewDay) {
      newFreezes = Math.min(newFreezes + 1, 3);
    }

    // ── Update counts ─────────────────────────────────────────────────────────
    const totalMealsLogged = existing.totalMealsLogged + (args.type === "meal" ? 1 : 0);
    const totalWorkoutsLogged = existing.totalWorkoutsLogged + (args.type === "workout" ? 1 : 0);

    // ── Check missions ────────────────────────────────────────────────────────
    const check = (id: string, condition: boolean) => {
      if (condition && !completed.includes(id)) {
        completed.push(id);
        newMissions.push(id);
        xpGained += MISSIONS[id]?.xp ?? 0;
      }
    };

    if (args.type === "meal") check("first_meal", totalMealsLogged >= 1);
    if (args.type === "workout") check("first_workout", totalWorkoutsLogged >= 1);
    check("meals_50", totalMealsLogged >= 50);
    check("meals_100", totalMealsLogged >= 100);

    if (isNewDay) {
      check("streak_3", streakDays >= 3);
      check("streak_7", streakDays >= 7);
      check("streak_14", streakDays >= 14);
      check("streak_30", streakDays >= 30);

      // Bonus XP for completing a full day (3+ meals)
      const mealsToday = args.mealsLoggedToday ?? 0;
      const dayComplete = args.type === "meal" ? mealsToday + 1 >= 3 : mealsToday >= 3;
      if (dayComplete) {
        check("day_complete", true);
        if (!completed.includes("day_complete")) xpGained += 30;
      }
    }

    // Macro adherence checks
    if (args.totalProtein && args.proteinTarget) {
      const ratio = args.totalProtein / args.proteinTarget;
      if (ratio >= 0.9 && ratio <= 1.2) {
        check("hit_protein", true);
        if (newMissions.includes("hit_protein")) xpGained += 25;
      }
    }
    if (args.totalCalories && args.calorieTarget) {
      const ratio = args.totalCalories / args.calorieTarget;
      if (ratio >= 0.9 && ratio <= 1.1) {
        check("hit_calories", true);
        if (newMissions.includes("hit_calories")) xpGained += 25;
      }
    }

    // ── Save state ────────────────────────────────────────────────────────────
    const newXP = existing.xp + xpGained;
    const patch = {
      xp: newXP,
      streakDays,
      longestStreak,
      lastLoggedDate,
      streakFreezes: newFreezes,
      frozenDates,
      totalDaysLogged,
      totalMealsLogged,
      totalWorkoutsLogged,
      missionsCompleted: completed,
    };

    if (isNew) {
      await ctx.db.insert("user_gamification", { userId, ...patch });
    } else {
      await ctx.db.patch(state!._id, patch);
    }

    return {
      xpGained,
      newMissions: newMissions.map((id) => ({ id, ...MISSIONS[id] })),
      streakDays,
      newFreezes: newFreezes > existing.streakFreezes,
    };
  },
});

// ─── Use streak freeze ────────────────────────────────────────────────────────

export const useStreakFreeze = mutation({
  args: { dateToFreeze: v.string() },
  handler: async (ctx, { dateToFreeze }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const state = await ctx.db
      .query("user_gamification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!state || state.streakFreezes <= 0) {
      throw new Error("No streak freezes available");
    }

    const frozenDates = state.frozenDates ?? [];
    if (frozenDates.includes(dateToFreeze)) {
      throw new Error("This date is already frozen");
    }

    await ctx.db.patch(state._id, {
      streakFreezes: state.streakFreezes - 1,
      frozenDates: [...frozenDates, dateToFreeze].slice(-10), // Keep last 10
    });

    return { success: true };
  },
});

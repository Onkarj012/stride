/**
 * One-off seed script. Run with:
 *   npx convex run seed:seedTestUser
 *
 * Creates a test user with full profile, daily goals, meals, workouts,
 * water, sleep, mood, gamification state, and behavior history — so you
 * can test every page immediately after signing in.
 *
 * The userId "test_user_onkar" is used. After running this, sign in via
 * Clerk (any method), then in the Convex dashboard set the `users` row's
 * `clerkId` to match your actual Clerk subject (visible in the users table
 * after first sign-in). Or just use `npx convex dev` + sign up fresh and
 * the OnboardingGuard will route you to onboarding.
 */
import { internalMutation } from "./_generated/server";

const USER_ID = "test_user_onkar";
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

export const seedTestUser = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clean up any previous seed
    const existing = await ctx.db.query("users").filter((q) => q.eq(q.field("clerkId"), USER_ID)).first();
    if (existing) await ctx.db.delete(existing._id);
    const existingProfile = await ctx.db.query("user_profiles").withIndex("by_user", (q) => q.eq("userId", USER_ID)).first();
    if (existingProfile) await ctx.db.delete(existingProfile._id);

    // 1. User
    await ctx.db.insert("users", { clerkId: USER_ID, email: "onkar@test.dev", name: "Onkar" });

    // 2. Profile (onboarding complete, full engine inputs)
    await ctx.db.insert("user_profiles", {
      userId: USER_ID,
      weight: 80,
      height: 178,
      age: 28,
      sex: "male",
      activityLevel: "moderate",
      goal: "moderate_loss",
      occupationType: "desk",
      workHoursPerDay: 8,
      lifestyleActivity: "moderate",
      weeklyWorkouts: JSON.stringify([
        { type: "strength", durationMin: 60, sessionsPerWeek: 4 },
        { type: "run_slow", durationMin: 30, sessionsPerWeek: 2 },
      ]),
      calorieTarget: 2100,
      proteinTarget: 176,
      carbTarget: 200,
      fatTarget: 63,
      onboardingComplete: true,
      dietaryPreference: "none",
      fitnessLevel: "intermediate",
      trainingStyle: "resistance",
      planBreakdown: JSON.stringify({ breakdown: { bmr: 1778, neatJob: 128, neatLifestyle: 117, eat: 320, tef: 234, tdee: 2343, finalTDEE: 2577, plannedDailyEAT: 320, goal: "moderate_loss", goalAdjustment: -464 }, calories: 2113, protein: 176, carbs: 200, fat: 63, plannedDailyEAT: 320, percentages: { protein: 33, carbs: 38, fat: 27 } }),
    });

    // 3. Daily goals
    await ctx.db.insert("daily_goals", { userId: USER_ID, date: TODAY, calorieGoal: 2100, proteinGoal: 176, carbGoal: 200, fatGoal: 63 });

    // 4. Meals (today + yesterday)
    const meals = [
      { name: "Eggs + toast", calories: 380, protein: 28, carbs: 30, fat: 18, time: "08:30", date: TODAY, mealType: "breakfast" },
      { name: "Chicken rice bowl", calories: 620, protein: 45, carbs: 65, fat: 15, time: "13:00", date: TODAY, mealType: "lunch" },
      { name: "Protein shake", calories: 180, protein: 30, carbs: 8, fat: 3, time: "16:00", date: TODAY, mealType: "snack" },
      { name: "Dal + roti + sabji", calories: 520, protein: 22, carbs: 60, fat: 14, time: "20:30", date: YESTERDAY, mealType: "dinner" },
      { name: "Skyr yogurt + banana", calories: 220, protein: 20, carbs: 35, fat: 2, time: "08:00", date: YESTERDAY, mealType: "breakfast" },
    ];
    for (const m of meals) await ctx.db.insert("meals", { userId: USER_ID, ...m });

    // 5. Workouts
    await ctx.db.insert("workouts", {
      userId: USER_ID, date: TODAY, name: "Push day (chest + shoulders + triceps)",
      sets: "16", intensity: "HIGH", duration: "55 min", caloriesBurned: 380,
    });
    await ctx.db.insert("workouts", {
      userId: USER_ID, date: YESTERDAY, name: "Pull day (back + biceps)",
      sets: "18", intensity: "HIGH", duration: "60 min", caloriesBurned: 410,
    });

    // 6. Water
    for (let i = 0; i < 6; i++) {
      await ctx.db.insert("water_logs", { userId: USER_ID, date: TODAY, ml: 250, time: `${8 + i * 2}:00` });
    }

    // 7. Sleep
    await ctx.db.insert("sleep_logs", { userId: USER_ID, date: TODAY, hours: 7.5, quality: "good" });

    // 8. Mood
    await ctx.db.insert("mood_logs", { userId: USER_ID, date: TODAY, rating: 4, time: "09:00", note: "Feeling strong" });

    // 9. Gamification
    await ctx.db.insert("user_gamification", {
      userId: USER_ID, xp: 450, streakDays: 7, longestStreak: 14,
      lastLoggedDate: TODAY, streakFreezes: 2, totalDaysLogged: 28,
      totalMealsLogged: 84, totalWorkoutsLogged: 20,
    });

    // 10. Behavior (so patterns + nudges work)
    const behaviors = [
      { kind: "engagement", key: "morning" },
      { kind: "engagement", key: "morning" },
      { kind: "engagement", key: "day" },
      { kind: "coach", key: "diet" },
      { kind: "coach", key: "diet" },
      { kind: "coach", key: "workout" },
      { kind: "suggestion", key: "Log lunch" },
      { kind: "suggestion", key: "Log lunch" },
      { kind: "suggestion", key: "Protein shake" },
      { kind: "log", key: "meal" },
      { kind: "log", key: "meal" },
      { kind: "log", key: "workout" },
    ];
    for (const b of behaviors) {
      await ctx.db.insert("user_behavior", { userId: USER_ID, kind: b.kind, key: b.key, date: TODAY, ts: Date.now() });
    }

    // 11. Settings
    await ctx.db.insert("user_settings", {
      userId: USER_ID,
      coachingStyle: "motivating",
      units: "metric",
      notifications: true,
      reduceMotion: false,
      timezoneOffsetMinutes: -330, // IST
    });

    // 12. A saved recipe
    const ingredients = [
      { name: "Oats", grams: 80, caloriesPer100g: 389, proteinPer100g: 17, carbsPer100g: 66, fatPer100g: 7 },
      { name: "Milk", grams: 200, caloriesPer100g: 42, proteinPer100g: 3.4, carbsPer100g: 5, fatPer100g: 1 },
      { name: "Banana", grams: 120, caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 23, fatPer100g: 0.3 },
    ];
    await ctx.db.insert("recipes", {
      userId: USER_ID,
      name: "Overnight oats",
      servings: 1,
      ingredients: JSON.stringify(ingredients),
      total: { kcal: 502, p: 22.9, c: 110.6, f: 8 },
      perServing: { kcal: 502, p: 22.9, c: 110.6, f: 8 },
    });

    return { userId: USER_ID, message: "Test user seeded. Sign in via Clerk, then update the users table clerkId to match your Clerk subject." };
  },
});

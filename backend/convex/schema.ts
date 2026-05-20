import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
  }).index("by_clerk_id", ["clerkId"]),

  meals: defineTable({
    userId: v.string(),
    date: v.string(),
    name: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    time: v.string(),
    aiSuggestion: v.optional(v.string()),
    mealType: v.optional(v.string()),
    components: v.optional(v.string()),
  }).index("by_user_date", ["userId", "date"]),

  workouts: defineTable({
    userId: v.string(),
    date: v.string(),
    name: v.string(),
    sets: v.string(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.string(),
    exercises: v.optional(v.any()),
    rationale: v.optional(v.string()),
    caloriesBurned: v.optional(v.number()),
  }).index("by_user_date", ["userId", "date"]),

  daily_goals: defineTable({
    userId: v.string(),
    date: v.string(),
    calorieGoal: v.number(),
    proteinGoal: v.number(),
    carbGoal: v.number(),
    fatGoal: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  insights: defineTable({
    userId: v.string(),
    date: v.string(),
    content: v.string(),
  }).index("by_user_date", ["userId", "date"]),

  weekly_summaries: defineTable({
    userId: v.string(),
    weekStart: v.string(),
    content: v.string(),
  }).index("by_user_week", ["userId", "weekStart"]),

  user_profiles: defineTable({
    userId: v.string(),
    weight: v.optional(v.number()),
    height: v.optional(v.number()),
    age: v.optional(v.number()),
    sex: v.optional(v.string()),
    activityLevel: v.string(),
    calorieTarget: v.optional(v.number()),
    proteinTarget: v.optional(v.number()),
    carbTarget: v.optional(v.number()),
    fatTarget: v.optional(v.number()),
    bodyFat: v.optional(v.number()),
    leanMass: v.optional(v.number()),
    dailySteps: v.optional(v.number()),
    trainingDays: v.optional(v.number()),
    cardioMinutes: v.optional(v.number()),
    jobType: v.optional(v.string()),
    goal: v.optional(v.string()),
    trainingStyle: v.optional(v.string()),
    onboardingComplete: v.optional(v.boolean()),
    dietaryPreference: v.optional(v.string()),
    allergies: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  user_settings: defineTable({
    userId: v.string(),
    openRouterKey: v.optional(v.string()),
    openRouterModel: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  chat_sessions: defineTable({
    userId: v.string(),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  chat_messages: defineTable({
    userId: v.string(),
    sessionId: v.optional(v.id("chat_sessions")),
    role: v.string(),
    content: v.string(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  food_cache: defineTable({
    barcode: v.optional(v.string()),
    name: v.string(),
    brand: v.optional(v.string()),
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
    searchCount: v.optional(v.number()),
  })
    .index("by_barcode", ["barcode"])
    .index("by_search_count", ["searchCount"])
    .searchIndex("by_name_search", {
      searchField: "name",
      filterFields: ["source", "verified"],
    }),

  user_gamification: defineTable({
    userId: v.string(),
    xp: v.number(),
    streakDays: v.number(),
    longestStreak: v.number(),
    lastLoggedDate: v.optional(v.string()),
    streakFreezes: v.number(),
    frozenDates: v.optional(v.array(v.string())),
    totalDaysLogged: v.number(),
    totalMealsLogged: v.number(),
    totalWorkoutsLogged: v.number(),
    missionsCompleted: v.optional(v.array(v.string())),
  }).index("by_user", ["userId"]),
});

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"]),

  authSessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"]),

  meals: defineTable({
    userId: v.id("users"),
    name: v.string(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    time: v.string(),
    date: v.string(), // YYYY-MM-DD
    aiSuggestion: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),

  workouts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    sets: v.string(),
    reps: v.optional(v.string()),
    weight: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.string(),
    date: v.string(), // YYYY-MM-DD
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),

  dailyGoals: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    calorieGoal: v.number(),
    proteinGoal: v.number(),
    carbGoal: v.number(),
    fatGoal: v.number(),
    waterGoal: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),

  chatMessages: defineTable({
    userId: v.id("users"),
    role: v.string(), // 'user' | 'ai'
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"]),

  weeklySummaries: defineTable({
    userId: v.id("users"),
    weekStart: v.string(), // YYYY-MM-DD
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_week", ["userId", "weekStart"]),

  dailyInsights: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    insights: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),
});

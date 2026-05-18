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
    activityLevel: v.string(),
    calorieTarget: v.optional(v.number()),
    proteinTarget: v.optional(v.number()),
    carbTarget: v.optional(v.number()),
    fatTarget: v.optional(v.number()),
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
});

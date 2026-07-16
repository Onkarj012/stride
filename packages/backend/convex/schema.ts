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
    // NEW: Nutrition engine fields
    confidence: v.optional(v.number()),
    nutritionSource: v.optional(v.string()),
    nutritionVerified: v.optional(v.boolean()),
    structuredItems: v.optional(v.string()),
    ingredientBreakdown: v.optional(v.string()),
    // Canonical nutrition draft calorie provenance.
    reportedCalories: v.optional(v.number()),
    estimatedCalories: v.optional(v.number()),
    calorieSource: v.optional(v.union(v.literal("reported"), v.literal("estimated"))),
    ingredientBreakdownInvalidated: v.optional(v.boolean()),
    // Diet memory: set when auto-applied from food_memory
    foodMemoryId: v.optional(v.id("food_memory")),
    logSource: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    undoneAt: v.optional(v.number()),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_date_and_idempotency_key", ["userId", "date", "idempotencyKey"]),

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
    // NEW: Calorie engine fields
    calorieConfidence: v.optional(v.number()),
    calorieRangeLow: v.optional(v.number()),
    calorieRangeHigh: v.optional(v.number()),
    calorieEstimateRough: v.optional(v.boolean()),
    calorieBreakdown: v.optional(v.string()),
    calculationVersion: v.optional(v.number()),
    // Structured exercise data — JSON: ExerciseEntry[]
    structuredSets: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    logSource: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    undoneAt: v.optional(v.number()),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_date_and_idempotency_key", ["userId", "date", "idempotencyKey"]),

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
    // NEW
    fitnessLevel: v.optional(v.string()),
    // Task 2: richer profile inputs (all optional, comma-separated strings)
    dislikedFoods: v.optional(v.string()),
    cuisines: v.optional(v.string()),
    equipment: v.optional(v.string()),
    scheduleNote: v.optional(v.string()),
    // Task 17: 4-component TDEE engine inputs + persisted transparency breakdown
    occupationType: v.optional(v.string()), // desk | mixed | standing | physical
    workHoursPerDay: v.optional(v.number()),
    lifestyleActivity: v.optional(v.string()), // sedentary | light | moderate | active
    weeklyWorkouts: v.optional(v.string()), // JSON: [{type,durationMin,sessionsPerWeek}]
    goalWeightKg: v.optional(v.number()),
    planBreakdown: v.optional(v.string()), // JSON: engine NutritionPlan breakdown
    waterTarget: v.optional(v.number()), // ml/day, default 2000
  }).index("by_user", ["userId"]),

  user_settings: defineTable({
    userId: v.string(),
    openRouterKey: v.optional(v.string()),
    openRouterModel: v.optional(v.string()),
    // UI preferences (synced from usePrefs)
    units: v.optional(v.string()), // metric | imperial
    notifications: v.optional(v.boolean()),
    coachingStyle: v.optional(v.string()), // gentle | motivating | analytical
    reduceMotion: v.optional(v.boolean()),
    timezoneOffsetMinutes: v.optional(v.number()), // new Date().getTimezoneOffset() from browser
  }).index("by_user", ["userId"]),

  chat_sessions: defineTable({
    userId: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    previewTitle: v.optional(v.string()),
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

  // ─── Wellness logs (water, sleep, mood, steps) ─────────────────────────────

  water_logs: defineTable({
    userId: v.string(),
    date: v.string(),
    ml: v.number(),
    time: v.string(),
    undoneAt: v.optional(v.number()),
  }).index("by_user_date", ["userId", "date"]),

  sleep_logs: defineTable({
    userId: v.string(),
    date: v.string(),
    hours: v.number(),
    quality: v.string(), // poor | ok | good | great
    note: v.optional(v.string()),
    undoneAt: v.optional(v.number()),
  }).index("by_user_date", ["userId", "date"]),

  mood_logs: defineTable({
    userId: v.string(),
    date: v.string(),
    rating: v.number(), // 1..5
    note: v.optional(v.string()),
    time: v.string(),
    undoneAt: v.optional(v.number()),
  }).index("by_user_date", ["userId", "date"]),

  steps_logs: defineTable({
    userId: v.string(),
    date: v.string(),
    count: v.number(),
    undoneAt: v.optional(v.number()),
  }).index("by_user_date", ["userId", "date"]),

  weight_logs: defineTable({
    userId: v.string(),
    date: v.string(),
    weightKg: v.number(),
    source: v.string(), // check_in | profile
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user", ["userId"]),

  // ─── Check-ins ────────────────────────────────────────────────────────────

  check_in_answers: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD, same client-local convention used by brief + logs
    questionId: v.string(),
    source: v.string(), // registry | llm | template
    window: v.string(), // morning | day | evening | night
    answerType: v.string(), // choice | number | scale | yes_no
    value: v.string(),
    label: v.optional(v.string()),
    numericValue: v.optional(v.number()),
    booleanValue: v.optional(v.boolean()),
    templateId: v.optional(v.string()),
    skipped: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_date_question", ["userId", "date", "questionId"])
    .index("by_user_question_date", ["userId", "questionId", "date"]),

  check_in_template_settings: defineTable({
    userId: v.string(),
    templateId: v.string(),
    enabled: v.boolean(),
    window: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_template", ["userId", "templateId"]),

  check_in_llm_questions: defineTable({
    userId: v.string(),
    date: v.string(),
    questions: v.string(), // JSON: generated candidate question array
    generatedAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  // ─── Calorie Engine ────────────────────────────────────────────────────────

  user_metabolic_profiles: defineTable({
    userId: v.string(),
    metabolicFactor: v.number(),
    fitnessLevel: v.string(),
    totalWorkoutsTracked: v.number(),
    lastCalibrationDate: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  calorie_feedback: defineTable({
    userId: v.string(),
    workoutId: v.id("workouts"),
    feedback: v.string(),
    date: v.string(),
    metabolicFactorSnapshot: v.number(),
  }).index("by_user", ["userId"]),

  // ─── Behavioral Memory (server-side) ───────────────────────────────────────

  user_behavior: defineTable({
    userId: v.string(),
    kind: v.string(), // engagement | nudge_dismiss | suggestion | coach | log
    key: v.string(),
    value: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    ts: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_date", ["date"]),

  // ─── Proactive Nudges (in-app inbox; push-ready) ───────────────────────────

  nudges: defineTable({
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    window: v.optional(v.string()),
    status: v.string(), // active | dismissed
    delivery: v.string(), // in_app | push
    deepLink: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD (dedupe scope)
    createdAt: v.number(),
    dismissedAt: v.optional(v.number()),
  }).index("by_user_status", ["userId", "status"]),

  // ─── Diet Memory (auto-learned food profiles) ──────────────────────────────

  food_memory: defineTable({
    userId: v.string(),
    normalizedName: v.string(),       // lowercased, stripped key for matching
    displayName: v.string(),          // best user-facing name seen
    aliases: v.array(v.string()),     // other names this meal has been logged as
    kcal: v.number(),                 // smoothed average
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    components: v.optional(v.string()),
    timesLogged: v.number(),
    source: v.string(),               // "learned" | "corrected"
    lastUsedDate: v.string(),         // YYYY-MM-DD
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "normalizedName"]),

  // ─── Personal Ingredient Memory ────────────────────────────────────────────
  // Stores user-defined ingredient facts extracted from chat (e.g. homemade
  // paneer macros, cooking oil amounts, custom serving sizes).

  user_ingredients: defineTable({
    userId: v.string(),
    normalizedName: v.string(),      // lowercase key for matching, e.g. "homemade paneer"
    displayName: v.string(),         // user-facing, e.g. "Homemade Paneer"
    caloriesPer100g: v.optional(v.number()),
    proteinPer100g: v.optional(v.number()),
    carbsPer100g: v.optional(v.number()),
    fatPer100g: v.optional(v.number()),
    notes: v.optional(v.string()),   // free-text: "made with full-fat milk, no whey drained"
    source: v.string(),              // "user_stated" | "corrected"
    lastUpdated: v.string(),         // YYYY-MM-DD
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "normalizedName"]),

  // ─── Workout Memory (auto-learned workout profiles) ────────────────────────

  workout_memory: defineTable({
    userId: v.string(),
    normalizedName: v.string(),      // e.g. "back day", "push day", "leg day"
    displayName: v.string(),
    aliases: v.array(v.string()),
    exercises: v.optional(v.string()),   // JSON: typical exercise names
    durationMin: v.optional(v.number()), // smoothed average duration
    intensity: v.optional(v.string()),   // most common: light|moderate|intense
    caloriesBurned: v.optional(v.number()), // smoothed average kcal
    timesLogged: v.number(),
    lastUsedDate: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "normalizedName"]),

  // ─── Recipes (hybrid macro builder) ────────────────────────────────────────

  recipes: defineTable({
    userId: v.string(),
    name: v.string(),
    servings: v.number(),
    ingredients: v.string(), // JSON: [{name,grams,caloriesPer100g,proteinPer100g,carbsPer100g,fatPer100g,source?}]
    perServing: v.object({ kcal: v.number(), p: v.number(), c: v.number(), f: v.number() }),
    total: v.object({ kcal: v.number(), p: v.number(), c: v.number(), f: v.number() }),
    steps: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  actionGroups: defineTable({
    userId: v.string(),
    groupIdempotencyKey: v.string(),
    sourceSurface: v.union(
      v.literal("chat"),
      v.literal("quick_log"),
      v.literal("barcode"),
      v.literal("recipe"),
      v.literal("checkin"),
      v.literal("direct_ui"),
      v.literal("mobile"),
    ),
    rawInput: v.string(),
    model: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("committed"),
      v.literal("partial"),
      v.literal("failed"),
      v.literal("discarded"),
      v.literal("expired"),
    ),
    clientLocalDate: v.optional(v.string()),
    clientLocalTime: v.optional(v.string()),
    clientTimeZone: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_user_created_at", ["userId", "createdAt"])
    .index("by_group_idempotency_key", ["groupIdempotencyKey"]),

  actions: defineTable({
    groupId: v.id("actionGroups"),
    userId: v.string(),
    actionType: v.union(
      v.literal("meal"),
      v.literal("workout"),
      v.literal("recovery"),
      v.literal("rest"),
      v.literal("memory"),
    ),
    memberIdempotencyKey: v.string(),
    payload: v.any(),
    provenance: v.union(
      v.literal("user_reported"),
      v.literal("ai_extracted"),
      v.literal("ai_estimated"),
      v.literal("database_match"),
    ),
    confidence: v.optional(v.number()),
    validation: v.object({
      status: v.union(v.literal("valid"), v.literal("warning"), v.literal("error")),
      messages: v.array(v.string()),
    }),
    status: v.union(
      v.literal("pending"),
      v.literal("committed"),
      v.literal("failed"),
      v.literal("undone"),
      v.literal("discarded"),
      v.literal("expired"),
    ),
    reversible: v.boolean(),
    resolvedDate: v.optional(v.string()),
    resolvedTime: v.optional(v.string()),
    committedRowRef: v.optional(v.object({ table: v.string(), id: v.string() })),
    undoneAt: v.optional(v.number()),
  })
    .index("by_group", ["groupId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_member_idempotency_key", ["memberIdempotencyKey"]),
});

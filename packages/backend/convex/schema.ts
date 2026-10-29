import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  createdByValidator,
  entrySourceValidator,
  foodLinkStateValidator,
  foodLinkStatusValidator,
  foodSourceValidator,
  inputKindValidator,
  matchSourceValidator,
  mealSlotValidator,
  nutrientsValidator,
  revisionOpValidator,
  revisionStatusValidator,
} from "./ledger_validators";

export default defineSchema({
  ai_usage_buckets: defineTable({
    scope: v.union(v.literal("user"), v.literal("global")),
    ownerKey: v.string(),
    bucketKey: v.string(),
    requestCount: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    reservedCostUsd: v.number(),
    rateLimitTimestamps: v.array(v.number()),
  }).index("by_scope_owner_bucket", ["scope", "ownerKey", "bucketKey"]),

  ai_usage_reservations: defineTable({
    ownerKey: v.string(),
    bucketKey: v.string(),
    model: v.string(),
    reservedCostUsd: v.number(),
    state: v.union(v.literal("reserved"), v.literal("settled"), v.literal("released")),
    createdAt: v.number(),
    settledInputTokens: v.optional(v.number()),
    settledOutputTokens: v.optional(v.number()),
    settledCostUsd: v.optional(v.number()),
    // Set on calls made with the user's own key. Their cost is recorded but never counts toward a cap.
    ownKey: v.optional(v.boolean()),
  }),

  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
  }).index("by_clerk_id", ["clerkId"]),

  daily_goals: defineTable({
    userId: v.string(),
    date: v.string(),
    calorieGoal: v.number(),
    proteinGoal: v.number(),
    carbGoal: v.number(),
    fatGoal: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  user_profiles: defineTable({
    userId: v.string(),
    weight: v.optional(v.number()),
    weightUpdatedByActionId: v.optional(v.string()),
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
    plainWorkouts: v.optional(v.boolean()),
    notifications: v.optional(v.boolean()),
    coachingStyle: v.optional(v.string()), // gentle | motivating | analytical
    reduceMotion: v.optional(v.boolean()),
    timezoneOffsetMinutes: v.optional(v.number()), // new Date().getTimezoneOffset() from browser
    // Plan 007 section 3.2 profile fields. Optional so pre-restart rows stay valid.
    timeZone: v.optional(v.string()), // IANA zone, the only input to local dates (D15)
    goal: v.optional(v.union(v.literal("lose"), v.literal("maintain"), v.literal("gain"))),
    sex: v.optional(v.union(v.literal("male"), v.literal("female"))),
    heightCm: v.optional(v.number()),
    dob: v.optional(v.string()), // YYYY-MM-DD
    activity: v.optional(
      v.union(
        v.literal("sedentary"),
        v.literal("light"),
        v.literal("moderate"),
        v.literal("active"),
        v.literal("very_active"),
      ),
    ),
    dietType: v.optional(v.union(
      v.literal("veg"),
      v.literal("eggetarian"),
      v.literal("non_veg"),
      v.literal("vegan"),
      v.literal("jain"),
    )), // legacy single diet, read through dietsOf
    dietTypes: v.optional(v.array(v.union(
      v.literal("veg"),
      v.literal("eggetarian"),
      v.literal("non_veg"),
      v.literal("vegan"),
      v.literal("jain"),
    ))),
    targetWeightKg: v.optional(v.number()),
    pace: v.optional(v.union(v.literal("relaxed"), v.literal("steady"), v.literal("fast"))),
    trainingDaysPerWeek: v.optional(v.number()),
    calorieTarget: v.optional(v.object({
      kcal: v.number(),
      source: v.union(v.literal("formula"), v.literal("adaptive")),
      appliedLocalDate: v.string(),
      clamped: v.optional(v.union(v.literal("pace_cap"), v.literal("floor"))),
    })),
  }).index("by_user", ["userId"]),

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
    memoryType: v.optional(v.union(v.literal("explicit"), v.literal("inferred"))),
    approvalStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    provenance: v.optional(v.string()),
    sourceActionIds: v.optional(v.array(v.string())),
    undoneAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
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

  // ─── Restart ledger (plan 007 section 3.2) ─────────────────────────────────
  // userId is the Clerk subject, matching user_settings and the older tables.

  foods: defineTable({
    name: v.string(),
    aliases: v.array(v.string()),
    searchText: v.string(), // name and aliases joined, so "chawal" finds rice
    per100g: nutrientsValidator, // unrounded
    source: foodSourceValidator,
    sourceId: v.string(),
    verified: v.boolean(),
    ownerUserId: v.optional(v.string()), // set on source "user" and "ai_estimate" rows; only that user sees them
    note: v.optional(v.string()), // assumptions behind an AI estimate, shown on the draft card
  })
    .index("by_source_and_sourceId", ["source", "sourceId"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_ownerUserId_and_source", ["ownerUserId", "source"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["source", "verified", "ownerUserId"] }),

  food_portions: defineTable({
    foodId: v.id("foods"),
    source: foodSourceValidator,
    measure: v.string(), // normalized unit, e.g. "cup"
    description: v.string(), // source label, e.g. "cup, chopped"
    gramsPerMeasure: v.number(),
  }).index("by_foodId_and_description", ["foodId", "description"]),

  user_measures: defineTable({
    userId: v.string(),
    measure: v.string(),
    ml: v.optional(v.number()),
    grams: v.optional(v.number()),
  }).index("by_userId_and_measure", ["userId", "measure"]),

  // Append-only: every change inserts a revision row. Only `status` changes on older rows.
  entries: defineTable({
    userId: v.string(),
    localDate: v.string(),
    timeZone: v.string(),
    slot: mealSlotValidator,
    loggedAt: v.number(), // instant the food was eaten
    foodId: v.id("foods"),
    foodName: v.string(),
    grams: v.number(),
    nutrients: nutrientsValidator, // unrounded snapshot of foods.per100g × grams
    source: entrySourceValidator,
    confidence: v.number(),
    flags: v.array(v.string()),
    revision: v.number(),
    supersedes: v.optional(v.id("entries")),
    entryKey: v.optional(v.id("entries")),
    op: revisionOpValidator,
    status: revisionStatusValidator,
    createdBy: createdByValidator,
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    submissionId: v.string(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_userId_and_localDate_and_status", ["userId", "localDate", "status"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"]),

  // Unrounded running sums of live entries per day. Unknown counts keep null fiber/sugar/sodium reversible.
  day_totals: defineTable({
    userId: v.string(),
    localDate: v.string(),
    entryCount: v.number(),
    kcal: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    fiber: v.number(),
    sugar: v.number(),
    sodiumMg: v.number(),
    fiberUnknown: v.number(),
    sugarUnknown: v.number(),
    sodiumMgUnknown: v.number(),
  }).index("by_userId_and_localDate", ["userId", "localDate"]),

  // Plan 3.2 calls this `workouts`.
  workout_sessions: defineTable({
    userId: v.string(),
    localDate: v.string(),
    timeZone: v.string(),
    name: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    timing: v.optional(v.union(v.literal("live"), v.literal("logged"))),
    durationMin: v.optional(v.number()),
    notes: v.optional(v.string()),
    submissionId: v.string(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_userId_and_localDate", ["userId", "localDate"])
    .index("by_userId_and_startedAt", ["userId", "startedAt"])
    .index("by_userId_and_deletedAt_and_startedAt", ["userId", "deletedAt", "startedAt"])
    .index("by_userId_and_endedAt_and_deletedAt_and_startedAt", ["userId", "endedAt", "deletedAt", "startedAt"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"]),

  sets: defineTable({
    userId: v.string(),
    sessionId: v.id("workout_sessions"),
    exerciseId: v.id("exercises"),
    setIndex: v.number(),
    reps: v.number(),
    weightKg: v.number(),
    weightBasis: v.optional(v.union(v.literal("total"), v.literal("each"))),
    rpe: v.optional(v.number()),
    revision: v.number(),
    op: v.optional(revisionOpValidator),
    supersedes: v.optional(v.id("sets")),
    status: revisionStatusValidator,
    submissionId: v.string(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_sessionId_and_status", ["sessionId", "status"])
    .index("by_sessionId_and_exerciseId_and_setIndex", ["sessionId", "exerciseId", "setIndex"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_userId_and_exerciseId_and_status", ["userId", "exerciseId", "status"]),

  exercises: defineTable({
    sourceId: v.string(),
    ownerId: v.optional(v.string()),
    normalizedName: v.optional(v.string()),
    name: v.string(),
    category: v.string(),
    equipment: v.union(v.string(), v.null()),
    mechanic: v.union(v.string(), v.null()),
    level: v.union(v.string(), v.null()),
    primaryMuscles: v.array(v.string()),
    secondaryMuscles: v.array(v.string()),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_category_and_name", ["category", "name"])
    .index("by_ownerId_and_name", ["ownerId", "name"])
    .index("by_ownerId_and_category_and_name", ["ownerId", "category", "name"])
    .index("by_ownerId_and_normalizedName", ["ownerId", "normalizedName"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["category", "ownerId"] }),

  cardio: defineTable({
    userId: v.string(),
    sessionId: v.id("workout_sessions"),
    exerciseId: v.id("exercises"),
    position: v.number(),
    durationMin: v.optional(v.number()),
    distanceKm: v.optional(v.number()),
    reportedKcal: v.optional(v.number()),
    speedKmh: v.optional(v.number()),
    inclinePct: v.optional(v.number()),
    revision: v.number(),
    op: v.optional(revisionOpValidator),
    supersedes: v.optional(v.id("cardio")),
    status: revisionStatusValidator,
    submissionId: v.string(),
    deletedAt: v.optional(v.number()),
  }).index("by_sessionId_and_status", ["sessionId", "status"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"])
    .index("by_userId_and_status", ["userId", "status"]),

  workout_drafts: defineTable({
    userId: v.string(),
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    submissionId: v.string(),
    status: v.union(v.literal("pending"), v.literal("committed"), v.literal("discarded")),
    source: v.union(v.literal("text"), v.literal("coach"), v.literal("copy"), v.literal("manual")),
    inputText: v.string(),
    mode: v.union(v.literal("new"), v.literal("append"), v.literal("revise")),
    targetSessionId: v.optional(v.id("workout_sessions")),
    needsTarget: v.boolean(),
    localDate: v.string(),
    startTime: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    headSetIds: v.optional(v.array(v.id("sets"))),
    headCardioIds: v.optional(v.array(v.id("cardio"))),
    items: v.array(v.object({
      key: v.string(), name: v.string(), kind: v.union(v.literal("strength"), v.literal("cardio")),
      exerciseId: v.optional(v.id("exercises")), candidateIds: v.array(v.id("exercises")),
      sets: v.array(v.object({ setId: v.optional(v.id("sets")), weightKg: v.optional(v.number()), reps: v.optional(v.number()), weightBasis: v.optional(v.union(v.literal("total"), v.literal("each"))) })),
      cardio: v.optional(v.object({ cardioId: v.optional(v.id("cardio")), durationMin: v.optional(v.number()), distanceKm: v.optional(v.number()), reportedKcal: v.optional(v.number()), speedKmh: v.optional(v.number()), inclinePct: v.optional(v.number()) })),
      replaceSetIds: v.optional(v.array(v.id("sets"))), replaceCardioIds: v.optional(v.array(v.id("cardio"))),
      problems: v.array(v.string()),
    })),
    committedSubmissionId: v.optional(v.string()),
    written: v.optional(v.object({ sessionId: v.id("workout_sessions"), createdSession: v.boolean(), setRevisionIds: v.array(v.id("sets")), cardioRevisionIds: v.array(v.id("cardio")), previousSession: v.optional(v.object({ localDate: v.string(), timeZone: v.string(), startedAt: v.number(), endedAt: v.optional(v.number()), durationMin: v.optional(v.number()), timing: v.optional(v.union(v.literal("live"), v.literal("logged"))) })) })),
    undoneAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_userId_and_submissionId", ["userId", "submissionId"])
    .index("by_userId_and_status", ["userId", "status"]),

  // One row per user while clearAllData's scheduled ledger deletion runs. Ledger writes refuse meanwhile.
  ledger_clears: defineTable({ userId: v.string() }).index("by_userId", ["userId"]),

  weights: defineTable({
    userId: v.string(),
    localDate: v.string(),
    kg: v.number(),
    loggedAt: v.number(),
  }).index("by_userId_and_localDate", ["userId", "localDate"]),

  tdee_snapshots: defineTable({
    userId: v.string(),
    localDate: v.string(),
    estimateKcal: v.number(),
    trendKg: v.number(),
    windowDays: v.number(),
    confidence: v.number(), // logged-day fraction of the window
  }).index("by_userId_and_localDate", ["userId", "localDate"]),

  chats: defineTable({
    userId: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    // The newest visible message, cut for the chat list; null when there is none. Missing on rows from before it was stored.
    lastMessage: v.optional(v.union(v.string(), v.null())),
  }).index("by_userId_and_updatedAt", ["userId", "updatedAt"]),

  messages: defineTable({
    userId: v.string(),
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    text: v.string(),
    attachments: v.array(
      v.object({
        kind: v.union(v.literal("image"), v.literal("audio")),
        storageId: v.id("_storage"),
      }),
    ),
    toolCalls: v.array(
      v.object({
        name: v.string(),
        argsJson: v.string(),
        resultJson: v.optional(v.string()),
      }),
    ),
    draftIds: v.array(v.id("drafts")),
    workoutDraftIds: v.optional(v.array(v.id("workout_drafts"))),
    entryIds: v.optional(v.array(v.id("entries"))),
    submissionId: v.optional(v.string()),
    // User messages: when a turn last started work on it. Assistant replies: the same time, fencing their writes to that attempt.
    claimedAt: v.optional(v.number()),
    audioPending: v.optional(v.boolean()), // user voice messages: claimed, transcript not saved yet
    // Assistant replies. Missing means done (rows from before streaming).
    status: v.optional(v.union(v.literal("streaming"), v.literal("done"), v.literal("stopped"), v.literal("failed"))),
    stopRequested: v.optional(v.boolean()), // assistant replies: the user pressed stop while it streamed
    answersMessageId: v.optional(v.id("messages")), // assistant replies: the user message they answer
    deletedAt: v.optional(v.number()), // a reply replaced by regenerate; hidden everywhere but its entries
    // Assistant replies: a "Log this" button that opens Compose with this food text and/or this photo.
    logAction: v.optional(v.object({ text: v.optional(v.string()), storageId: v.optional(v.id("_storage")) })),
  })
    .index("by_chatId", ["chatId"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"])
    .index("by_answersMessageId", ["answersMessageId"])
    .searchIndex("search_text", { searchField: "text", filterFields: ["userId"] }),

  // The text of a reply while it streams, kept off `messages` so each write doesn't rerun the paged message query.
  // Deleted when the reply ends; the final text is written to the message then.
  reply_streams: defineTable({
    messageId: v.id("messages"),
    userId: v.string(),
    text: v.string(),
  }).index("by_messageId", ["messageId"]),

  // Extracted items awaiting confirmation (D7). Matcher output only; nutrients are computed on commit.
  drafts: defineTable({
    userId: v.string(),
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    submissionId: v.string(),
    status: v.union(v.literal("pending"), v.literal("committed"), v.literal("discarded"), v.literal("expired")),
    items: v.array(
      v.object({
        text: v.string(),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()),
        slot: v.optional(mealSlotValidator),
        localDate: v.optional(v.string()),
        requestedDate: v.optional(v.string()), // a date the gate refused; confirm needs a valid one
        foodId: v.optional(v.id("foods")),
        grams: v.optional(v.number()),
        score: v.optional(v.number()),
        unresolved: v.optional(v.string()),
        portionScale: v.optional(v.number()),
        cookingOil: v.optional(v.boolean()),
        fromPhoto: v.optional(v.boolean()),
        confidence: v.optional(v.number()),
        matchSource: v.optional(matchSourceValidator),
        reasons: v.optional(v.array(v.string())),
        candidateIds: v.optional(v.array(v.id("foods"))),
      }),
    ),
    inputKind: v.optional(inputKindValidator),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"]),

  // Who uploaded each file in `_storage`. Inputs and account clears only touch files the caller owns.
  uploads: defineTable({
    userId: v.string(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_storageId", ["storageId"]),

  // Food memory for the restart pipeline: text the user confirmed for a food. Maps text to a food only; never holds nutrients.
  food_links: defineTable({
    userId: v.string(),
    key: v.string(), // canonical tokens of the item text, e.g. "roti"
    foodId: v.id("foods"),
    status: foodLinkStatusValidator,
    uses: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_and_status_and_key", ["userId", "status", "key"]),

  // Append-only: one confirmed draft item's change to the memory for its key. Undoing the logged entry puts the rows back.
  food_link_events: defineTable({
    userId: v.string(),
    key: v.string(),
    submissionId: v.string(), // the confirmed draft's, shared by its entries
    entryId: v.id("entries"), // the entry this item was logged as
    changes: v.array(
      v.object({
        linkId: v.id("food_links"),
        before: v.union(foodLinkStateValidator, v.null()), // null: the confirmation created the row
        after: foodLinkStateValidator,
      }),
    ),
    undoneAt: v.optional(v.number()), // set once the event is undone or cancelled; unset means it is live
  })
    .index("by_userId_and_key_and_undoneAt", ["userId", "key", "undoneAt"])
    .index("by_userId_and_submissionId", ["userId", "submissionId"]),

  // A user's own OpenRouter key. Never returned to the client; the app only sees whether one is set and its last 4 characters.
  user_api_keys: defineTable({
    userId: v.string(),
    provider: v.literal("openrouter"),
    key: v.string(),
    last4: v.string(),
    updatedAt: v.number(),
  }).index("by_userId_and_provider", ["userId", "provider"]),
});

import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getCoach, classifyCoachType, COACHES, type CoachType } from "./coaches";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const VISION_MODELS = new Set([
  "openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-4-turbo",
  "anthropic/claude-3-opus", "anthropic/claude-3-sonnet", "anthropic/claude-3-haiku",
  "anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-haiku",
  "google/gemini-1.5-pro", "google/gemini-1.5-flash", "google/gemini-2.0-flash",
  "meta-llama/llama-3.2-11b-vision", "meta-llama/llama-3.2-90b-vision",
]);

interface AIMessage { role: string; content: string }

async function callAI(messages: AIMessage[], maxTokens = 500, model?: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    if (data.error) throw new Error(`OpenRouter API error: ${data.error.message}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response");
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("OpenRouter request timed out after 60s");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJSON<T>(text: string, fallback: T): T {
  const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\s\S]*\]/);
  try { return JSON.parse(match ? match[0] : text) as T; } catch { return fallback; }
}

async function parseMealDescription(description: string, mealType: string, time: string, model?: string, apiKey?: string) {
  const prompt = `You are a professional nutritionist. Analyze this meal description carefully — it may be detailed with cooking methods, ingredients, portion sizes, and multiple items.

Meal type: ${mealType || "unspecified"}
User's description:
"""
${description}
"""

Instructions:
1. Identify EVERY ingredient, condiment, and cooking addition (oils, butter, ghee, sauces, etc.).
2. Estimate portion sizes from context clues.
3. Sum macros for ALL ingredients combined.
4. In "components", list the key ingredients or food items detected (e.g. "oats, milk, banana, honey"). Be specific.
5. In "suggestion", give ONE forward-looking sentence about what the user should focus on in their NEXT meal (not criticism of this meal). Example: "Your next meal could use more leafy greens to balance the carbs." or "Great protein hit — aim for similar protein in your next meal."
6. Use the midpoint when you have a range.

Return ONLY a JSON object (no other text, no markdown):
{"name":"short descriptive name (max 4 words)","calories":number,"protein":number,"carbs":number,"fat":number,"components":"comma-separated ingredient list","suggestion":"one forward-looking next-meal tip (max 20 words)"}`;

  const content = await callAI([{ role: "user", content: prompt }], 800, model, apiKey);
  const result = parseJSON<any>(content, { name: description.slice(0, 50), calories: 400, protein: 20, carbs: 35, fat: 15, components: "", suggestion: "" });
  const mealTime = time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return {
    name: result.name || description.slice(0, 50),
    calories: result.calories || 0,
    protein: result.protein || 0,
    carbs: result.carbs || 0,
    fat: result.fat || 0,
    time: mealTime,
    aiSuggestion: result.suggestion || undefined,
    components: result.components || undefined,
    mealType: mealType || "unspecified",
    description,
  };
}

interface UserPhysique {
  weight?: number; // kg
  height?: number; // cm
  age?: number;
  sex?: string;
}

async function parseWorkoutDescription(description: string, duration?: string, intensity?: string, model?: string, apiKey?: string, userPhysique?: UserPhysique) {
  const physiqueInfo = userPhysique?.weight
    ? `\nUser physique: ${userPhysique.weight}kg${userPhysique.height ? `, ${userPhysique.height}cm` : ""}${userPhysique.age ? `, ${userPhysique.age}yo` : ""}${userPhysique.sex ? `, ${userPhysique.sex}` : ""}`
    : "";

  const prompt = `You are a professional fitness trainer. Parse this workout log precisely.

User's workout:
"""
${description}
"""

User-provided duration: ${duration || "not specified"}
User-provided intensity: ${intensity || "not specified"}${physiqueInfo}

Rules:
1. Extract EVERY exercise. Each exercise gets its own entry in "exercises".
2. For each exercise, create one entry in "sets" per set with exact weight and reps.
3. For cardio, use a single set with duration and calories as the reps field.
4. Estimate total session duration if not provided. Determine intensity from volume/load.
5. Estimate total calories burned using MET values and user weight (if provided). Formula: Calories = MET × weight(kg) × duration(hours). Typical METs: walking 3.5, jogging 7, running 10, weightlifting 3-6, HIIT 8-12. If no weight provided, assume 70kg.
6. Session name: max 3 words.

Return ONLY valid JSON:
{"name":"session name","exercises":[{"name":"exercise name","sets":[{"weight":"41kg","reps":"15"}]}],"duration":"estimated total duration","intensity":"LOW|MEDIUM|HIGH|MAX","caloriesBurned":number,"rationale":"one coaching tip (max 15 words)"}`;

  const content = await callAI([{ role: "user", content: prompt }], 1200, model, apiKey);
  const result = parseJSON<any>(content, { name: description.slice(0, 30), exercises: [], duration: duration || "30 min", intensity: intensity || "HIGH", caloriesBurned: 0, rationale: "" });

  const exercises = (result.exercises || []).map((ex: any) => ({
    name: ex.name || "Exercise",
    sets: Array.isArray(ex.sets) ? ex.sets.map((s: any) => ({ weight: String(s.weight || ""), reps: String(s.reps || "") })) : [],
  }));
  const totalSets = exercises.reduce((sum: number, ex: any) => sum + ex.sets.length, 0);
  const setsVal = exercises.length > 0 ? `${exercises.length} exercise${exercises.length !== 1 ? "s" : ""} · ${totalSets} sets` : "–";
  return {
    name: result.name || description.slice(0, 30),
    sets: setsVal,
    duration: result.duration || duration || "30 min",
    intensity: result.intensity || intensity || "HIGH",
    caloriesBurned: typeof result.caloriesBurned === "number" ? result.caloriesBurned : 0,
    rationale: result.rationale || "",
    exercises: exercises.length > 0 ? exercises : null,
    description,
  };
}

// ─── Public actions ───────────────────────────────────────────────────────────

export const estimateMeal = action({
  args: { mealName: v.string() },
  handler: async (ctx, { mealName }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const prompt = `Estimate the nutritional values for this meal: "${mealName}". Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
    const content = await callAI([{ role: "user", content: prompt }], 200, model, apiKey);
    const result = parseJSON<any>(content, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return { calories: result.calories || 0, protein: result.protein || 0, carbs: result.carbs || 0, fat: result.fat || 0 };
  },
});

export const parseMeal = action({
  args: {
    description: v.string(),
    mealType: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, { description, mealType, time }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    return parseMealDescription(description, mealType || "unspecified", time || "", model, apiKey);
  },
});

export const parseWorkout = action({
  args: {
    description: v.string(),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
  },
  handler: async (ctx, { description, duration, intensity }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    let userPhysique: UserPhysique | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
      const profile = await ctx.runQuery(internal.profile.getProfileForContext, { userId });
      if (profile) {
        userPhysique = {
          weight: profile.weight,
          height: profile.height,
          age: profile.age,
          sex: profile.sex,
        };
      }
    }
    return parseWorkoutDescription(description, duration, intensity, model, apiKey, userPhysique);
  },
});

export const logMeal = action({
  args: {
    description: v.optional(v.string()),
    mealType: v.optional(v.string()),
    time: v.optional(v.string()),
    parsedData: v.optional(v.any()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { description, mealType, time, parsedData, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = date ?? new Date().toISOString().split("T")[0];

    const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;

    let data: any;
    if (parsedData) {
      const mealTime = parsedData.time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      const id = await ctx.runMutation(internal.meals.addMealFromAI, {
        userId, date: today,
        name: parsedData.name || "Meal",
        calories: parsedData.calories || 0,
        protein: parsedData.protein || 0,
        carbs: parsedData.carbs || 0,
        fat: parsedData.fat || 0,
        time: mealTime,
        aiSuggestion: parsedData.aiSuggestion,
        mealType: parsedData.mealType || mealType || "unspecified",
        components: parsedData.components,
      });
      data = { _id: id, ...parsedData, time: mealTime };
    } else if (description) {
      const { description: _desc, ...parsedFields } = await parseMealDescription(description, mealType || "unspecified", time || "", model, apiKey);
      const id = await ctx.runMutation(internal.meals.addMealFromAI, { userId, date: today, ...parsedFields });
      data = { _id: id, ...parsedFields };
    } else {
      throw new Error("description or parsedData required");
    }
    return data;
  },
});

export const logWorkout = action({
  args: {
    description: v.optional(v.string()),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
    parsedData: v.optional(v.any()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { description, duration, intensity, parsedData, date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const today = date ?? new Date().toISOString().split("T")[0];

    const [settings, profile] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const userPhysique: UserPhysique | undefined = profile ? {
      weight: profile.weight,
      height: profile.height,
      age: profile.age,
      sex: profile.sex,
    } : undefined;

    let data: any;
    if (parsedData) {
      const id = await ctx.runMutation(internal.workouts.addWorkoutFromAI, {
        userId, date: today,
        name: parsedData.name || "Workout",
        sets: parsedData.sets || "–",
        duration: parsedData.duration || duration || "30 min",
        intensity: parsedData.intensity || intensity || "HIGH",
        exercises: parsedData.exercises,
        rationale: parsedData.rationale,
        caloriesBurned: parsedData.caloriesBurned,
      });
      data = { _id: id, ...parsedData };
    } else if (description) {
      const parsed = await parseWorkoutDescription(description, duration, intensity, model, apiKey, userPhysique);
      const id = await ctx.runMutation(internal.workouts.addWorkoutFromAI, { userId, date: today, ...parsed });
      data = { _id: id, ...parsed };
    } else {
      throw new Error("description or parsedData required");
    }
    return data;
  },
});

export const chat = action({
  args: {
    message: v.string(),
    sessionId: v.optional(v.id("chat_sessions")),
    coachType: v.optional(v.string()),
  },
  handler: async (ctx, { message, sessionId, coachType }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const userName = identity.name ?? "Athlete";
    const today = new Date().toISOString().split("T")[0];

    // Gather context
    const [profile, todayMeals, todayWorkouts, recentCals, settings] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
      ctx.runQuery(internal.meals.getRecentCalories, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
    ]);

    const totalCals = todayMeals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = todayMeals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalBurned = todayWorkouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);

    let contextBlock = `USER PROFILE:\nName: ${userName}\n`;
    if (profile?.weight) contextBlock += `Weight: ${profile.weight}kg\n`;
    if (profile?.height) contextBlock += `Height: ${profile.height}cm\n`;
    if (profile?.age) contextBlock += `Age: ${profile.age}\n`;
    if (profile?.sex) contextBlock += `Sex: ${profile.sex}\n`;
    contextBlock += `Activity Level: ${profile?.activityLevel || "moderate"}\n`;
    if (profile?.goal) contextBlock += `Goal: ${profile.goal}\n`;
    if (profile?.dietaryPreference && profile.dietaryPreference !== "none") {
      contextBlock += `Dietary Preference: ${profile.dietaryPreference} (IMPORTANT: Only suggest foods that comply with this diet)\n`;
    }
    if (profile?.allergies) {
      contextBlock += `Allergies/Avoid: ${profile.allergies} (CRITICAL: Never suggest foods containing these)\n`;
    }
    if (profile?.calorieTarget) contextBlock += `Daily Calorie Target: ${profile.calorieTarget}\n`;
    if (profile?.proteinTarget) contextBlock += `Daily Protein Target: ${profile.proteinTarget}g\n`;
    const totalCarbs = todayMeals.reduce((s: number, m: any) => s + (m.carbs ?? 0), 0);
    const totalFat = todayMeals.reduce((s: number, m: any) => s + (m.fat ?? 0), 0);
    contextBlock += `\nTODAY'S LOG (${today}):\nCalories consumed: ${totalCals}\nCalories burned: ${totalBurned}\nNet calories: ${totalCals - totalBurned}\nProtein: ${totalProtein}g | Carbs: ${totalCarbs}g | Fat: ${totalFat}g\nMeals logged: ${todayMeals.length}\n`;
    if (todayMeals.length > 0) {
      contextBlock += `Meals:\n`;
      todayMeals.forEach((m: any) => {
        contextBlock += `- ${m.name} at ${m.time}: ${m.calories}cal, P:${m.protein}g C:${m.carbs}g F:${m.fat}g`;
        if (m.mealType) contextBlock += ` (${m.mealType})`;
        contextBlock += `\n`;
      });
    }
    contextBlock += `Workouts logged: ${todayWorkouts.length}\n`;
    if (todayWorkouts.length > 0) {
      contextBlock += `Workouts:\n`;
      todayWorkouts.forEach((w: any) => {
        contextBlock += `- ${w.name}: ${w.duration || "?"}, ${w.intensity}, ${w.caloriesBurned ?? 0}kcal burned`;
        if (w.exercises?.length) {
          contextBlock += ` [${w.exercises.map((e: any) => e.name).join(", ")}]`;
        }
        contextBlock += `\n`;
      });
    }
    contextBlock += `\nRECENT 7-DAY TREND:\n${recentCals.map((d: any) => `${d.date}: ${d.cals}cal`).join(", ")}`;

    const loggingPrompt = `\n\nDIRECT LOGGING CAPABILITY:
You can log meals and workouts directly when the user describes them. When a user tells you what they ate or what workout they did, append ONE action block at the very end of your response:

For meals: ⟦LOG_MEAL⟧{"description":"full meal description","mealType":"breakfast|lunch|dinner|snack","time":"HH:MM or empty string"}⟦/LOG_MEAL⟧
For workouts: ⟦LOG_WORKOUT⟧{"description":"full workout description"}⟦/LOG_WORKOUT⟧

Rules:
- ONLY append a log block when the user is clearly reporting what they ate/did
- Do NOT append log blocks for questions, advice requests, or general discussion
- Your message text (before the block) should confirm what you logged and give a brief analysis
- YOU MUST include the markers exactly as shown.`;

    // Load session history
    let history: { role: string; content: string }[] = [];
    let isFirstMessage = false;
    if (sessionId) {
      const [msgs, count] = await Promise.all([
        ctx.runQuery(internal.chat.getMessagesForContext, { userId, sessionId }),
        ctx.runQuery(internal.chat.getMessageCount, { sessionId }),
      ]);
      history = msgs;
      isFirstMessage = count === 0;
    }

    // Save user message
    await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "user", content: message });

    // Detect coach
    let detectedCoach: CoachType = (coachType as CoachType) ?? "overall";
    if (!coachType || coachType === "auto") detectedCoach = classifyCoachType(message);
    const coach = getCoach(detectedCoach);

    const messages: AIMessage[] = [
      { role: "system", content: `${coach.systemPrompt}\n\n${contextBlock}${loggingPrompt}` },
      ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const reply = await callAI(messages, 800, model, apiKey);

    // Parse log blocks
    let cleanReply = reply;
    let loggedItem: any = null;

    const mealMatch = reply.match(/⟦LOG_MEAL⟧([\s\S]*?)⟦\/LOG_MEAL⟧/);
    const workoutMatch = reply.match(/⟦LOG_WORKOUT⟧([\s\S]*?)⟦\/LOG_WORKOUT⟧/);

    if (mealMatch) {
      cleanReply = reply.replace(/⟦LOG_MEAL⟧[\s\S]*?⟦\/LOG_MEAL⟧/, "").trim();
      try {
        const logData = JSON.parse(mealMatch[1].trim());
        const parsed = await parseMealDescription(logData.description || message, logData.mealType || "unspecified", logData.time || "", model, apiKey);
        const mealId = await ctx.runMutation(internal.meals.addMealFromAI, { userId, date: today, ...parsed });
        loggedItem = { type: "meal", data: { _id: mealId, ...parsed } };
      } catch (err) {
        console.error("Failed to log meal from AI:", err);
      }
    } else if (workoutMatch) {
      cleanReply = reply.replace(/⟦LOG_WORKOUT⟧[\s\S]*?⟦\/LOG_WORKOUT⟧/, "").trim();
      try {
        const logData = JSON.parse(workoutMatch[1].trim());
        const userPhysique: UserPhysique | undefined = profile ? {
          weight: profile.weight,
          height: profile.height,
          age: profile.age,
          sex: profile.sex,
        } : undefined;
        const parsed = await parseWorkoutDescription(logData.description || message, undefined, undefined, model, apiKey, userPhysique);
        const workoutId = await ctx.runMutation(internal.workouts.addWorkoutFromAI, { userId, date: today, ...parsed });
        loggedItem = { type: "workout", data: { _id: workoutId, ...parsed } };
      } catch (err) {
        console.error("Failed to log workout from AI:", err);
      }
    }

    // Save AI reply
    await ctx.runMutation(internal.chat.addMessage, { userId, sessionId, role: "ai", content: cleanReply });

    // Update session
    if (sessionId) {
      if (isFirstMessage) {
        try {
          const title = await callAI(
            [
              { role: "system", content: "Generate a short, descriptive title (max 6 words, 40 characters) for a fitness coaching conversation based on the user's first message. Return ONLY the title, no quotes, no punctuation." },
              { role: "user", content: message },
            ],
            40,
            model,
            apiKey,
          );
          const cleanTitle = title.replace(/^["']|["']$/g, "").trim().slice(0, 60);
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { sessionId, title: cleanTitle || message.slice(0, 50) });
        } catch {
          await ctx.runMutation(internal.chat.updateSessionTitleFromAI, { sessionId, title: message.slice(0, 50) });
        }
      } else {
        await ctx.runMutation(internal.chat.touchSession, { sessionId });
      }
    }

    return { reply: cleanReply, loggedItem, coachType: detectedCoach };
  },
});

export const generateDailyInsights = action({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const [meals, workouts, goal, settings, profile] = await Promise.all([
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ctx.runQuery(internal.goals.getDailyGoalForContext, { userId, date }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    const totalCals = meals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = meals.reduce((s: number, m: any) => s + m.protein, 0);
    const totalCarbs = meals.reduce((s: number, m: any) => s + (m.carbs ?? 0), 0);
    const totalFat = meals.reduce((s: number, m: any) => s + (m.fat ?? 0), 0);
    const totalBurned = workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0);

    let userContext = "";
    if (profile?.goal) userContext += `User goal: ${profile.goal}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;
    if (profile?.trainingStyle) userContext += `Training style: ${profile.trainingStyle}. `;

    const mealsList = meals.length > 0 ? `\nMeals today: ${meals.map((m: any) => m.name).join(", ")}` : "";

    const prompt = `${userContext}Today's nutrition & workout data:
- Calories consumed: ${totalCals} (goal: ${goal?.calorieGoal || 2400})
- Calories burned: ${totalBurned}
- Net calories: ${totalCals - totalBurned}
- Protein: ${totalProtein}g (goal: ${goal?.proteinGoal || 180}g)
- Carbs: ${totalCarbs}g | Fat: ${totalFat}g
- Meals logged: ${meals.length}
- Workouts logged: ${workouts.length}${mealsList}

Give 3 short, punchy insights (one sentence each) about their day. Tailor advice to their goal (${profile?.goal || "general fitness"}). Be motivating but direct. Return ONLY a JSON array of 3 strings. Example: ["Protein intake on target. Stay locked in.", "Caloric deficit detected. Fuel up, soldier.", "Zero training logged. The iron doesn't lift itself."]`;

    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    let insights: string[] = [];
    try {
      const match = content.match(/\[[\s\S]*\]/);
      insights = JSON.parse(match ? match[0] : content) as string[];
      if (!Array.isArray(insights)) insights = [];
    } catch {
      insights = [content.slice(0, 100), "Keep pushing forward.", "Data logged successfully."];
    }

    await ctx.runMutation(internal.insights.saveInsights, { userId, date, insights });
    return { insights };
  },
});

export const generateWeeklySummary = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    const weekStart = monday.toISOString().split("T")[0];

    const history = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const date = d.toISOString().split("T")[0];
      const [meals, workouts] = await Promise.all([
        ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
        ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ]);
      history.push({ date, calories: Math.round(meals.reduce((s: number, m: any) => s + m.calories, 0)), burned: Math.round(workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0)), workouts: workouts.length });
    }

    const avgCals = Math.round(history.reduce((s, d) => s + d.calories, 0) / 7);
    const avgBurned = Math.round(history.reduce((s, d) => s + d.burned, 0) / 7);
    const totalWorkouts = history.reduce((s, d) => s + d.workouts, 0);
    const dailyBreakdown = history.map((d) => `${d.date.split("-")[2]}: ${d.calories}cal/${d.burned}burned/${d.workouts}wkt`).join(", ");

    const [settings, profile] = await Promise.all([
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    let userContext = "";
    if (profile?.goal) userContext += `User goal: ${profile.goal}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;
    if (profile?.trainingStyle) userContext += `Training: ${profile.trainingStyle}. `;
    if (profile?.calorieTarget) userContext += `Target: ${profile.calorieTarget}cal/day. `;

    const prompt = `${userContext}Weekly fitness summary:
- Average daily calories: ${avgCals}
- Average daily burned: ${avgBurned}
- Total workouts: ${totalWorkouts}/7 days
- Daily breakdown: ${dailyBreakdown}

Give a brief (2-3 sentences) weekly summary and recommendation tailored to their goal (${profile?.goal || "general fitness"}). Be direct and actionable.`;
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    await ctx.runMutation(internal.insights.saveWeeklySummary, { userId, weekStart, content });
    return { content };
  },
});

export const suggestWorkout = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const [recentWorkouts, settings, profile] = await Promise.all([
      ctx.runQuery(internal.workouts.getRecentWorkoutsDetailed, { userId }),
      ctx.runQuery(internal.profile.getSettingsForContext, { userId }),
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
    ]);

    let userContext = "";
    if (profile?.goal) userContext += `Goal: ${profile.goal}. `;
    if (profile?.trainingStyle) userContext += `Training style: ${profile.trainingStyle}. `;
    if (profile?.weight) userContext += `Weight: ${profile.weight}kg. `;

    const recentSummary = (recentWorkouts as any[]).length > 0
      ? (recentWorkouts as any[]).map((w: any) => {
          const exNames = w.exercises?.map((e: any) => e.name).join(", ") || "";
          return `${w.date}: ${w.name}${exNames ? ` (${exNames})` : ""} — ${w.intensity}`;
        }).join("; ")
      : "no recent workouts";

    const prompt = `${userContext}Last 7 days of workouts: ${recentSummary}

Suggest a workout for today based on their recent training history. Consider muscle group rotation — if they trained chest yesterday, suggest back or legs today. If they had a rest day, suggest a balanced session.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "name": "session name (2-3 words)",
  "exercises": [
    {"name": "Exercise Name", "sets": [{"reps": "12", "weight": "80kg"}, {"reps": "10", "weight": "85kg"}, {"reps": "8", "weight": "90kg"}]},
    {"name": "Another Exercise", "sets": [{"reps": "15", "weight": "bodyweight"}, {"reps": "12", "weight": "bodyweight"}]}
  ],
  "duration": "45 min",
  "intensity": "HIGH",
  "caloriesBurned": 350,
  "rationale": "one sentence why this suits their goal and training history"
}
Include 3-6 exercises with 3-4 sets each. For cardio, use duration as reps field and omit weight. Be specific with exercise names.`;
    const model = settings?.openRouterModel ?? undefined;
    const apiKey = settings?.openRouterKey ?? undefined;
    const content = await callAI([{ role: "user", content: prompt }], 800, model, apiKey);
    return parseJSON<any>(content, {});
  },
});

export const parseNutritionImage = action({
  args: {
    imageDataUrl: v.string(),
    userDescription: v.optional(v.string()),
  },
  handler: async (ctx, { imageDataUrl, userDescription }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }
    const visionModel = model && VISION_MODELS.has(model) ? model : DEFAULT_MODEL;

    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");

    const portionClause = userDescription
      ? ` The user says they have: "${userDescription}". If possible, estimate userPortionGrams for this description.`
      : "";

    const prompt = `This is a nutrition label image.${portionClause} Extract nutritional values per 100g (convert from per-serving using serving size if needed). Return ONLY a JSON object, no markdown:
{"name":"product name","caloriesPer100g":number,"proteinPer100g":number,"carbsPer100g":number,"fatPer100g":number,"servingSize":number_or_null,"servingUnit":"g","userPortionGrams":number_or_null}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: visionModel,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          }],
          max_tokens: 400,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Vision API error ${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty vision response");
      const result = parseJSON<any>(content, null);
      if (!result) throw new Error("Could not parse nutrition from image");
      return {
        name: result.name || "Scanned Product",
        caloriesPer100g: Number(result.caloriesPer100g) || 0,
        proteinPer100g: Number(result.proteinPer100g) || 0,
        carbsPer100g: Number(result.carbsPer100g) || 0,
        fatPer100g: Number(result.fatPer100g) || 0,
        servingSize: result.servingSize ? Number(result.servingSize) : undefined,
        servingUnit: result.servingUnit || "g",
        userPortionGrams: result.userPortionGrams ? Number(result.userPortionGrams) : undefined,
        source: "scan" as const,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("Vision request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
});

export const estimatePortion = action({
  args: {
    baseName: v.string(),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatPer100g: v.number(),
    servingSize: v.optional(v.number()),
    servingUnit: v.optional(v.string()),
    portionDescription: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const servingClause = args.servingSize
      ? `Serving size: ${args.servingSize}${args.servingUnit || "g"}.`
      : "";

    const prompt = `Product: ${args.baseName}
Nutrition per 100g: ${args.caloriesPer100g} cal, ${args.proteinPer100g}g protein, ${args.carbsPer100g}g carbs, ${args.fatPer100g}g fat.
${servingClause}
User portion description: "${args.portionDescription}"

Estimate the total grams the user consumed based on their description, then calculate exact macros from the per-100g data. Return ONLY a JSON object (no markdown, no explanation):
{"grams":number,"calories":number,"protein":number,"carbs":number,"fat":number}`;

    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    const result = parseJSON<any>(content, {});
    const ratio = (result.grams || 0) / 100;
    return {
      grams: result.grams || 0,
      calories: result.calories || Math.round(args.caloriesPer100g * ratio),
      protein: result.protein || Math.round(args.proteinPer100g * ratio * 10) / 10,
      carbs: result.carbs || Math.round(args.carbsPer100g * ratio * 10) / 10,
      fat: result.fat || Math.round(args.fatPer100g * ratio * 10) / 10,
    };
  },
});

export const calculateProfileMacros = action({
  args: {
    weight: v.number(),
    height: v.number(),
    age: v.number(),
    activityLevel: v.optional(v.string()),
  },
  handler: async (ctx, { weight, height, age, activityLevel }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const prompt = `Calculate optimal daily macronutrient targets for:
- Weight: ${weight}kg
- Height: ${height}cm
- Age: ${age}
- Activity Level: ${activityLevel || "moderate"}

Return ONLY a JSON object with these keys (numbers only, no text):
- calories: daily calorie target
- protein: grams of protein
- carbs: grams of carbs
- fat: grams of fat
- explanation: one sentence explaining the reasoning (max 15 words)`;

    const content = await callAI([{ role: "user", content: prompt }], 300, model, apiKey);
    const result = parseJSON<any>(content, {});
    if (!result.calories) {
      const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, intense: 1.9 };
      const tdee = Math.round(bmr * (multipliers[activityLevel || "moderate"] || 1.55));
      return { calories: tdee, protein: Math.round(weight * 2), carbs: Math.round((tdee * 0.45) / 4), fat: Math.round((tdee * 0.25) / 9), explanation: "Calculated using Mifflin-St Jeor equation." };
    }
    return { calories: result.calories || 2000, protein: result.protein || Math.round(weight * 2), carbs: result.carbs || 250, fat: result.fat || 65, explanation: result.explanation || "" };
  },
});

export const regenerateSuggestion = action({
  args: {
    mealName: v.string(),
    mealComponents: v.optional(v.string()),
    mealCalories: v.number(),
    mealProtein: v.number(),
    mealCarbs: v.number(),
    mealFat: v.number(),
    remainingCalories: v.optional(v.number()),
    remainingProtein: v.optional(v.number()),
    remainingCarbs: v.optional(v.number()),
    remainingFat: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    let model: string | undefined;
    let apiKey: string | undefined;
    if (userId) {
      const settings = await ctx.runQuery(internal.profile.getSettingsForContext, { userId });
      model = settings?.openRouterModel ?? undefined;
      apiKey = settings?.openRouterKey ?? undefined;
    }

    const budgetContext = args.remainingCalories != null
      ? `\nDaily remaining: ${args.remainingCalories} kcal, ${args.remainingProtein}g protein, ${args.remainingCarbs}g carbs, ${args.remainingFat}g fat.`
      : "";

    const prompt = `You are a professional nutritionist. Give ONE forward-looking sentence about what the user should focus on in their NEXT meal (not criticism of this meal).

Meal: "${args.mealName}"
Components: ${args.mealComponents || "unknown"}
Macros: ${args.mealCalories} kcal, ${args.mealProtein}g protein, ${args.mealCarbs}g carbs, ${args.mealFat}g fat${budgetContext}

Return ONLY a short JSON object: {"suggestion":"one forward-looking next-meal tip (max 25 words)"}`;

    const content = await callAI([{ role: "user", content: prompt }], 400, model, apiKey);
    const result = parseJSON<any>(content, { suggestion: "" });
    return { suggestion: result.suggestion || "" };
  },
});

export const getCoaches = query({
  args: {},
  handler: async () => {
    const list = Object.values(COACHES).map(({ id, name, tagline }) => ({ id, name, tagline }));
    return [{ id: "auto", name: "Auto", tagline: "Automatically route to the right coach" }, ...list];
  },
});

export const transcribe = action({
  args: { audio: v.string(), mimeType: v.optional(v.string()) },
  handler: async (_ctx, { audio, mimeType }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in Convex environment");

    const mime = mimeType || "audio/webm";
    const ext = mime === "audio/mp4" ? "mp4" : mime === "audio/wav" ? "wav" : "webm";

    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    formData.append("model", "whisper-large-v3-turbo");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") throw new Error("Groq transcription timed out after 30s");
      throw err;
    }
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Groq transcription error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { text?: string; error?: { message?: string } };
    if (data.error) throw new Error(`Groq error: ${data.error.message}`);
    if (!data.text) throw new Error("Groq returned empty transcription");
    return { transcript: data.text.trim() };
  },
});

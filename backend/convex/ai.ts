import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getCoach, classifyCoachType, COACHES, type CoachType } from "./coaches";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface AIMessage { role: string; content: string }

async function callAI(messages: AIMessage[], maxTokens = 500): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "openai/gpt-4o-mini", messages, max_tokens: maxTokens }),
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

async function parseMealDescription(description: string, mealType: string, time: string) {
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
4. In "breakdown", list key ingredients with estimated calories as a compact string.
5. Use the midpoint when you have a range.

Return ONLY a JSON object (no other text, no markdown):
{"name":"short descriptive name (max 4 words)","calories":number,"protein":number,"carbs":number,"fat":number,"breakdown":"compact ingredient summary (max 80 chars)","suggestion":"one nutrition tip (max 15 words)"}`;

  const content = await callAI([{ role: "user", content: prompt }], 800);
  const result = parseJSON<any>(content, { name: description.slice(0, 50), calories: 400, protein: 20, carbs: 35, fat: 15 });
  const mealTime = time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const aiNote = result.breakdown
    ? result.suggestion ? `${result.breakdown} — ${result.suggestion}` : result.breakdown
    : result.suggestion || undefined;
  return {
    name: result.name || description.slice(0, 50),
    calories: result.calories || 0,
    protein: result.protein || 0,
    carbs: result.carbs || 0,
    fat: result.fat || 0,
    time: mealTime,
    aiSuggestion: aiNote,
    mealType: mealType || "unspecified",
    description,
  };
}

async function parseWorkoutDescription(description: string, duration?: string, intensity?: string) {
  const prompt = `You are a professional fitness trainer. Parse this workout log precisely.

User's workout:
"""
${description}
"""

User-provided duration: ${duration || "not specified"}
User-provided intensity: ${intensity || "not specified"}

Rules:
1. Extract EVERY exercise. Each exercise gets its own entry in "exercises".
2. For each exercise, create one entry in "sets" per set with exact weight and reps.
3. For cardio, use a single set with duration and calories as the reps field.
4. Estimate total session duration if not provided. Determine intensity from volume/load.
5. Session name: max 3 words.

Return ONLY valid JSON:
{"name":"session name","exercises":[{"name":"exercise name","sets":[{"weight":"41kg","reps":"15"}]}],"duration":"estimated total duration","intensity":"LOW|MEDIUM|HIGH|MAX","rationale":"one coaching tip (max 15 words)"}`;

  const content = await callAI([{ role: "user", content: prompt }], 1200);
  const result = parseJSON<any>(content, { name: description.slice(0, 30), exercises: [], duration: duration || "30 min", intensity: intensity || "HIGH", rationale: "" });

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
    rationale: result.rationale || "",
    exercises: exercises.length > 0 ? exercises : null,
    description,
  };
}

// ─── Public actions ───────────────────────────────────────────────────────────

export const estimateMeal = action({
  args: { mealName: v.string() },
  handler: async (_ctx, { mealName }) => {
    const prompt = `Estimate the nutritional values for this meal: "${mealName}". Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
    const content = await callAI([{ role: "user", content: prompt }], 200);
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
  handler: async (_ctx, { description, mealType, time }) => {
    return parseMealDescription(description, mealType || "unspecified", time || "");
  },
});

export const parseWorkout = action({
  args: {
    description: v.string(),
    duration: v.optional(v.string()),
    intensity: v.optional(v.string()),
  },
  handler: async (_ctx, { description, duration, intensity }) => {
    return parseWorkoutDescription(description, duration, intensity);
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
      });
      data = { _id: id, ...parsedData, time: mealTime };
    } else if (description) {
      const { description: _desc, ...parsedFields } = await parseMealDescription(description, mealType || "unspecified", time || "");
      const id = await ctx.runMutation(internal.meals.addMealFromAI, { userId, date: today, ...parsedFields });
      data = { _id: id, ...parsed };
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
      });
      data = { _id: id, ...parsedData };
    } else if (description) {
      const parsed = await parseWorkoutDescription(description, duration, intensity);
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
    const [profile, todayMeals, todayWorkouts, recentCals] = await Promise.all([
      ctx.runQuery(internal.profile.getProfileForContext, { userId }),
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date: today }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date: today }),
      ctx.runQuery(internal.meals.getRecentCalories, { userId }),
    ]);

    const totalCals = todayMeals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = todayMeals.reduce((s: number, m: any) => s + m.protein, 0);

    let contextBlock = `USER PROFILE:\nName: ${userName}\n`;
    if (profile?.weight) contextBlock += `Weight: ${profile.weight}kg\n`;
    if (profile?.height) contextBlock += `Height: ${profile.height}cm\n`;
    if (profile?.age) contextBlock += `Age: ${profile.age}\n`;
    contextBlock += `Activity Level: ${profile?.activityLevel || "moderate"}\n`;
    if (profile?.calorieTarget) contextBlock += `Daily Calorie Target: ${profile.calorieTarget}\n`;
    if (profile?.proteinTarget) contextBlock += `Daily Protein Target: ${profile.proteinTarget}g\n`;
    contextBlock += `\nTODAY'S LOG (${today}):\nCalories consumed: ${totalCals}\nProtein: ${totalProtein}g\nMeals logged: ${todayMeals.length}\n`;
    if (todayMeals.length > 0) contextBlock += `Meals: ${todayMeals.map((m: any) => `${m.name} (${m.calories}cal, ${m.time})`).join(", ")}\n`;
    contextBlock += `Workouts logged: ${todayWorkouts.length}\n`;
    if (todayWorkouts.length > 0) contextBlock += `Workouts: ${todayWorkouts.map((w: any) => `${w.name} (${w.duration}, ${w.intensity})`).join(", ")}\n`;
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

    const reply = await callAI(messages, 800);

    // Parse log blocks
    let cleanReply = reply;
    let loggedItem: any = null;

    const mealMatch = reply.match(/⟦LOG_MEAL⟧([\s\S]*?)⟦\/LOG_MEAL⟧/);
    const workoutMatch = reply.match(/⟦LOG_WORKOUT⟧([\s\S]*?)⟦\/LOG_WORKOUT⟧/);

    if (mealMatch) {
      cleanReply = reply.replace(/⟦LOG_MEAL⟧[\s\S]*?⟦\/LOG_MEAL⟧/, "").trim();
      try {
        const logData = JSON.parse(mealMatch[1].trim());
        const parsed = await parseMealDescription(logData.description || message, logData.mealType || "unspecified", logData.time || "");
        const mealId = await ctx.runMutation(internal.meals.addMealFromAI, { userId, date: today, ...parsed });
        loggedItem = { type: "meal", data: { _id: mealId, ...parsed } };
      } catch (err) {
        console.error("Failed to log meal from AI:", err);
      }
    } else if (workoutMatch) {
      cleanReply = reply.replace(/⟦LOG_WORKOUT⟧[\s\S]*?⟦\/LOG_WORKOUT⟧/, "").trim();
      try {
        const logData = JSON.parse(workoutMatch[1].trim());
        const parsed = await parseWorkoutDescription(logData.description || message);
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

    const [meals, workouts, goal] = await Promise.all([
      ctx.runQuery(internal.meals.getMealsForContext, { userId, date }),
      ctx.runQuery(internal.workouts.getWorkoutsForContext, { userId, date }),
      ctx.runQuery(internal.goals.getDailyGoalForContext, { userId, date }),
    ]);

    const totalCals = meals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = meals.reduce((s: number, m: any) => s + m.protein, 0);

    const prompt = `Today's nutrition & workout data for user:
- Calories consumed: ${totalCals} (goal: ${goal?.calorieGoal || 2400})
- Protein: ${totalProtein}g (goal: ${goal?.proteinGoal || 180}g)
- Meals logged: ${meals.length}
- Workouts logged: ${workouts.length}

Give 3 short, punchy insights (one sentence each) about their day. Be motivating but direct. Use military/cyberpunk tone. Return ONLY a JSON array of 3 strings. Example: ["Protein intake on target. Stay locked in.", "Caloric deficit detected. Fuel up, soldier.", "Zero training logged. The iron doesn't lift itself."]`;

    const content = await callAI([{ role: "user", content: prompt }], 300);
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
      history.push({ date, calories: Math.round(meals.reduce((s: number, m: any) => s + m.calories, 0)), workouts: workouts.length });
    }

    const avgCals = Math.round(history.reduce((s, d) => s + d.calories, 0) / 7);
    const totalWorkouts = history.reduce((s, d) => s + d.workouts, 0);
    const dailyBreakdown = history.map((d) => `${d.date.split("-")[2]}: ${d.calories}cal/${d.workouts}wkt`).join(", ");

    const prompt = `Weekly fitness summary for user:
- Average daily calories: ${avgCals}
- Total workouts: ${totalWorkouts}/7 days
- Daily breakdown: ${dailyBreakdown}

Give a brief (2-3 sentences) weekly summary and recommendation. Military/cyberpunk tone. Be direct.`;

    const content = await callAI([{ role: "user", content: prompt }], 300);
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

    const recentNames = await ctx.runQuery(internal.workouts.getRecentWorkoutNames, { userId });
    const prompt = `Suggest a workout for today. Recent workouts: ${recentNames.join(", ") || "none"}.
Return ONLY a JSON object with: name (exercise name), sets (string like "4x10"), reps (string), weight (string like "135lbs or Bodyweight"), duration (string like "45 min"), intensity (one of: LOW, MEDIUM, HIGH, MAX), rationale (one sentence why). No explanation.`;

    const content = await callAI([{ role: "user", content: prompt }], 300);
    return parseJSON<any>(content, {});
  },
});

export const calculateProfileMacros = action({
  args: {
    weight: v.number(),
    height: v.number(),
    age: v.number(),
    activityLevel: v.optional(v.string()),
  },
  handler: async (_ctx, { weight, height, age, activityLevel }) => {
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

    const content = await callAI([{ role: "user", content: prompt }], 300);
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

export const getCoaches = query({
  args: {},
  handler: async () => {
    const list = Object.values(COACHES).map(({ id, name, tagline }) => ({ id, name, tagline }));
    return [{ id: "auto", name: "Auto", tagline: "Automatically route to the right coach" }, ...list];
  },
});

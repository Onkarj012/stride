import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { MealEstimate, WorkoutSuggestion } from "../types.js";

const router = Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface AIMessage {
  role: string;
  content: string;
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
}

async function callAI(
  messages: AIMessage[],
  maxTokens = 500,
): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    }),
  });
  const data = (await response.json()) as OpenAIResponse;
  return data.choices?.[0]?.message?.content || "";
}

router.post("/estimate-meal", requireAuth, async (req: Request, res: Response) => {
  try {
    const { mealName } = req.body as { mealName?: string };
    if (!mealName) {
      res.status(400).json({ error: "Meal name required" });
      return;
    }

    const prompt = `Estimate the nutritional values for this meal: "${mealName}". Return ONLY a JSON object with keys: calories (number), protein (number in grams), carbs (number in grams), fat (number in grams). No explanation.`;
    const content = await callAI([{ role: "user", content: prompt }], 200);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = JSON.parse(
      jsonMatch ? jsonMatch[0] : content,
    ) as MealEstimate;

    res.json({
      calories: result.calories || 0,
      protein: result.protein || 0,
      carbs: result.carbs || 0,
      fat: result.fat || 0,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/chat", requireAuth, async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message) {
      res.status(400).json({ error: "Message required" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    const profile = db
      .prepare("SELECT * FROM user_profiles WHERE user_id = ?")
      .get(req.user.userId) as any;

    const todayMeals = db
      .prepare("SELECT name, calories, protein, carbs, fat, time FROM meals WHERE user_id = ? AND date = ?")
      .all(req.user.userId, today) as any[];

    const todayWorkouts = db
      .prepare("SELECT name, sets, duration, intensity FROM workouts WHERE user_id = ? AND date = ?")
      .all(req.user.userId, today) as any[];

    const recentDays = db
      .prepare(
        "SELECT date, SUM(calories) as cals FROM meals WHERE user_id = ? GROUP BY date ORDER BY date DESC LIMIT 7"
      )
      .all(req.user.userId) as any[];

    const totalCals = todayMeals.reduce((s: number, m: any) => s + m.calories, 0);
    const totalProtein = todayMeals.reduce((s: number, m: any) => s + m.protein, 0);

    let contextBlock = `USER PROFILE:\n`;
    contextBlock += `Name: ${req.user.name}\n`;
    if (profile?.weight) contextBlock += `Weight: ${profile.weight}kg\n`;
    if (profile?.height) contextBlock += `Height: ${profile.height}cm\n`;
    if (profile?.age) contextBlock += `Age: ${profile.age}\n`;
    contextBlock += `Activity Level: ${profile?.activity_level || "moderate"}\n`;
    if (profile?.calorie_target) contextBlock += `Daily Calorie Target: ${profile.calorie_target}\n`;
    if (profile?.protein_target) contextBlock += `Daily Protein Target: ${profile.protein_target}g\n`;
    if (profile?.carb_target) contextBlock += `Daily Carb Target: ${profile.carb_target}g\n`;
    if (profile?.fat_target) contextBlock += `Daily Fat Target: ${profile.fat_target}g\n`;

    contextBlock += `\nTODAY'S LOG (${today}):\n`;
    contextBlock += `Calories consumed: ${totalCals}\n`;
    contextBlock += `Protein: ${totalProtein}g\n`;
    contextBlock += `Meals logged: ${todayMeals.length}\n`;
    if (todayMeals.length > 0) {
      contextBlock += `Meals: ${todayMeals.map((m: any) => `${m.name} (${m.calories}cal, ${m.time})`).join(", ")}\n`;
    }
    contextBlock += `Workouts logged: ${todayWorkouts.length}\n`;
    if (todayWorkouts.length > 0) {
      contextBlock += `Workouts: ${todayWorkouts.map((w: any) => `${w.name} (${w.duration}, ${w.intensity})`).join(", ")}\n`;
    }

    contextBlock += `\nRECENT 7-DAY TREND:\n`;
    contextBlock += recentDays.map((d: any) => `${d.date}: ${Math.round(d.cals || 0)}cal`).join(", ");

    const history = db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 20",
      )
      .all(req.user.userId) as { role: string; content: string }[];

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          `You are StrideCoach, an elite AI fitness and nutrition coach for Stride. You're direct, motivating, and use a bold, military-inspired tone. You have access to the user's profile, today's meals/workouts, and recent history. Give concise, actionable advice. Keep responses under 4 sentences. Address the user by their name when appropriate. Be specific - reference their actual data, targets, and progress. If they ask about nutrition, calculate macros from their targets. If they ask about workouts, suggest based on their recent activity. Use terms like 'OPERATOR' occasionally.\n\n${contextBlock}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const reply = await callAI(messages, 300);

    db.prepare(
      "INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)",
    ).run(req.user.userId, "ai", reply);

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post(
  "/daily-insights",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { date } = req.body as { date?: string };
      if (!date) {
        res.status(400).json({ error: "Date required" });
        return;
      }

      const meals = db
        .prepare("SELECT * FROM meals WHERE user_id = ? AND date = ?")
        .all(req.user.userId, date) as {
        calories: number;
        protein: number;
      }[];

      const workouts = db
        .prepare("SELECT * FROM workouts WHERE user_id = ? AND date = ?")
        .all(req.user.userId, date);

      const goal = db
        .prepare("SELECT * FROM daily_goals WHERE user_id = ? AND date = ?")
        .get(req.user.userId, date) as
        | { calorie_goal: number; protein_goal: number }
        | undefined;

      const totalCals = meals.reduce((s, m) => s + m.calories, 0);
      const totalProtein = meals.reduce((s, m) => s + m.protein, 0);

      const prompt = `Today's nutrition & workout data for user:
- Calories consumed: ${totalCals} (goal: ${goal?.calorie_goal || 2400})
- Protein: ${totalProtein}g (goal: ${goal?.protein_goal || 180}g)
- Meals logged: ${meals.length}
- Workouts logged: ${workouts.length}

Give 3 short, punchy insights (one sentence each) about their day. Be motivating but direct. Use military/cyberpunk tone. Return ONLY a JSON array of 3 strings. Example: ["Protein intake on target. Stay locked in.", "Caloric deficit detected. Fuel up, soldier.", "Zero training logged. The iron doesn't lift itself."]`;

      const content = await callAI([{ role: "user", content: prompt }], 300);

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      const insights = JSON.parse(
        jsonMatch ? jsonMatch[0] : content,
      ) as string[];

      db.prepare(
        "INSERT OR REPLACE INTO insights (id, user_id, date, content) VALUES (?, ?, ?, ?)",
      ).run(uuidv4(), req.user.userId, date, JSON.stringify(insights));

      res.json({ insights });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/workout-suggestion",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const recentWorkouts = db
        .prepare(
          "SELECT name FROM workouts WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
        )
        .all(req.user.userId) as { name: string }[];

      const recentNames = recentWorkouts.map((w) => w.name).join(", ");
      const prompt = `Suggest a workout for today. Recent workouts: ${recentNames || "none"}.
Return ONLY a JSON object with: name (exercise name), sets (string like "4x10"), reps (string), weight (string like "135lbs or Bodyweight"), duration (string like "45 min"), intensity (one of: LOW, MEDIUM, HIGH, MAX), rationale (one sentence why). No explanation.`;

      const content = await callAI([{ role: "user", content: prompt }], 300);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(
        jsonMatch ? jsonMatch[0] : content,
      ) as WorkoutSuggestion;

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/weekly-summary",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      const weekStart = monday.toISOString().split("T")[0];

      interface DayData {
        date: string;
        calories: number;
        workouts: number;
      }

      const history: DayData[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const date = d.toISOString().split("T")[0];

        const meals = db
          .prepare(
            "SELECT SUM(calories) as cals FROM meals WHERE user_id = ? AND date = ?",
          )
          .get(req.user.userId, date) as
          | { cals: number | null }
          | undefined;

        const workoutCount = db
          .prepare(
            "SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND date = ?",
          )
          .get(req.user.userId, date) as { count: number } | undefined;

        history.push({
          date,
          calories: Math.round(meals?.cals ?? 0),
          workouts: workoutCount?.count ?? 0,
        });
      }

      const avgCals = Math.round(
        history.reduce((s, d) => s + d.calories, 0) / 7,
      );
      const totalWorkouts = history.reduce((s, d) => s + d.workouts, 0);
      const dailyBreakdown = history
        .map(
          (d) => `${d.date.split("-")[2]}: ${d.calories}cal/${d.workouts}wkt`,
        )
        .join(", ");

      const prompt = `Weekly fitness summary for user:
- Average daily calories: ${avgCals}
- Total workouts: ${totalWorkouts}/7 days
- Daily breakdown: ${dailyBreakdown}

Give a brief (2-3 sentences) weekly summary and recommendation. Military/cyberpunk tone. Be direct.`;

      const content = await callAI([{ role: "user", content: prompt }], 300);

      db.prepare(
        "INSERT OR REPLACE INTO weekly_summaries (id, user_id, week_start, content) VALUES (?, ?, ?, ?)",
      ).run(uuidv4(), req.user.userId, weekStart, content);

      res.json({ content });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post("/log-meal", requireAuth, async (req: Request, res: Response) => {
  try {
    const { description, mealType, time } = req.body as {
      description?: string;
      mealType?: string;
      time?: string;
    };
    if (!description) {
      res.status(400).json({ error: "Meal description required" });
      return;
    }

    const prompt = `Analyze this meal and estimate ALL nutritional values based on the description. Be realistic and thorough.

Meal type: ${mealType || "general"}
Description: "${description}"

Return ONLY a JSON object with these exact keys (no other text):
- name: a short name for the meal (max 4 words)
- calories: total calories (number)
- protein: grams of protein (number)
- carbs: grams of carbs (number)
- fat: grams of fat (number)
- suggestion: a one-sentence tip about this meal (max 15 words)`;

    const content = await callAI([{ role: "user", content: prompt }], 300);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : content) as any;

    const id = uuidv4();
    const today = new Date().toISOString().split("T")[0];
    const mealTime = time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

    db.prepare(
      "INSERT INTO meals (id, user_id, date, name, calories, protein, carbs, fat, time, ai_suggestion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, req.user.userId, today, result.name || description.slice(0, 50), result.calories || 0, result.protein || 0, result.carbs || 0, result.fat || 0, mealTime, result.suggestion || null);

    res.json({
      _id: id,
      name: result.name || description.slice(0, 50),
      calories: result.calories || 0,
      protein: result.protein || 0,
      carbs: result.carbs || 0,
      fat: result.fat || 0,
      time: mealTime,
      suggestion: result.suggestion || null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/log-workout", requireAuth, async (req: Request, res: Response) => {
  try {
    const { description, duration, intensity } = req.body as {
      description?: string;
      duration?: string;
      intensity?: string;
    };
    if (!description) {
      res.status(400).json({ error: "Workout description required" });
      return;
    }

    const prompt = `Analyze this workout description and estimate the details. Be realistic.

Description: "${description}"
Duration: ${duration || "not specified"}
Intensity: ${intensity || "not specified"}

Return ONLY a JSON object with these exact keys (no other text):
- name: a short exercise/workout name (max 3 words)
- sets: estimated sets (string like "3x12" or "4x8")
- reps: reps per set (string)
- weight: estimated weight used (string like "135lbs" or "Bodyweight")
- duration: formatted duration (string like "30 min")
- intensity: one of LOW, MEDIUM, HIGH, MAX
- rationale: one sentence why this is a good workout (max 15 words)`;

    const content = await callAI([{ role: "user", content: prompt }], 300);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : content) as any;

    const id = uuidv4();
    const today = new Date().toISOString().split("T")[0];

    db.prepare(
      "INSERT INTO workouts (id, user_id, date, name, sets, reps, weight, duration, intensity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      req.user.userId,
      today,
      result.name || description.slice(0, 30),
      result.sets || "3x10",
      result.reps || "10",
      result.weight || "Bodyweight",
      result.duration || duration || "30 min",
      result.intensity || intensity || "HIGH",
    );

    res.json({
      _id: id,
      name: result.name || description.slice(0, 30),
      sets: result.sets || "3x10",
      reps: result.reps || "10",
      weight: result.weight || "Bodyweight",
      duration: result.duration || duration || "30 min",
      intensity: result.intensity || intensity || "HIGH",
      rationale: result.rationale || "",
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

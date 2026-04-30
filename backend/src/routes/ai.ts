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

    const history = db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 20",
      )
      .all(req.user.userId) as { role: string; content: string }[];

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are NutriBot 9000, an AI fitness and nutrition coach for Stride. You're direct, motivating, and use a cyberpunk/military tone. Give concise, actionable advice about workouts, nutrition, and fitness. Keep responses under 3 sentences. Use terms like 'OPERATOR' to address the user.",
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

export default router;

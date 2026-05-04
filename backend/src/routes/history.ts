import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/history/calendar?year=YYYY&month=M
router.get("/calendar", requireAuth, (req: Request, res: Response) => {
  const { year, month } = req.query as { year?: string; month?: string };
  if (!year || !month) {
    res.status(400).json({ error: "year and month required" });
    return;
  }

  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    res.status(400).json({ error: "Invalid year or month" });
    return;
  }

  // Build date range: YYYY-MM-01 to YYYY-MM-DD (last day)
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const mealRows = db
    .prepare(
      "SELECT date, COUNT(*) as meal_count, SUM(calories) as total_calories FROM meals WHERE user_id = ? AND date >= ? AND date <= ? GROUP BY date"
    )
    .all(req.user.userId, startDate, endDate) as { date: string; meal_count: number; total_calories: number }[];

  const workoutRows = db
    .prepare(
      "SELECT date, COUNT(*) as workout_count FROM workouts WHERE user_id = ? AND date >= ? AND date <= ? GROUP BY date"
    )
    .all(req.user.userId, startDate, endDate) as { date: string; workout_count: number }[];

  // Build result map
  const result: Record<string, { meals: number; workouts: number; calories: number }> = {};

  for (const row of mealRows) {
    result[row.date] = {
      meals: row.meal_count,
      workouts: 0,
      calories: Math.round(row.total_calories || 0),
    };
  }

  for (const row of workoutRows) {
    if (result[row.date]) {
      result[row.date].workouts = row.workout_count;
    } else {
      result[row.date] = { meals: 0, workouts: row.workout_count, calories: 0 };
    }
  }

  res.json(result);
});

// GET /api/history/day?date=YYYY-MM-DD
router.get("/day", requireAuth, (req: Request, res: Response) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "date required" });
    return;
  }

  const mealRows = db
    .prepare("SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY time")
    .all(req.user.userId, date) as any[];

  const workoutRows = db
    .prepare("SELECT * FROM workouts WHERE user_id = ? AND date = ?")
    .all(req.user.userId, date) as any[];

  const meals = mealRows.map((m: any) => ({
    _id: m.id,
    name: m.name,
    calories: m.calories,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    time: m.time,
    mealType: m.meal_type,
    aiSuggestion: m.ai_suggestion,
    date: m.date,
  }));

  const workouts = workoutRows.map((w: any) => ({
    _id: w.id,
    name: w.name,
    intensity: w.intensity,
    duration: w.duration,
    sets: w.sets,
    exercises: w.exercises ? JSON.parse(w.exercises) : null,
    date: w.date,
    rationale: w.rationale || null,
  }));

  res.json({ meals, workouts });
});

export default router;

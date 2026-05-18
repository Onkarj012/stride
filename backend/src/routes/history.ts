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

// GET /api/history/insights?days=30
router.get("/insights", requireAuth, (req: Request, res: Response) => {
  const { days } = req.query as { days?: string };
  const dayCount = Math.min(90, Math.max(7, parseInt(days || "30", 10)));

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - dayCount * 86400000).toISOString().split("T")[0];

  const mealRows = db
    .prepare(
      `SELECT date, SUM(calories) as total_calories, SUM(protein) as total_protein, SUM(carbs) as total_carbs, SUM(fat) as total_fat, COUNT(*) as meal_count
       FROM meals WHERE user_id = ? AND date >= ? AND date <= ? GROUP BY date ORDER BY date`
    )
    .all(req.user.userId, startDate, endDate) as any[];

  const workoutRows = db
    .prepare(
      `SELECT date, COUNT(*) as workout_count FROM workouts WHERE user_id = ? AND date >= ? AND date <= ? GROUP BY date ORDER BY date`
    )
    .all(req.user.userId, startDate, endDate) as any[];

  const goalRow = db
    .prepare("SELECT calorie_goal, protein_goal, carb_goal, fat_goal FROM daily_goals WHERE user_id = ? ORDER BY date DESC LIMIT 1")
    .get(req.user.userId) as any;

  const result: any[] = [];
  const mealMap = new Map(mealRows.map((r: any) => [r.date, r]));
  const workoutMap = new Map(workoutRows.map((r: any) => [r.date, r]));

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const m = mealMap.get(dateStr);
    const w = workoutMap.get(dateStr);
    result.unshift({
      date: dateStr,
      calories: Math.round(m?.total_calories || 0),
      protein: Math.round(m?.total_protein || 0),
      carbs: Math.round(m?.total_carbs || 0),
      fat: Math.round(m?.total_fat || 0),
      meals: m?.meal_count || 0,
      workouts: w?.workout_count || 0,
    });
  }

  res.json({
    daily: result,
    goals: {
      calories: goalRow?.calorie_goal || 2400,
      protein: goalRow?.protein_goal || 180,
      carbs: goalRow?.carb_goal || 280,
      fat: goalRow?.fat_goal || 80,
    },
  });
});

export default router;

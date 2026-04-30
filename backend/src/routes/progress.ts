import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { ProgressDay } from "../types.js";

const router = Router();

interface CalSum {
  cals: number | null;
  prot: number | null;
}

interface CountResult {
  count: number;
}

interface GoalResult {
  calorie_goal: number;
}

router.get("/", requireAuth, (req: Request, res: Response) => {
  const { days } = req.query as { days?: string };
  const numDays = parseInt(days ?? "7") || 7;

  const history: ProgressDay[] = [];
  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split("T")[0];

    const meals = db
      .prepare(
        "SELECT SUM(calories) as cals, SUM(protein) as prot FROM meals WHERE user_id = ? AND date = ?",
      )
      .get(req.user.userId, date) as CalSum | undefined;

    const workouts = db
      .prepare(
        "SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND date = ?",
      )
      .get(req.user.userId, date) as CountResult | undefined;

    const goal = db
      .prepare(
        "SELECT calorie_goal FROM daily_goals WHERE user_id = ? AND date = ?",
      )
      .get(req.user.userId, date) as GoalResult | undefined;

    history.push({
      date,
      dayLabel: dayNames[d.getDay()],
      calories: Math.round(meals?.cals ?? 0),
      protein: Math.round(meals?.prot ?? 0),
      workouts: workouts?.count ?? 0,
      goal: goal?.calorie_goal ?? 2400,
    });
  }

  res.json(history);
});

export default router;

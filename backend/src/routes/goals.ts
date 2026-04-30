import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { GoalRow, GoalResponse } from "../types.js";

const router = Router();

router.get("/", requireAuth, (req: Request, res: Response) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "Date required" });
    return;
  }

  let goal = db
    .prepare("SELECT * FROM daily_goals WHERE user_id = ? AND date = ?")
    .get(req.user.userId, date) as GoalRow | undefined;

  if (!goal) {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO daily_goals (id, user_id, date) VALUES (?, ?, ?)",
    ).run(id, req.user.userId, date);
    goal = {
      id,
      user_id: req.user.userId,
      date,
      calorie_goal: 2400,
      protein_goal: 180,
      carb_goal: 280,
      fat_goal: 80,
    };
  }

  const result: GoalResponse = {
    calorieGoal: goal.calorie_goal,
    proteinGoal: goal.protein_goal,
    carbGoal: goal.carb_goal,
    fatGoal: goal.fat_goal,
  };

  res.json(result);
});

export default router;

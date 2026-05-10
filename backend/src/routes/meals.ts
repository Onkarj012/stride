import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { MealRow, MealResponse } from "../types.js";

const router = Router();

router.get("/", requireAuth, (req: Request, res: Response) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "Date required" });
    return;
  }

  const meals = db
    .prepare("SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY time")
    .all(req.user.userId, date) as MealRow[];

  const result: MealResponse[] = meals.map((m) => ({
    _id: m.id,
    name: m.name,
    calories: m.calories,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    time: m.time,
    date: m.date,
    aiSuggestion: m.ai_suggestion,
    mealType: m.meal_type,
  }));

  res.json(result);
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  try {
    const { name, calories, protein, carbs, fat, time, date, mealType, aiSuggestion } = req.body as {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      time: string;
      date?: string;
      mealType?: string;
      aiSuggestion?: string;
    };
    const id = uuidv4();
    const targetDate = date || new Date().toISOString().split("T")[0];

    db.prepare(
      "INSERT INTO meals (id, user_id, date, name, calories, protein, carbs, fat, time, ai_suggestion, meal_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      req.user.userId,
      targetDate,
      name,
      calories,
      protein || 0,
      carbs || 0,
      fat || 0,
      time,
      aiSuggestion || null,
      mealType || "unspecified",
    );

    res.json({ _id: id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const { name, calories, protein, carbs, fat, time, mealType, aiSuggestion } = req.body as {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      time: string;
      mealType?: string;
      aiSuggestion?: string | null;
    };

    const meal = db
      .prepare("SELECT * FROM meals WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.userId);
    if (!meal) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }

    db.prepare(
      "UPDATE meals SET name=?, calories=?, protein=?, carbs=?, fat=?, time=?, meal_type=?, ai_suggestion=? WHERE id=?",
    ).run(name, calories, protein || 0, carbs || 0, fat || 0, time, mealType || "unspecified", aiSuggestion ?? null, req.params.id);

    res.json({ _id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    db.prepare("DELETE FROM meals WHERE id = ? AND user_id = ?").run(
      req.params.id,
      req.user.userId,
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

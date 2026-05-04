import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { WorkoutRow, WorkoutResponse } from "../types.js";

const router = Router();

router.get("/", requireAuth, (req: Request, res: Response) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "Date required" });
    return;
  }

  const workouts = db
    .prepare("SELECT * FROM workouts WHERE user_id = ? AND date = ?")
    .all(req.user.userId, date) as WorkoutRow[];

  const result: WorkoutResponse[] = workouts.map((w) => ({
    _id: w.id,
    name: w.name,
    sets: w.sets,
    reps: w.reps,
    weight: w.weight,
    duration: w.duration,
    intensity: w.intensity,
    date: w.date,
    exercises: w.exercises ? JSON.parse(w.exercises as unknown as string) : null,
    rationale: (w as any).rationale || null,
  }));

  res.json(result);
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  try {
    const { name, sets, reps, weight, duration, intensity } = req.body as {
      name: string;
      sets: string;
      reps: string | null;
      weight: string | null;
      duration: string | null;
      intensity: string;
    };
    const id = uuidv4();
    const today = new Date().toISOString().split("T")[0];

    db.prepare(
      "INSERT INTO workouts (id, user_id, date, name, sets, reps, weight, duration, intensity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      req.user.userId,
      today,
      name,
      sets,
      reps ?? null,
      weight ?? null,
      duration ?? null,
      intensity || "HIGH",
    );

    res.json({ _id: id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const { name, sets, reps, weight, duration, intensity } = req.body as {
      name: string;
      sets: string;
      reps: string | null;
      weight: string | null;
      duration: string | null;
      intensity: string;
    };

    const workout = db
      .prepare("SELECT * FROM workouts WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.userId);
    if (!workout) {
      res.status(404).json({ error: "Workout not found" });
      return;
    }

    db.prepare(
      "UPDATE workouts SET name=?, sets=?, reps=?, weight=?, duration=?, intensity=? WHERE id=?",
    ).run(
      name,
      sets,
      reps ?? null,
      weight ?? null,
      duration ?? null,
      intensity,
      req.params.id,
    );

    res.json({ _id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    db.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(
      req.params.id,
      req.user.userId,
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

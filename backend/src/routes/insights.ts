import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/daily", requireAuth, (req: Request, res: Response) => {
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "Date required" });
    return;
  }

  const insight = db
    .prepare("SELECT * FROM insights WHERE user_id = ? AND date = ?")
    .get(req.user.userId, date) as { content: string } | undefined;

  if (!insight) {
    res.json({ insights: [] });
    return;
  }

  try {
    res.json({ insights: JSON.parse(insight.content) });
  } catch {
    res.json({ insights: [insight.content] });
  }
});

router.get("/weekly", requireAuth, (req: Request, res: Response) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  const weekStart = monday.toISOString().split("T")[0];

  const summary = db
    .prepare(
      "SELECT * FROM weekly_summaries WHERE user_id = ? AND week_start = ?",
    )
    .get(req.user.userId, weekStart) as { content: string } | undefined;

  if (!summary) {
    res.json(null);
    return;
  }
  res.json({ content: summary.content });
});

export default router;

import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { ChatMessageRow } from "../types.js";

const router = Router();

router.get("/", requireAuth, (req: Request, res: Response) => {
  const messages = db
    .prepare(
      "SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC",
    )
    .all(req.user.userId) as ChatMessageRow[];

  res.json(messages);
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  try {
    const { role, content } = req.body as { role: string; content: string };
    db.prepare(
      "INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)",
    ).run(req.user.userId, role, content);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

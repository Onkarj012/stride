import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/chat/sessions — list all sessions for user, newest first
router.get("/sessions", requireAuth, (req: Request, res: Response) => {
  const sessions = db
    .prepare(
      "SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC"
    )
    .all(req.user.userId);
  res.json(sessions);
});

// POST /api/chat/sessions — create a new session
router.post("/sessions", requireAuth, (req: Request, res: Response) => {
  try {
    const id = uuidv4();
    const { title } = req.body as { title?: string };
    const sessionTitle = (title || "New Chat").slice(0, 60);
    db.prepare(
      "INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)"
    ).run(id, req.user.userId, sessionTitle);
    const session = db
      .prepare("SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ?")
      .get(id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/chat/sessions/:id — delete session and all its messages
router.delete("/sessions/:id", requireAuth, (req: Request, res: Response) => {
  try {
    // Delete messages first (session_id FK may not cascade if null)
    db.prepare("DELETE FROM chat_messages WHERE session_id = ? AND user_id = ?").run(
      req.params.id,
      req.user.userId
    );
    db.prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?").run(
      req.params.id,
      req.user.userId
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/chat/sessions/:id/messages — get messages for a session
router.get("/sessions/:id/messages", requireAuth, (req: Request, res: Response) => {
  const messages = db
    .prepare(
      "SELECT role, content, created_at FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC"
    )
    .all(req.user.userId, req.params.id);
  res.json(messages);
});

// PATCH /api/chat/sessions/:id — update session title
router.patch("/sessions/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const { title } = req.body as { title?: string };
    if (!title) {
      res.status(400).json({ error: "Title required" });
      return;
    }
    const sessionTitle = title.slice(0, 60);
    db.prepare(
      "UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(sessionTitle, req.params.id, req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Legacy: DELETE / — clear all chat messages for user
router.delete("/", requireAuth, (req: Request, res: Response) => {
  try {
    db.prepare("DELETE FROM chat_messages WHERE user_id = ?").run(req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

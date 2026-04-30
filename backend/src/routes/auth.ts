import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };
    if (!email || !password || !name) {
      res.status(400).json({ error: "All fields required" });
      return;
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const token = uuidv4();

    db.prepare(
      "INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)",
    ).run(userId, email, name, passwordHash);
    db.prepare("INSERT INTO user_tokens (user_id, token) VALUES (?, ?)").run(
      userId,
      token,
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as { id: string; password_hash: string } | undefined;
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = uuidv4();
    db.prepare("INSERT INTO user_tokens (user_id, token) VALUES (?, ?)").run(
      user.id,
      token,
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({
    userId: req.user.userId,
    name: req.user.name,
    email: req.user.email,
  });
});

router.post("/logout", requireAuth, (req: Request, res: Response) => {
  db.prepare("DELETE FROM user_tokens WHERE token = ? AND user_id = ?").run(
    req.token,
    req.user.userId,
  );
  res.json({ ok: true });
});

export default router;

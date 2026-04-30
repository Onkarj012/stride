import type { Request, Response, NextFunction } from "express";
import db from "../db.js";

interface AuthRow {
  id: string;
  email: string;
  name: string;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const token = authHeader.split(" ")[1];

  const row = db
    .prepare(
      "SELECT u.id, u.email, u.name FROM user_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
    )
    .get(token) as AuthRow | undefined;

  if (!row) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.user = { userId: row.id, email: row.email, name: row.name };
  req.token = token;
  next();
}

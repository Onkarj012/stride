import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import db from "../db.js";

declare global {
  namespace Express {
    interface Request {
      user: { userId: string; name: string; email: string };
    }
  }
}

export async function ensureUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      next();
      return;
    }

    let user = db
      .prepare("SELECT id, email, name FROM users WHERE id = ?")
      .get(userId) as { id: string; email: string; name: string } | undefined;

    if (!user) {
      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress || "";
        const name = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "Athlete";
        db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").run(userId, email, name);
        user = { id: userId, email, name };
      } catch {
        db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").run(userId, "", "Athlete");
        user = { id: userId, email: "", name: "Operator" };
      }
    }

    req.user = { userId: user.id, name: user.name, email: user.email };
  } catch (err) {
    console.error("ensureUser error:", err);
  }
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

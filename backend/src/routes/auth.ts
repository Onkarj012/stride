import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json({
    userId: req.user.userId,
    name: req.user.name,
    email: req.user.email,
  });
});

export default router;

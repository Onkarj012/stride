import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, (req: Request, res: Response) => {
  const profile = db
    .prepare("SELECT * FROM user_profiles WHERE user_id = ?")
    .get(req.user.userId) as any;

  if (!profile) {
    res.json({
      weight: null,
      height: null,
      age: null,
      activityLevel: "moderate",
      calorieTarget: null,
      proteinTarget: null,
      carbTarget: null,
      fatTarget: null,
    });
    return;
  }

  res.json({
    weight: profile.weight,
    height: profile.height,
    age: profile.age,
    activityLevel: profile.activity_level,
    calorieTarget: profile.calorie_target,
    proteinTarget: profile.protein_target,
    carbTarget: profile.carb_target,
    fatTarget: profile.fat_target,
  });
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  try {
    const { weight, height, age, activityLevel, calorieTarget, proteinTarget, carbTarget, fatTarget } =
      req.body as {
        weight?: number | null;
        height?: number | null;
        age?: number | null;
        activityLevel?: string;
        calorieTarget?: number | null;
        proteinTarget?: number | null;
        carbTarget?: number | null;
        fatTarget?: number | null;
      };

    db.prepare(
      `INSERT INTO user_profiles (user_id, weight, height, age, activity_level, calorie_target, protein_target, carb_target, fat_target, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         weight = COALESCE(excluded.weight, user_profiles.weight),
         height = COALESCE(excluded.height, user_profiles.height),
         age = COALESCE(excluded.age, user_profiles.age),
         activity_level = COALESCE(excluded.activity_level, user_profiles.activity_level),
         calorie_target = COALESCE(excluded.calorie_target, user_profiles.calorie_target),
         protein_target = COALESCE(excluded.protein_target, user_profiles.protein_target),
         carb_target = COALESCE(excluded.carb_target, user_profiles.carb_target),
         fat_target = COALESCE(excluded.fat_target, user_profiles.fat_target),
         updated_at = datetime('now')`,
    ).run(
      req.user.userId,
      weight ?? null,
      height ?? null,
      age ?? null,
      activityLevel ?? "moderate",
      calorieTarget ?? null,
      proteinTarget ?? null,
      carbTarget ?? null,
      fatTarget ?? null,
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

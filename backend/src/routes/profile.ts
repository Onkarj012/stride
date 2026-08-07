import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const activityLevels = new Set(["sedentary", "light", "moderate", "active", "intense"]);

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
    const body = req.body as {
      weight?: number | null;
      height?: number | null;
      age?: number | null;
      activityLevel?: string;
      calorieTarget?: number | null;
      proteinTarget?: number | null;
      carbTarget?: number | null;
      fatTarget?: number | null;
    };
    const { weight, height, age, activityLevel, calorieTarget, proteinTarget, carbTarget, fatTarget } =
      body;
    const hasField = (field: keyof typeof body) =>
      Object.prototype.hasOwnProperty.call(body, field);

    const normalizedActivityLevel = activityLevel ?? "moderate";
    if (!activityLevels.has(normalizedActivityLevel)) {
      res.status(400).json({ error: "Invalid activity level" });
      return;
    }

    db.prepare(
      `INSERT INTO user_profiles (user_id, weight, height, age, activity_level, calorie_target, protein_target, carb_target, fat_target, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         weight = CASE WHEN ? = 1 THEN excluded.weight ELSE user_profiles.weight END,
         height = CASE WHEN ? = 1 THEN excluded.height ELSE user_profiles.height END,
         age = CASE WHEN ? = 1 THEN excluded.age ELSE user_profiles.age END,
         activity_level = CASE WHEN ? = 1 THEN excluded.activity_level ELSE user_profiles.activity_level END,
         calorie_target = CASE WHEN ? = 1 THEN excluded.calorie_target ELSE user_profiles.calorie_target END,
         protein_target = CASE WHEN ? = 1 THEN excluded.protein_target ELSE user_profiles.protein_target END,
         carb_target = CASE WHEN ? = 1 THEN excluded.carb_target ELSE user_profiles.carb_target END,
         fat_target = CASE WHEN ? = 1 THEN excluded.fat_target ELSE user_profiles.fat_target END,
         updated_at = datetime('now')`,
    ).run(
      req.user.userId,
      weight ?? null,
      height ?? null,
      age ?? null,
      normalizedActivityLevel,
      calorieTarget ?? null,
      proteinTarget ?? null,
      carbTarget ?? null,
      fatTarget ?? null,
      Number(hasField("weight")),
      Number(hasField("height")),
      Number(hasField("age")),
      Number(hasField("activityLevel")),
      Number(hasField("calorieTarget")),
      Number(hasField("proteinTarget")),
      Number(hasField("carbTarget")),
      Number(hasField("fatTarget")),
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

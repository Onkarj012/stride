import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
dotenv.config();

import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { ensureUser } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import mealsRoutes from "./routes/meals.js";
import workoutsRoutes from "./routes/workouts.js";
import goalsRoutes from "./routes/goals.js";
import progressRoutes from "./routes/progress.js";
import insightsRoutes from "./routes/insights.js";
import chatRoutes from "./routes/chat.js";
import aiRoutes from "./routes/ai.js";
import profileRoutes from "./routes/profile.js";
import historyRoutes from "./routes/history.js";

const app = express();
const PORT = process.env.PORT || 3210;

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5175", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use(express.json());

app.use(clerkMiddleware());
app.use(ensureUser);

app.use("/api/auth", authRoutes);
app.use("/api/meals", mealsRoutes);
app.use("/api/workouts", workoutsRoutes);
app.use("/api/goals", goalsRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/history", historyRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Stride backend running on http://localhost:${PORT}`);
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    console.log(`OpenRouter API key loaded: sk-or-...${key.slice(-6)}`);
  } else {
    console.error("⚠️  OPENROUTER_API_KEY is NOT set — AI features will fail!");
  }
});

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily AI insights for active users (06:00 UTC).
crons.daily("daily insights", { hourUTC: 6, minuteUTC: 0 }, internal.ai.cronDailyInsights, {});

// Weekly AI summary for active users (Monday 07:00 UTC).
crons.weekly(
  "weekly summary",
  { dayOfWeek: "monday", hourUTC: 7, minuteUTC: 0 },
  internal.ai.cronWeeklySummary,
  {},
);

crons.hourly("window nudges", { minuteUTC: 0 }, internal.nudges.dispatchWindowNudges, {});

export default crons;

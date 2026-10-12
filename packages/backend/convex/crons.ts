import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// 00:00 UTC is 05:30 IST; every user's window ends on their previous complete local day.
crons.cron("daily adaptive TDEE", "0 0 * * *", internal.tdee_recompute.recomputeDaily, {});
export default crons;

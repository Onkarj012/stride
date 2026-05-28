import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const ensureUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { name, email }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const clerkId = identity.subject;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existing) return existing._id;

    return ctx.db.insert("users", { clerkId, name, email });
  },
});

export const clearAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const tables = ["meals", "workouts", "daily_goals", "insights", "weekly_summaries", "chat_messages", "water_logs", "sleep_logs", "mood_logs", "steps_logs"] as const;
    for (const table of tables) {
      const rows = await (ctx.db.query(table as any) as any)
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
        .collect()
        .catch(() => ctx.db.query(table as any).withIndex("by_user" as any, (q: any) => q.eq("userId", userId)).collect().catch(() => []));
      await Promise.all(rows.map((r: any) => ctx.db.delete(r._id)));
    }

    // Reset gamification
    const gam = await ctx.db.query("user_gamification").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (gam) await ctx.db.delete(gam._id);
  },
});

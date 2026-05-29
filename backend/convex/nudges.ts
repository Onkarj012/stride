import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { recordBehaviorRow, activeUserIds, deriveBehaviorProfile } from "./behavior";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function utcDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Shared create with dedupe on (userId, type, window, date). Returns id or null if deduped. */
export async function createNudgeRow(
  ctx: any,
  args: {
    userId: string;
    type: string;
    title: string;
    body: string;
    window?: string;
    deepLink?: string;
    delivery?: string;
    date?: string;
  },
) {
  const date = args.date ?? utcDate(Date.now());
  const active = await ctx.db
    .query("nudges")
    .withIndex("by_user_status", (q: any) => q.eq("userId", args.userId).eq("status", "active"))
    .collect();
  const dupe = active.find(
    (n: any) => n.type === args.type && (n.window ?? null) === (args.window ?? null) && n.date === date,
  );
  if (dupe) return null;
  return ctx.db.insert("nudges", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    window: args.window,
    status: "active",
    delivery: args.delivery ?? "in_app",
    deepLink: args.deepLink,
    date,
    createdAt: Date.now(),
  });
}

export const createNudge = internalMutation({
  args: {
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    window: v.optional(v.string()),
    deepLink: v.optional(v.string()),
    delivery: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => createNudgeRow(ctx, args),
});

export const getActiveNudges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("nudges")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const dismissNudge = mutation({
  args: { id: v.id("nudges") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const nudge = await ctx.db.get(id);
    if (!nudge || nudge.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, { status: "dismissed", dismissedAt: Date.now() });
    await recordBehaviorRow(ctx, userId, "nudge_dismiss", nudge.window ?? nudge.type);
  },
});

// ─── Window nudge dispatcher (Task 7 cron target) ───────────────────────────

type Window = "morning" | "day" | "evening" | "night";

const WINDOW_NUDGES: Record<Window, { title: string; body: string; deepLink: string }> = {
  morning: { title: "Plan your day", body: "Log breakfast and set today's intent.", deepLink: "/" },
  day: { title: "Midday check-in", body: "Stay on pace — log lunch and hydrate.", deepLink: "/?log=water" },
  evening: { title: "Evening reflection", body: "How did today go? A quick reflection helps tomorrow.", deepLink: "/insights" },
  night: { title: "Wind down", body: "Set tonight's sleep target so tomorrow starts right.", deepLink: "/?log=sleep" },
};

export function windowForHour(hour: number): Window {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

/**
 * Creates a window-appropriate nudge for each active user, skipping users who
 * have recently dismissed that window (behavioral fatigue). Deduped per day.
 */
export const dispatchWindowNudges = internalMutation({
  args: { hour: v.optional(v.number()), date: v.optional(v.string()) },
  handler: async (ctx, { hour, date }) => {
    const window = windowForHour(hour ?? new Date().getUTCHours());
    const today = date ?? utcDate(Date.now());
    const content = WINDOW_NUDGES[window];
    const users = await activeUserIds(ctx, 3);
    let created = 0;

    for (const userId of users) {
      const rows = await ctx.db
        .query("user_behavior")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .collect();
      const profile = deriveBehaviorProfile(rows);
      if (profile.dismissedNudges.includes(window)) continue; // fatigued → skip
      const id = await createNudgeRow(ctx, {
        userId,
        type: `window_${window}`,
        title: content.title,
        body: content.body,
        window,
        deepLink: content.deepLink,
        date: today,
      });
      if (id) created++;
    }
    return { window, created };
  },
});

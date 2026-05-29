import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

function utcDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Shared insert used by recordBehavior and other modules (e.g. nudges). */
export async function recordBehaviorRow(
  ctx: any,
  userId: string,
  kind: string,
  key: string,
  value?: string,
  date?: string,
) {
  const ts = Date.now();
  await ctx.db.insert("user_behavior", {
    userId,
    kind,
    key,
    value,
    date: date ?? utcDate(ts),
    ts,
  });
}

export const recordBehavior = mutation({
  args: {
    kind: v.string(),
    key: v.string(),
    value: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { kind, key, value, date }) => {
    const userId = await requireUserId(ctx);
    await recordBehaviorRow(ctx, userId, kind, key, value, date);
  },
});

/** Internal variant for crons/actions that already know the userId. */
export const recordBehaviorFor = internalMutation({
  args: { userId: v.string(), kind: v.string(), key: v.string(), value: v.optional(v.string()) },
  handler: async (ctx, { userId, kind, key, value }) => {
    await recordBehaviorRow(ctx, userId, kind, key, value);
  },
});

const WINDOWS = ["morning", "day", "evening", "night"];

/** Pure aggregation over recent behavior rows → compact derived profile. */
export function deriveBehaviorProfile(
  rows: Array<{ kind: string; key: string; value?: string; date: string; ts: number }>,
  now: number = Date.now(),
) {
  const cutoff = now - 30 * 86_400_000;
  const recent = rows.filter((r) => r.ts >= cutoff);

  const countBy = (kind: string) => {
    const m: Record<string, number> = {};
    for (const r of recent) if (r.kind === kind) m[r.key] = (m[r.key] ?? 0) + 1;
    return m;
  };
  const topKeys = (m: Record<string, number>, n: number) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);

  const engagement = countBy("engagement");
  const suggestions = countBy("suggestion");
  const coaches = countBy("coach");

  // Nudges dismissed in the last 7 days (used to throttle re-delivery).
  const recentCutoff = now - 7 * 86_400_000;
  const dismissedNudges = Array.from(
    new Set(recent.filter((r) => r.kind === "nudge_dismiss" && r.ts >= recentCutoff).map((r) => r.key)),
  );

  return {
    engagedWindows: topKeys(engagement, 4).filter((w) => WINDOWS.includes(w)),
    topSuggestions: topKeys(suggestions, 5),
    preferredCoach: topKeys(coaches, 1)[0] ?? null,
    dismissedNudges,
    sampleSize: recent.length,
  };
}

export type BehaviorProfile = ReturnType<typeof deriveBehaviorProfile>;

async function loadProfile(ctx: any, userId: string) {
  const rows = await ctx.db
    .query("user_behavior")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return deriveBehaviorProfile(rows);
}

export const getBehaviorProfile = query({
  args: {},
  handler: async (ctx) => loadProfile(ctx, await requireUserId(ctx)),
});

export const getBehaviorProfileForContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => loadProfile(ctx, userId),
});

/** Distinct userIds with a meal or workout logged in the last `days` days. */
export async function activeUserIds(ctx: any, days: number): Promise<string[]> {
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const ids = new Set<string>();
  for (const table of ["meals", "workouts"] as const) {
    const rows = await ctx.db.query(table).filter((q: any) => q.gte(q.field("date"), start)).collect();
    for (const r of rows) ids.add(r.userId);
  }
  return Array.from(ids);
}

export const listActiveUsers = internalQuery({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => activeUserIds(ctx, days ?? 3),
});

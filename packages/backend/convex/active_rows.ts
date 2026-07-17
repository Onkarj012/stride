import type { MutationCtx, QueryCtx } from "./_generated/server";

type ActiveRowTable = "meals" | "workouts" | "water_logs" | "sleep_logs" | "mood_logs" | "steps_logs";
type ReadCtx = QueryCtx | MutationCtx;

/** Read source rows for a user-local date after soft-undo filtering. */
export async function readActiveRowsForDate(
  ctx: ReadCtx,
  table: ActiveRowTable,
  userId: string,
  date: string,
): Promise<any[]> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .collect();
  return rows.filter((row: any) => !row.undoneAt);
}

export async function readActiveSleepForDate(ctx: ReadCtx, userId: string, date: string): Promise<any | null> {
  const rows = await readActiveRowsForDate(ctx, "sleep_logs", userId, date);
  return rows.find((row) => !row.kind || row.kind === "sleep") ?? null;
}

export async function readLatestActiveStepsForDate(ctx: ReadCtx, userId: string, date: string): Promise<any | null> {
  const rows = await readActiveRowsForDate(ctx, "steps_logs", userId, date);
  return rows[0] ?? null;
}

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export type ActionTelemetryEvent =
  | "staged"
  | "committed"
  | "failed"
  | "discarded"
  | "expired"
  | "undone"
  | "already_undone"
  | "already_committed"
  | "clarification_resolved";

export type ActionTelemetryResult = {
  ok: boolean;
  error?: string;
  code?: string;
};

export type ActionTelemetryInput = {
  actionId: string;
  groupId: string;
  userId: string;
  actionType: string;
  event: ActionTelemetryEvent;
  sourceSurface: string;
  model?: string;
  retryCount?: number;
  validationStatus?: string;
  confidence?: number;
  provenance?: string;
  mutationResult: ActionTelemetryResult;
  undoResult?: { status: string; error?: string; code?: string };
  derivedStateVersion?: number;
};

/**
 * Insert exactly one compact lifecycle event. Callers are already inside the
 * canonical transaction, so this deliberately does no reads or fan-out.
 */
export async function insertActionTelemetry(ctx: any, input: ActionTelemetryInput) {
  return ctx.db.insert("action_telemetry", {
    ...input,
    retryCount: input.retryCount ?? 0,
    createdAt: Date.now(),
  });
}

/** Action-safe bridge for lifecycle events emitted from Convex actions. */
export const record = internalMutation({
  args: { input: v.any() },
  handler: async (ctx, { input }) => insertActionTelemetry(ctx, input as ActionTelemetryInput),
});

/** Internal-only debugging read; no public telemetry surface is exposed. */
export const getForGroup = internalQuery({
  args: { groupId: v.id("actionGroups") },
  handler: async (ctx, { groupId }) => {
    return await (ctx as any).db
      .query("action_telemetry")
      .withIndex("by_group", (q: any) => q.eq("groupId", groupId))
      .collect();
  },
});

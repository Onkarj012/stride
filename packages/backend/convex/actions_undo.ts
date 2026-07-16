import { internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { recordBehaviorRow } from "./behavior";
import { recomputeForAction, type DerivedActionType } from "./derived_state";

type DomainTable = "meals" | "workouts" | "water_logs" | "sleep_logs" | "mood_logs" | "steps_logs";

const DOMAIN_TABLES = new Set<DomainTable>([
  "meals",
  "workouts",
  "water_logs",
  "sleep_logs",
  "mood_logs",
  "steps_logs",
]);

function asDomainTable(table: string): DomainTable {
  if (!DOMAIN_TABLES.has(table as DomainTable)) throw new Error(`Unsupported undo table: ${table}`);
  return table as DomainTable;
}

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

type UndoResult = {
  actionId: string;
  groupId: string;
  rowId?: string;
  status: "undone" | "already_undone" | "skipped";
  undoneAt?: number;
  reason?: string;
};

async function reverseCommittedAction(ctx: any, action: any): Promise<UndoResult & { date?: string; actionType?: DerivedActionType }> {
  if (action.status === "undone") {
    return {
      actionId: action._id,
      groupId: action.groupId,
      rowId: action.committedRowRef?.id,
      status: "already_undone",
      undoneAt: action.undoneAt,
    };
  }

  if (action.status !== "committed") throw new Error("Only committed actions can be undone");
  if (!action.reversible) throw new Error("This action is not reversible");
  if (!action.committedRowRef) throw new Error("Committed action has no domain row");

  const table = asDomainTable(action.committedRowRef.table);
  const row = await ctx.db.get(action.committedRowRef.id as any);
  if (!row || row.userId !== action.userId) throw new Error("Undo domain row was not found");

  const undoneAt = Date.now();
  let patch: Record<string, unknown> = { undoneAt };
  const previous = action.payload?.previous;
  if (table === "sleep_logs" && previous && typeof previous === "object") {
    patch = { ...previous, undoneAt };
  } else if (table === "steps_logs" && previous && typeof previous === "object") {
    patch = { ...previous, undoneAt };
  }

  await ctx.db.patch(row._id, patch);
  await ctx.db.patch(action._id, { status: "undone", undoneAt });
  await recordBehaviorRow(ctx, action.userId, "undo", action.actionType, action._id, row.date);

  return {
    actionId: action._id,
    groupId: action.groupId,
    rowId: action.committedRowRef.id,
    status: "undone",
    undoneAt,
    date: row.date,
    actionType: action.actionType === "recovery" && table === "sleep_logs" && action.payload?.kind === "state"
      ? "rest"
      : action.actionType,
  };
}

export const undoAction = mutation({
  args: { actionId: v.id("actions") },
  handler: async (ctx, { actionId }) => {
    const userId = await requireUserId(ctx);
    const action = await ctx.db.get(actionId);
    if (!action || action.userId !== userId) throw new Error("Action not found");

    const result = await reverseCommittedAction(ctx, action);
    if (result.status === "undone") {
      await recomputeForAction(ctx, {
        userId,
        actionType: result.actionType ?? action.actionType,
        date: result.date ?? action.resolvedDate ?? new Date().toISOString().slice(0, 10),
      });
    }
    return result;
  },
});

export const undoGroup = mutation({
  args: { groupId: v.id("actionGroups") },
  handler: async (ctx, { groupId }) => {
    const userId = await requireUserId(ctx);
    const group = await ctx.db.get(groupId);
    if (!group || group.userId !== userId) throw new Error("Action group not found");

    const actions = await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
    const results: UndoResult[] = [];
    const affected = new Map<string, { actionType: DerivedActionType; date: string }>();
    for (const action of actions) {
      if (action.status === "undone") {
        results.push(await reverseCommittedAction(ctx, action));
        continue;
      }
      if (action.status !== "committed") {
        results.push({ actionId: action._id, groupId, status: "skipped", reason: `Action is ${action.status}` });
        continue;
      }
      if (!action.reversible) {
        results.push({ actionId: action._id, groupId, status: "skipped", reason: "Action is not reversible" });
        continue;
      }
      const result = await reverseCommittedAction(ctx, action);
      if (result.actionType && result.date) affected.set(`${result.actionType}:${result.date}`, { actionType: result.actionType, date: result.date });
      results.push(result);
    }

    if (results.some((result) => result.status === "undone")) {
      for (const derived of affected.values()) await recomputeForAction(ctx, { userId, ...derived });
    }
    return { groupId, results };
  },
});

/** Resolve the action envelope for a row returned by a canonical writer. */
export const getCommittedActionForRow = internalQuery({
  args: { userId: v.string(), table: v.string(), rowId: v.string() },
  handler: async (ctx, { userId, table, rowId }) => {
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "committed"))
      .collect();
    return actions.find((action) => action.committedRowRef?.table === table && action.committedRowRef.id === rowId) ?? null;
  },
});

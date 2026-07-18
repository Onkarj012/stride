import { internalQuery, mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { recordBehaviorRow } from "./behavior";
import { recomputeForAction, type DerivedActionType } from "./derived_state";
import { assertTransition } from "./actions_envelope";
import { insertActionTelemetry } from "./telemetry";
import { normalizeName } from "./food_memory_match";

type DomainTable = "meals" | "workouts" | "water_logs" | "sleep_logs" | "mood_logs" | "steps_logs" | "weight_logs";

const DOMAIN_TABLES = new Set<DomainTable>([
  "meals",
  "workouts",
  "water_logs",
  "sleep_logs",
  "mood_logs",
  "steps_logs",
  "weight_logs",
]);

function asDomainTable(table: string): DomainTable {
  if (!DOMAIN_TABLES.has(table as DomainTable)) throw new Error(`Unsupported undo table: ${table}`);
  return table as DomainTable;
}

async function requireUserId(ctx: MutationCtx): Promise<string> {
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
  date?: string;
  actionType?: DerivedActionType;
};

async function recordUndoTelemetry(
  ctx: MutationCtx,
  group: Doc<"actionGroups">,
  action: Doc<"actions">,
  result: UndoResult,
  derivedStateVersion?: number,
) {
  await insertActionTelemetry(ctx, {
    actionId: String(action._id),
    groupId: String(action.groupId),
    userId: action.userId,
    actionType: action.actionType,
    event: result.status === "undone" ? "undone" : result.status === "already_undone" ? "already_undone" : "failed",
    sourceSurface: group.sourceSurface,
    model: group.model,
    retryCount: action.retryCount ?? 0,
    validationStatus: action.validation?.status,
    confidence: action.confidence,
    provenance: action.provenance,
    mutationResult: { ok: result.status !== "skipped", ...(result.reason ? { error: result.reason } : {}) },
    undoResult: { status: result.status, ...(result.reason ? { error: result.reason } : {}) },
    derivedStateVersion,
  });
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function activeSourceRows(ctx: MutationCtx, userId: string, sourceActionIds: string[], table: "meals" | "workouts") {
  const sources: Array<{ actionId: string; row: any }> = [];
  for (const sourceActionId of sourceActionIds) {
    const sourceAction = await ctx.db.get(sourceActionId as any) as Doc<"actions"> | null;
    if (
      !sourceAction ||
      sourceAction.userId !== userId ||
      sourceAction.status !== "committed" ||
      sourceAction.committedRowRef?.table !== table
    ) continue;
    const row: any = await ctx.db.get(sourceAction.committedRowRef.id as any);
    if (!row || row.userId !== userId || row.undoneAt) continue;
    sources.push({ actionId: sourceActionId, row });
  }
  return sources;
}

async function activeUnattributedRows(ctx: MutationCtx, userId: string, table: "meals" | "workouts", name: string) {
  const normalized = table === "meals" ? normalizeName(name) : normalizeWorkoutName(name);
  const rows = await ctx.db
    .query(table)
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
    .collect();
  return rows.filter((row: any) => {
    const rowName = typeof row.name === "string"
      ? table === "meals" ? normalizeName(row.name) : normalizeWorkoutName(row.name)
      : "";
    return !row.undoneAt && !row.sourceActionId && rowName === normalized;
  });
}

function workoutDurationMin(row: any): number | undefined {
  try {
    const parsed = JSON.parse(row.workoutDraft ?? "null");
    if (typeof parsed?.durationMin === "number") return parsed.durationMin;
  } catch {
    // Fall through to the display duration.
  }
  const match = String(row.duration ?? "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function workoutExercises(row: any): string | undefined {
  if (!Array.isArray(row.exercises)) return undefined;
  const names = row.exercises
    .map((exercise: any) => exercise?.normalizedName ?? exercise?.name)
    .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
  return names.length > 0 ? JSON.stringify(names) : undefined;
}

function normalizeWorkoutName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function compensateInferredMemory(
  ctx: MutationCtx,
  action: Doc<"actions">,
  table: "meals" | "workouts",
) {
  const actionId = String(action._id);
  const name = action.payload?.name ?? action.originalPayload?.name;
  if (typeof name !== "string" || name.length === 0) return;
  const row = table === "meals"
    ? await ctx.db.query("food_memory").withIndex("by_user_name", (q) =>
      q.eq("userId", action.userId).eq("normalizedName", normalizeName(name)),
    ).first()
    : await ctx.db.query("workout_memory").withIndex("by_user_name", (q) =>
      q.eq("userId", action.userId).eq("normalizedName", normalizeWorkoutName(name)),
    ).first();
  if (!row || row.memoryType !== "inferred" || !(row.sourceActionIds ?? []).includes(actionId)) return;

  const remainingIds = (row.sourceActionIds ?? []).filter((id) => id !== actionId);
  const activeSources = await activeSourceRows(ctx, action.userId, remainingIds, table);
  const unattributedRows = await activeUnattributedRows(ctx, action.userId, table, name);
  if (activeSources.length === 0 && unattributedRows.length === 0) {
    await ctx.db.patch(row._id, { sourceActionIds: [], timesLogged: 0 });
    return;
  }

  const allSources = [...activeSources.map((source) => source.row), ...unattributedRows];
  const latest = [...allSources].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (table === "meals") {
    await ctx.db.patch(row._id, {
      sourceActionIds: activeSources.map((source) => source.actionId),
      timesLogged: allSources.length,
      kcal: average(allSources.map((source) => source.calories))!,
      protein: average(allSources.map((source) => source.protein))!,
      carbs: average(allSources.map((source) => source.carbs))!,
      fat: average(allSources.map((source) => source.fat))!,
      components: latest.components,
      lastUsedDate: latest.date,
    });
    return;
  }

  const durations = allSources.map((source) => workoutDurationMin(source)).filter((value): value is number => value !== undefined);
  const calories = allSources.map((source) => source.caloriesBurned).filter((value): value is number => typeof value === "number");
  await ctx.db.patch(row._id, {
    sourceActionIds: activeSources.map((source) => source.actionId),
    timesLogged: allSources.length,
    durationMin: average(durations),
    caloriesBurned: average(calories),
    exercises: workoutExercises(latest),
    intensity: latest.intensity,
    lastUsedDate: latest.date,
  });
}

/** Mark a directly deleted canonical row and its committed action as undone. */
export async function tombstoneActionOwnedRow(ctx: MutationCtx, input: {
  userId: string;
  table: DomainTable;
  row: { _id: string; date: string; userId: string; sourceActionId?: string; undoneAt?: number };
}): Promise<"tombstoned" | "already_tombstoned" | "not_action_owned"> {
  if (input.row.undoneAt) return "already_tombstoned";
  let action: Doc<"actions"> | null = null;
  if (input.row.sourceActionId) {
    action = await ctx.db.get(input.row.sourceActionId as any) as Doc<"actions"> | null;
  }
  if (!action) {
    const committed = await ctx.db
      .query("actions")
      .withIndex("by_user_status", (q) => q.eq("userId", input.userId).eq("status", "committed"))
      .collect();
    action = committed.find((candidate) =>
      candidate.committedRowRef?.table === input.table && candidate.committedRowRef.id === input.row._id,
    ) ?? null;
  }
  if (!action) {
    if (input.row.sourceActionId) throw new Error("Action-owned row has no matching action");
    return "not_action_owned";
  }
  if (
    action.userId !== input.userId
    || action.committedRowRef?.table !== input.table
    || action.committedRowRef.id !== input.row._id
  ) throw new Error("Action-owned row does not match its action");
  if (action.status !== "committed" && action.status !== "undone") {
    throw new Error(`Action-owned row cannot be deleted while its action is ${action.status}`);
  }

  const undoneAt = Date.now();
  if (!input.row.undoneAt) await ctx.db.patch(input.row._id as any, { undoneAt });
  if (action.status === "committed") {
    assertTransition(action.status, "undone");
    await ctx.db.patch(action._id, { status: "undone", undoneAt });
  }
  if (input.table === "meals" || input.table === "workouts") {
    await compensateInferredMemory(ctx, action, input.table);
  }
  await recordBehaviorRow(ctx, input.userId, "undo", action.actionType, action._id, input.row.date);
  return "tombstoned";
}

async function reverseCommittedAction(ctx: MutationCtx, action: Doc<"actions">): Promise<UndoResult & { date?: string; actionType?: DerivedActionType }> {
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
  const row: any = await ctx.db.get(action.committedRowRef.id as any);
  if (!row || row.userId !== action.userId) throw new Error("Undo domain row was not found");

  const expectedSourceActionId = String(action._id);
  if (row.sourceActionId !== expectedSourceActionId) {
    return {
      actionId: action._id,
      groupId: action.groupId,
      rowId: action.committedRowRef.id,
      status: "skipped",
      reason: "Row has changed since the action was committed",
    };
  }

  const previous = action.payload?.previous;
  const undoneAt = Date.now();
  const isUpsert = previous && typeof previous === "object";
  if (isUpsert) {
    // A full replacement clears fields that the upsert added but the previous row did not have.
    await ctx.db.replace(row._id, previous);
  } else {
    // Rows created by this action are marked undone.
    await ctx.db.patch(row._id, { undoneAt });
  }

  if (table === "weight_logs" && action.payload && Object.prototype.hasOwnProperty.call(action.payload, "previousProfile")) {
    const profile = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", action.userId))
      .first();
    if (profile?.weightUpdatedByActionId === expectedSourceActionId) {
      const previousProfile = action.payload.previousProfile;
      await ctx.db.patch(profile._id, {
        weight: previousProfile && typeof previousProfile === "object" ? previousProfile.weight : undefined,
        weightUpdatedByActionId: previousProfile && typeof previousProfile === "object"
          ? previousProfile.weightUpdatedByActionId
          : undefined,
      });
    }
  }

  assertTransition(action.status, "undone");
  await ctx.db.patch(action._id, { status: "undone", undoneAt });
  if (table === "meals" || table === "workouts") {
    await compensateInferredMemory(ctx, action, table);
  }
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
    let derivedStateVersion: number | undefined;
    if (result.status === "undone") {
      const derived = await recomputeForAction(ctx, {
        userId,
        actionType: result.actionType ?? action.actionType,
        date: result.date ?? action.resolvedDate ?? new Date().toISOString().slice(0, 10),
      });
      derivedStateVersion = derived.derivedStateVersion;
    }
    const group = await ctx.db.get(action.groupId);
    if (group) await recordUndoTelemetry(ctx, group, action, result, derivedStateVersion);
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
    const affected = new Map<string, { actionType: DerivedActionType; date: string; version?: number }>();
    const actionById = new Map(actions.map((action) => [String(action._id), action]));
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
      for (const derived of affected.values()) {
        const recomputed = await recomputeForAction(ctx, { userId, actionType: derived.actionType, date: derived.date });
        derived.version = recomputed.derivedStateVersion;
      }
    }
    for (const result of results) {
      const action = actionById.get(result.actionId);
      if (!action) continue;
      const derived = result.date && result.actionType
        ? affected.get(`${result.actionType}:${result.date}`)
        : undefined;
      await recordUndoTelemetry(ctx, group, action, result, derived?.version);
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

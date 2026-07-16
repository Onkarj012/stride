import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const actionGroupStatusValidator = v.union(
  v.literal("pending"),
  v.literal("committed"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("discarded"),
  v.literal("expired"),
);

export const actionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("committed"),
  v.literal("failed"),
  v.literal("undone"),
  v.literal("discarded"),
  v.literal("expired"),
);

export const actionSourceSurfaceValidator = v.union(
  v.literal("chat"),
  v.literal("quick_log"),
  v.literal("barcode"),
  v.literal("recipe"),
  v.literal("checkin"),
  v.literal("direct_ui"),
  v.literal("mobile"),
);

export const actionTypeValidator = v.union(
  v.literal("meal"),
  v.literal("workout"),
  v.literal("recovery"),
  v.literal("rest"),
  v.literal("memory"),
);

export const actionProvenanceValidator = v.union(
  v.literal("user_reported"),
  v.literal("ai_extracted"),
  v.literal("ai_estimated"),
  v.literal("database_match"),
);

export const actionValidationValidator = v.object({
  status: v.union(v.literal("valid"), v.literal("warning"), v.literal("error")),
  messages: v.array(v.string()),
});

export const actionGroupValidator = v.object({
  userId: v.string(),
  groupIdempotencyKey: v.string(),
  sourceSurface: actionSourceSurfaceValidator,
  rawInput: v.string(),
  model: v.optional(v.string()),
  status: actionGroupStatusValidator,
  clientLocalDate: v.optional(v.string()),
  clientLocalTime: v.optional(v.string()),
  clientTimeZone: v.optional(v.string()),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

export const actionValidator = v.object({
  groupId: v.id("actionGroups"),
  userId: v.string(),
  actionType: actionTypeValidator,
  memberIdempotencyKey: v.string(),
  payload: v.any(),
  provenance: actionProvenanceValidator,
  confidence: v.optional(v.number()),
  validation: actionValidationValidator,
  status: actionStatusValidator,
  reversible: v.boolean(),
  resolvedDate: v.optional(v.string()),
  resolvedTime: v.optional(v.string()),
  committedRowRef: v.optional(v.object({ table: v.string(), id: v.string() })),
  undoneAt: v.optional(v.number()),
});

export const actionGroupEnvelopeValidator = actionGroupValidator;
export const actionEnvelopeValidator = actionValidator;

export type ActionGroupStatus = Infer<typeof actionGroupStatusValidator>;
export type ActionStatus = Infer<typeof actionStatusValidator>;
export type ActionSourceSurface = Infer<typeof actionSourceSurfaceValidator>;
export type ActionType = Infer<typeof actionTypeValidator>;
export type ActionProvenance = Infer<typeof actionProvenanceValidator>;
export type ActionValidation = Infer<typeof actionValidationValidator>;
export type ActionGroup = Infer<typeof actionGroupValidator>;
export type ActionEnvelope = Infer<typeof actionValidator>;

export type ExtractedActionCandidate = {
  actionType: ActionType;
  memberIdempotencyKey: string;
  payload: unknown;
  provenance: ActionProvenance;
  validation: ActionValidation;
  reversible: boolean;
  confidence?: number;
  resolvedDate?: string;
  resolvedTime?: string;
  committedRowRef?: { table: string; id: string };
};

export type ActionGroupInput = Omit<ActionGroup, "status"> & { status?: ActionGroupStatus };

function assertConfidence(confidence: number | undefined): void {
  if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new Error("Action confidence must be a finite number between 0 and 1");
  }
}

export function assertValidActionEnvelope(action: ActionEnvelope): void {
  assertConfidence(action.confidence);
}

export function buildActionGroup(input: ActionGroupInput): ActionGroup {
  const group = { ...input, status: input.status ?? "pending" };
  return group;
}

export function buildActionMembers(input: {
  groupId: Id<"actionGroups">;
  userId: string;
  candidates: readonly ExtractedActionCandidate[];
}): ActionEnvelope[] {
  return input.candidates.map((candidate) => {
    assertConfidence(candidate.confidence);
    return {
      ...candidate,
      groupId: input.groupId,
      userId: input.userId,
      status: "pending",
    };
  });
}

export function assertTransition(from: ActionStatus, to: ActionStatus): void {
  const allowed = from === "pending"
    ? ["committed", "failed", "discarded", "expired"]
    : from === "committed"
      ? ["undone"]
      : [];

  if (!allowed.includes(to)) {
    throw new Error(`Invalid action status transition: ${from} -> ${to}`);
  }
}

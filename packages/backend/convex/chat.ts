import { query, mutation, internalQuery, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  assertChatTurnCards,
  type ChatTurnActionType,
  type ChatTurnCard,
  type ClarificationCardData,
  type ConfirmationCardData,
  type ConfirmationMacroData,
  type ResultCardItem,
} from "../../shared/src/chat-turn";
import { stableHash } from "./validation";
import { CONFIRMATION_TTL_MS } from "./actions_envelope";
import { assertCurrentChatClaim } from "./chat_claim";

const turnOutcomeValidator = v.union(
  v.literal("committed"),
  v.literal("confirmation_required"),
  v.literal("failed"),
  v.literal("no_action"),
);

const CHAT_TURN_LEASE_MS = 120_000;

type ChatTurnOutcome = "committed" | "confirmation_required" | "failed" | "no_action";
type ConfirmationCard = Extract<ChatTurnCard, { kind: "confirmation" }>;
type ClarificationCard = Extract<ChatTurnCard, { kind: "clarification" }>;
type ConfirmationItem = ConfirmationCardData["items"][number];
type ClarificationItem = ClarificationCardData["items"][number];
type FailedResultItem = Extract<ResultCardItem, { status: "failed" }>;

/** Compares two optional ids, where two missing ids count as equal. */
function sameOptionalId(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

/** Fingerprints a turn's cards so callers can compare persisted outcomes. */
function turnCardsHash(cards: unknown): string {
  return stableHash(JSON.stringify(cards ?? []));
}

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export const getSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const allSessions = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Old homepage sessions stay in the database until the slice 3 data wipe.
    return allSessions
      .filter((s) => !s.title.startsWith("__HOMEPAGE_"))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => ({ id: s._id, title: s.title, updatedAt: s.updatedAt }));
  },
});

export const createSession = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    const userId = await requireUserId(ctx);
    const sessionTitle = (title || "New Chat").slice(0, 60);
    const id = await ctx.db.insert("chat_sessions", {
      userId,
      title: sessionTitle,
      updatedAt: Date.now(),
    });
    return { id, title: sessionTitle };
  },
});

export const deleteSession = mutation({
  args: { id: v.id("chat_sessions") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(id);
    if (!session || session.userId !== userId) throw new Error("Not found");

    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .collect();
    await Promise.all(messages.map((m) => ctx.db.delete(m._id)));
    await ctx.db.delete(id);
  },
});

export const getMessages = query({
  args: { sessionId: v.id("chat_sessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) return [];
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    return messages
      .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.turnContractVersion !== undefined ? { turnContractVersion: m.turnContractVersion } : {}),
        ...(m.turnOutcome !== undefined ? { turnOutcome: m.turnOutcome } : {}),
        ...(m.turnCards !== undefined ? { turnCards: m.turnCards } : {}),
        ...(m.actionGroupId !== undefined ? { actionGroupId: m.actionGroupId } : {}),
        ...(m.actionIds !== undefined ? { actionIds: m.actionIds } : {}),
        ...(m.clientSubmissionId !== undefined ? { clientSubmissionId: m.clientSubmissionId } : {}),
      }));
  },
});

export const clearAllMessages = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(messages.map((m) => ctx.db.delete(m._id)));
  },
});

// ─── Internal (called by AI action) ──────────────────────────────────────────

export const getMessagesForContext = internalQuery({
  args: { userId: v.string(), sessionId: v.id("chat_sessions") },
  handler: async (ctx, { userId, sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) return [];
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    return messages
      .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content }));
  },
});

export const addMessage = internalMutation({
  args: {
    userId: v.string(),
    sessionId: v.optional(v.id("chat_sessions")),
    role: v.string(),
    content: v.string(),
    clientSubmissionId: v.optional(v.string()),
    claimOwner: v.optional(v.string()),
    claimVersion: v.optional(v.number()),
    turnContractVersion: v.optional(v.literal(1)),
    turnOutcome: v.optional(turnOutcomeValidator),
    turnCards: v.optional(v.any()),
    actionGroupId: v.optional(v.id("actionGroups")),
    actionIds: v.optional(v.array(v.id("actions"))),
  },
  handler: async (ctx, args) => {
    const session = args.sessionId ? await ctx.db.get(args.sessionId) : null;
    if (args.sessionId && (!session || session.userId !== args.userId)) throw new Error("Not found");
    if (args.turnCards !== undefined) assertChatTurnCards(args.turnCards);
    if (args.role === "ai" && (args.claimOwner !== undefined || args.claimVersion !== undefined)) {
      if (!args.clientSubmissionId || args.claimOwner === undefined || args.claimVersion === undefined) {
        throw new Error("Chat turn claim is incomplete");
      }
      await assertCurrentChatClaim(ctx, args.userId, args.clientSubmissionId, args.claimOwner, args.claimVersion);
    }
    if (
      args.turnContractVersion !== undefined
      || args.turnOutcome !== undefined
      || args.turnCards !== undefined
      || args.actionGroupId !== undefined
      || args.actionIds !== undefined
    ) {
      if (args.role !== "ai") throw new Error("Turn outcomes may only be stored on assistant messages");
      if (args.turnContractVersion !== 1 || !args.turnOutcome) throw new Error("Turn outcome contract is incomplete");
    }
    if (args.clientSubmissionId) {
      const existing = await ctx.db
        .query("chat_messages")
        .withIndex("by_user_submission_and_role", (q) =>
          q.eq("userId", args.userId)
            .eq("clientSubmissionId", args.clientSubmissionId)
            .eq("role", args.role),
        )
        .first();
      if (existing) {
        if (String(existing.sessionId ?? "") !== String(args.sessionId ?? "")) {
          throw new Error("Submission already belongs to a different chat session");
        }
        if (args.role === "user" && existing.content !== args.content) {
          throw new Error("Submission already belongs to different content");
        }
        return existing._id;
      }
    }
    const { claimOwner: _claimOwner, claimVersion: _claimVersion, ...messageArgs } = args;
    const id = await ctx.db.insert("chat_messages", messageArgs);
    return id;
  },
});

/** Reads the confirmation ordinal stamped on an action's payload. */
function confirmationOrdinal(action: Doc<"actions">): number {
  if (typeof action.payload?._confirmationOrdinal === "number") return action.payload._confirmationOrdinal;
  return typeof action.originalPayload?._confirmationOrdinal === "number" ? action.originalPayload._confirmationOrdinal : -1;
}

/** Builds the default card label for an action from its payload. */
function confirmationDescription(action: Doc<"actions">): string {
  if (action.actionType === "recovery") {
    if (action.payload?.kind === "water") return `Water ${action.payload.ml}ml`;
    if (action.payload?.kind === "sleep") return `Sleep ${action.payload.hours}h (${action.payload.quality})`;
    if (action.payload?.kind === "mood") return `Mood ${action.payload.rating}/5`;
    if (action.payload?.kind === "steps") return `Steps ${action.payload.count}`;
  }
  return action.payload?.name ?? action.payload?.description ?? action.actionType;
}

/** Maps an action to a card action type, or null when cards cannot show it. */
function cardActionType(action: Doc<"actions">): ChatTurnActionType | null {
  return action.actionType === "meal" || action.actionType === "workout" || action.actionType === "recovery"
    ? action.actionType
    : null;
}

/** Narrows an unknown value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Checks for a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Extracts editable meal macros from a payload when all four are finite numbers. */
function confirmationMacros(payload: unknown): ConfirmationMacroData | undefined {
  if (!isRecord(payload)) return undefined;
  const { calories, protein, carbs, fat } = payload;
  if (!isFiniteNumber(calories) || !isFiniteNumber(protein) || !isFiniteNumber(carbs) || !isFiniteNumber(fat)) return undefined;
  return { calories, protein, carbs, fat };
}

/** Builds the card fields every action row shares. */
function actionCardBase(action: Doc<"actions">) {
  return {
    ordinal: confirmationOrdinal(action),
    actionType: cardActionType(action) ?? "recovery",
    title: confirmationDescription(action),
    description: confirmationDescription(action),
    date: action.resolvedDate,
    time: action.resolvedTime,
  };
}

/** Builds result card rows for committed, failed, discarded, and expired actions. */
function resultCardItemsForActions(actions: Doc<"actions">[]): ResultCardItem[] {
  return actions.reduce<ResultCardItem[]>((items, action) => {
    const actionType = cardActionType(action);
    if (!actionType) return items;
    const base = {
      ...actionCardBase(action),
      actionType,
      groupId: String(action.groupId),
      provenance: action.provenance,
      validation: action.validation,
    };
    if (action.status === "committed" && action.committedRowRef) {
      items.push({ ...base, status: "committed" as const, actionId: String(action._id), record: action.committedRowRef });
      return items;
    }
    if (action.status === "failed") {
      items.push({
        ...base,
        status: "failed" as const,
        actionId: String(action._id),
        reason: action.validation?.messages?.at(-1) ?? "The item could not be saved",
        retriable: true,
      });
    }
    if (action.status === "discarded" || action.status === "expired") {
      items.push({
        ...base,
        status: action.status,
        actionId: String(action._id),
        reason: action.status === "expired" ? "Confirmation expired" : "Discarded by you",
      });
    }
    return items;
  }, []);
}

/** Summarizes why a group's actions resolved without saving. */
function resolvedReason(actions: Doc<"actions">[]): "discarded" | "expired" | "mixed" | undefined {
  const hasDiscarded = actions.some((action) => action.status === "discarded");
  const hasExpired = actions.some((action) => action.status === "expired");
  if (hasDiscarded && hasExpired) return "mixed";
  if (hasExpired) return "expired";
  if (hasDiscarded) return "discarded";
  return undefined;
}

/** Rebuilds pending confirmation or clarification rows, keeping labels from the existing card. */
function pendingCardItems(actions: Doc<"actions">[], existingCard: ClarificationCard): ClarificationItem[];
function pendingCardItems(actions: Doc<"actions">[], existingCard: ConfirmationCard | undefined): ConfirmationItem[];
function pendingCardItems(
  actions: Doc<"actions">[],
  existingCard: ConfirmationCard | ClarificationCard | undefined,
): Array<ConfirmationItem | ClarificationItem> {
  return actions.reduce<Array<ConfirmationItem | ClarificationItem>>((items, action) => {
    const actionType = cardActionType(action);
    if (!actionType || action.status !== "pending") return items;
    const previous = existingCard?.data?.items?.find((item) => item.actionId === String(action._id));
    const base = {
      ...actionCardBase(action),
      ...(previous?.title ? { title: previous.title } : {}),
      ...(previous?.description ? { description: previous.description } : {}),
      actionType,
      actionId: String(action._id),
      provenance: action.provenance,
      validation: action.validation,
      confidence: action.confidence,
      ...(action.actionType === "meal" && confirmationMacros(action.payload)
        ? { macros: confirmationMacros(action.payload) }
        : {}),
    };
    if (existingCard?.kind === "clarification") {
      const previousReason = previous && "reason" in previous ? previous.reason : undefined;
      items.push({ ...base, reason: previousReason ?? action.validation?.messages?.at(-1) ?? "Confirmation is required" });
      return items;
    }
    items.push({
      ...base,
      validationMessages: action.validation?.messages ?? [],
    });
    return items;
  }, []);
}

/** Rebuilds a turn's chat cards, outcome, and reply text from the group's current action states. */
function reconcileCards(message: Doc<"chat_messages">, group: Doc<"actionGroups">, actions: Doc<"actions">[]) {
  const existingCards: ChatTurnCard[] = Array.isArray(message.turnCards) ? message.turnCards : [];
  const actionById = new Map(actions.map((action) => [String(action._id), action]));
  const pending = actions.filter((action) => action.status === "pending" && cardActionType(action));
  const activeCommitted = actions.filter((action) => action.status === "committed" && action.committedRowRef && cardActionType(action));
  const undone = actions.filter((action) => action.status === "undone" && action.committedRowRef && cardActionType(action));
  const failed = actions.filter((action) => action.status === "failed" && cardActionType(action));
  const priorResultItems = existingCards
    .filter((card) => card.kind === "result")
    .flatMap((card) => card.data.items);
  const resultItems = resultCardItemsForActions(actions).map((item) => {
    const prior = priorResultItems.find((candidate) => candidate.actionId === item.actionId);
    return prior ? { ...item, title: prior.title, description: prior.description } : item;
  });
  const preservedResultFailures = priorResultItems.filter((item): item is FailedResultItem => !item.actionId && item.status === "failed");
  const existingPending = existingCards.find((card) => card.kind === "confirmation" || card.kind === "clarification");
  const preserved = existingCards.flatMap((card): ChatTurnCard[] => {
    if (card.kind === "result" || card.kind === "undo" || card.kind === "confirmation" || card.kind === "clarification") return [];
    if (card.kind === "duplicate") {
      const items = card.data.items.filter((item) => {
        const action = actionById.get(String(item.actionId));
        return Boolean(action && action.status === "failed" && action.validation?.messages?.some((message: string) => /duplicate/i.test(message)));
      });
      return items.length > 0 ? [{ ...card, data: { ...card.data, items } }] : [];
    }
    if (card.kind === "failure") {
      const items = card.data.items.filter((item) => !item.actionId || !actionById.has(String(item.actionId)));
      return items.length > 0 || card.data.items.length === 0 ? [{ ...card, data: { ...card.data, items } }] : [];
    }
    return [card];
  });
  const cards: ChatTurnCard[] = [...preserved];
  const resolutionReason = resolvedReason(actions);
  const allResolved = actions.length > 0 && actions.every((action) => action.status === "discarded" || action.status === "expired");

  if (pending.length > 0) {
    if (existingPending?.kind === "clarification") {
      cards.push({
        version: 1,
        kind: "clarification",
        data: { groupId: String(group._id), prompt: existingPending.data.prompt, items: pendingCardItems(pending, existingPending) },
      });
    } else {
      cards.push({
        version: 1,
        kind: "confirmation",
        data: {
          groupId: String(group._id),
          expiresAt: group.createdAt + CONFIRMATION_TTL_MS,
          items: pendingCardItems(pending, existingPending),
        },
      });
    }
  }

  const hasResolvedItems = resultItems.some((item) => item.status === "discarded" || item.status === "expired");
  if (activeCommitted.length > 0 || (hasResolvedItems && !allResolved)) {
    cards.push({
      version: 1,
      kind: "result",
      data: {
        groupId: String(group._id),
        ...(resolutionReason ? { reason: resolutionReason } : {}),
        items: [...resultItems, ...preservedResultFailures],
      },
    });
  } else if (failed.length > 0 || preservedResultFailures.length > 0) {
    cards.push({
      version: 1,
      kind: "failure",
      data: {
        groupId: String(group._id),
        code: "ACTION_GROUP_FAILED",
        message: "No items were saved.",
        retriable: true,
        items: [...resultItems.filter((item) => item.status === "failed"), ...preservedResultFailures]
          .map(({ status: _status, retriable: _retriable, ...item }) => item),
      },
    });
  }

  if (activeCommitted.length > 0 || undone.length > 0) {
    cards.push({
      version: 1,
      kind: "undo",
      data: {
        groupId: String(group._id),
        items: [...activeCommitted, ...undone].flatMap((action) => action.committedRowRef
          ? [{
              ...actionCardBase(action),
              actionId: String(action._id),
              record: action.committedRowRef,
              state: action.status === "undone" ? "undone" as const : "available" as const,
            }]
          : []),
      },
    });
  }

  if (allResolved) {
    cards.push({
      version: 1,
      kind: "confirmation",
      data: {
        groupId: String(group._id),
        expiresAt: group.createdAt + CONFIRMATION_TTL_MS,
        state: "resolved",
        ...(resolutionReason ? { reason: resolutionReason } : {}),
        items: actions.filter((action) => cardActionType(action)).map((action) => ({
          ...actionCardBase(action),
          actionId: String(action._id),
          ...(action.actionType === "meal" && confirmationMacros(action.payload)
            ? { macros: confirmationMacros(action.payload) }
            : {}),
          confidence: action.confidence,
          validationMessages: action.validation?.messages ?? [],
          resolution: action.status === "discarded" || action.status === "expired" ? action.status : undefined,
        })),
      },
    });
  }

  const hasPreservedFailure = cards.some((card) => card.kind === "failure");
  const discarded = actions.filter((action) => action.status === "discarded");
  const expired = actions.filter((action) => action.status === "expired");
  const turnOutcome: ChatTurnOutcome = pending.length > 0
    ? "confirmation_required"
    : activeCommitted.length > 0
      ? "committed"
      : failed.length > 0 || hasPreservedFailure
        ? "failed"
        : "no_action";
  const savedTitles = activeCommitted.map((action) => {
    const priorCardItem = existingCards
      .flatMap((card): Array<{ actionId?: string; title: string }> => card.kind === "result" || card.kind === "undo" ? card.data.items : [])
      .find((item) => item.actionId === String(action._id));
    return priorCardItem?.title ?? confirmationDescription(action);
  });
  const generatedContent = turnOutcome === "confirmation_required"
    ? `${pending.length} item${pending.length === 1 ? "" : "s"} still need review.`
    : turnOutcome === "committed"
      ? `Saved ${savedTitles.join(", ")}.${failed.length > 0 ? " Some items could not be saved." : discarded.length > 0 || expired.length > 0 ? " Some items were discarded or expired." : ""}`
      : turnOutcome === "no_action"
        ? expired.length > 0 && discarded.length === 0
          ? "This confirmation expired. Nothing was saved."
          : undone.length > 0 && discarded.length === 0
            ? "That log was undone."
            : discarded.length > 0 && expired.length > 0
              ? "Some items were discarded or expired. Nothing was saved."
              : "Discarded. Nothing was saved."
        : "I couldn't save that. Please try again.";
  const content = turnOutcome === "committed"
    && activeCommitted.length === 1
    && failed.length === 0
    && /^Saved\b/i.test(message.content)
    ? message.content
    : generatedContent;
  return { content, turnOutcome, turnCards: cards, actionIds: actions.map((action) => action._id) };
}

/** Finds the earliest assistant message for an action group without reading the rest. */
async function firstAssistantMessageForGroup(ctx: QueryCtx, actionGroupId: Id<"actionGroups">) {
  // The index orders rows by creation time, so the first "ai" match is the earliest one.
  return await ctx.db
    .query("chat_messages")
    .withIndex("by_action_group", (q) => q.eq("actionGroupId", actionGroupId))
    .filter((q) => q.eq(q.field("role"), "ai"))
    .first();
}

/** Rewrites the group's assistant message cards and outcome inside the caller's transaction. */
export async function reconcileAssistantOutcomeInMutation(
  ctx: MutationCtx,
  userId: string,
  actionGroupId: Doc<"actionGroups">["_id"],
  claimOwner?: string,
  claimVersion?: number,
  claimSubmissionId?: string,
) {
  const group = await ctx.db.get("actionGroups", actionGroupId);
  if (!group || group.userId !== userId) throw new Error("Not found");
  const message = await firstAssistantMessageForGroup(ctx, actionGroupId);
  if (!message) {
    return {
      group,
      actions: await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", actionGroupId)).collect(),
      message: null,
    };
  }
  if (message.userId !== userId) throw new Error("Not found");
  if (claimOwner !== undefined || claimVersion !== undefined) {
    if (claimOwner === undefined || claimVersion === undefined) {
      throw new Error("Chat turn claim is incomplete");
    }
    await assertCurrentChatClaim(ctx, userId, claimSubmissionId ?? message.clientSubmissionId ?? "", claimOwner, claimVersion);
  }
  const actions = await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", actionGroupId)).collect();
  const reconciled = reconcileCards(message, group, actions);
  assertChatTurnCards(reconciled.turnCards);
  await ctx.db.patch(message._id, {
    content: reconciled.content,
    turnContractVersion: 1,
    turnOutcome: reconciled.turnOutcome,
    turnCards: reconciled.turnCards,
    actionIds: reconciled.actionIds,
  });
  return {
    group: await ctx.db.get("actionGroups", actionGroupId),
    actions: await ctx.db.query("actions").withIndex("by_group", (q) => q.eq("groupId", actionGroupId)).collect(),
    message: await ctx.db.get(message._id),
  };
}

/** Reconciles a group's assistant message from current action states. */
export const updateAssistantOutcomeForGroup = internalMutation({
  args: {
    userId: v.string(),
    actionGroupId: v.id("actionGroups"),
    claimOwner: v.optional(v.string()),
    claimVersion: v.optional(v.number()),
    claimSubmissionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return reconcileAssistantOutcomeInMutation(ctx, args.userId, args.actionGroupId, args.claimOwner, args.claimVersion, args.claimSubmissionId);
  },
});

/** Claims a chat submission for processing, or returns its finished or in-progress state. */
export const claimTurn = internalMutation({
  args: {
    userId: v.string(),
    sessionId: v.optional(v.id("chat_sessions")),
    clientSubmissionId: v.string(),
    content: v.string(),
    submissionFingerprint: v.string(),
    claimOwner: v.string(),
  },
  handler: async (ctx, args) => {
    const session = args.sessionId ? await ctx.db.get(args.sessionId) : null;
    if (args.sessionId && (!session || session.userId !== args.userId)) throw new Error("Not found");
    const userMessage = await ctx.db
      .query("chat_messages")
      .withIndex("by_user_submission_and_role", (q) =>
        q.eq("userId", args.userId).eq("clientSubmissionId", args.clientSubmissionId).eq("role", "user"),
      )
      .first();
    if (userMessage) {
      if (!sameOptionalId(userMessage.sessionId, args.sessionId)) throw new Error("Submission already belongs to a different chat session");
      if (userMessage.content !== args.content) throw new Error("Submission already belongs to different content");
      const storedFingerprint = userMessage.submissionFingerprint;
      if (storedFingerprint && storedFingerprint !== args.submissionFingerprint) {
        throw new Error("Submission already belongs to different request details");
      }
    }
    // Returns the persisted terminal turn for a finished assistant message, else null.
    const turnFromAssistant = (assistant: Doc<"chat_messages"> | null) => assistant && assistant.turnContractVersion === 1 && assistant.turnOutcome
      ? {
          state: "terminal" as const,
          turn: {
            messageId: assistant._id,
            sessionId: assistant.sessionId,
            content: assistant.content,
            turnOutcome: assistant.turnOutcome,
            turnCards: assistant.turnCards ?? [],
            actionGroupId: assistant.actionGroupId,
            actionIds: assistant.actionIds ?? [],
            clientSubmissionId: assistant.clientSubmissionId,
            turnCardsHash: turnCardsHash(assistant.turnCards),
          },
        }
      : null;

    const referencedTurn = userMessage?.resolvedTurnMessageId
      ? await ctx.db.get(userMessage.resolvedTurnMessageId)
      : null;
    const referencedTerminal = turnFromAssistant(referencedTurn);
    if (referencedTerminal) return referencedTerminal;

    const assistant = await ctx.db
      .query("chat_messages")
      .withIndex("by_user_submission_and_role", (q) =>
        q.eq("userId", args.userId).eq("clientSubmissionId", args.clientSubmissionId).eq("role", "ai"),
      )
      .first();
    if (assistant) {
      if (!sameOptionalId(assistant.sessionId, args.sessionId)) throw new Error("Submission already belongs to a different chat session");
      if (userMessage && !userMessage.submissionFingerprint) {
        await ctx.db.patch(userMessage._id, { submissionFingerprint: args.submissionFingerprint });
      }
      const terminal = turnFromAssistant(assistant);
      if (terminal) return terminal;
      return { state: "in_progress" as const };
    }
    const now = Date.now();
    const currentVersion = userMessage?.processingLeaseVersion ?? 0;
    const currentOwner = userMessage?.processingLeaseOwner;
    const currentExpiry = userMessage?.processingLeaseExpiresAt;
    if (userMessage && currentExpiry && currentExpiry > now && currentOwner !== args.claimOwner) {
      return { state: "in_progress" as const };
    }
    const nextVersion = currentVersion + 1;
    const claimFields = {
      submissionFingerprint: args.submissionFingerprint,
      processingLeaseOwner: args.claimOwner,
      processingLeaseVersion: nextVersion,
      processingLeaseExpiresAt: now + CHAT_TURN_LEASE_MS,
    };
    if (userMessage) {
      await ctx.db.patch(userMessage._id, claimFields);
      return { state: "claimed" as const, messageId: userMessage._id, claimVersion: nextVersion };
    }
    const id = await ctx.db.insert("chat_messages", {
      userId: args.userId,
      sessionId: args.sessionId,
      role: "user",
      content: args.content,
      clientSubmissionId: args.clientSubmissionId,
      ...claimFields,
    });
    return { state: "claimed" as const, messageId: id, claimVersion: nextVersion };
  },
});

/** Points a clarification submission at the assistant turn it resolved. */
export const linkResolvedTurnMessage = internalMutation({
  args: {
    userId: v.string(),
    clientSubmissionId: v.string(),
    resolvedTurnMessageId: v.id("chat_messages"),
    claimOwner: v.string(),
    claimVersion: v.number(),
  },
  handler: async (ctx, args) => {
    await assertCurrentChatClaim(ctx, args.userId, args.clientSubmissionId, args.claimOwner, args.claimVersion);
    const userMessage = await ctx.db
      .query("chat_messages")
      .withIndex("by_user_submission_and_role", (q) =>
        q.eq("userId", args.userId).eq("clientSubmissionId", args.clientSubmissionId).eq("role", "user"),
      )
      .first();
    const resolved = await ctx.db.get(args.resolvedTurnMessageId);
    if (!userMessage || !resolved || resolved.userId !== args.userId || resolved.role !== "ai" || resolved.turnContractVersion !== 1) {
      throw new Error("Resolved chat turn was not found");
    }
    await ctx.db.patch(userMessage._id, { resolvedTurnMessageId: args.resolvedTurnMessageId });
    return args.resolvedTurnMessageId;
  },
});

/** Returns the group's first assistant message for the owning user. */
export const getAssistantOutcomeForGroup = internalQuery({
  args: {
    userId: v.string(),
    actionGroupId: v.id("actionGroups"),
  },
  handler: async (ctx, { userId, actionGroupId }) => {
    const message = await firstAssistantMessageForGroup(ctx, actionGroupId);
    if (!message) return null;
    if (message.userId !== userId || message.role !== "ai") throw new Error("Not found");
    return message;
  },
});

export const touchSession = internalMutation({
  args: { userId: v.string(), sessionId: v.id("chat_sessions") },
  handler: async (ctx, { userId, sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(sessionId, { updatedAt: Date.now() });
  },
});

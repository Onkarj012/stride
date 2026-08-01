import { query, mutation, internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertChatTurnCards } from "../../shared/src/chat-turn";
import { stableHash } from "./validation";
import { CONFIRMATION_TTL_MS } from "./actions_envelope";

const turnOutcomeValidator = v.union(
  v.literal("committed"),
  v.literal("confirmation_required"),
  v.literal("failed"),
  v.literal("no_action"),
);

const CHAT_TURN_LEASE_MS = 120_000;

type ChatTurnOutcome = "committed" | "confirmation_required" | "failed" | "no_action";

function sameOptionalId(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

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

    return allSessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => {
        const isHome = isHomepageTitle(s.title);
        // For home sessions, show "Home · Jun 4" style label
        let title = s.title;
        if (isHome) {
          const dateStr = s.title.replace("__HOMEPAGE_", "").replace("__", "");
          const d = new Date(dateStr + "T00:00:00");
          const isToday = dateStr === new Date().toISOString().split("T")[0];
          title = isToday
            ? "Home · Today"
            : `Home · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        }
        return { id: s._id, title, updatedAt: s.updatedAt, isHome };
      });
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

export const updateSessionTitle = mutation({
  args: { id: v.id("chat_sessions"), title: v.string() },
  handler: async (ctx, { id, title }) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(id);
    if (!session || session.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, { title: title.slice(0, 60), updatedAt: Date.now() });
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

export const getMessageCount = internalQuery({
  args: { userId: v.string(), sessionId: v.id("chat_sessions") },
  handler: async (ctx, { userId, sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) return 0;
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
    return messages.length;
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
      await assertCurrentTurnLease(ctx, args.userId, args.clientSubmissionId, args.claimOwner, args.claimVersion);
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
    const id = await ctx.db.insert("chat_messages", messageArgs as any);
    // Cache first user message as previewTitle on homepage sessions (avoids N+1 in getSessions)
    if (args.role === "user" && args.sessionId) {
      if (session && isHomepageTitle(session.title) && !session.previewTitle) {
        await ctx.db.patch(args.sessionId, { previewTitle: args.content.slice(0, 40).trim() });
      }
    }
    return id;
  },
});

function confirmationOrdinal(action: any): number {
  if (typeof action.payload?._confirmationOrdinal === "number") return action.payload._confirmationOrdinal;
  return typeof action.originalPayload?._confirmationOrdinal === "number" ? action.originalPayload._confirmationOrdinal : -1;
}

function confirmationDescription(action: any): string {
  if (action.actionType === "recovery") {
    if (action.payload?.kind === "water") return `Water ${action.payload.ml}ml`;
    if (action.payload?.kind === "sleep") return `Sleep ${action.payload.hours}h (${action.payload.quality})`;
    if (action.payload?.kind === "mood") return `Mood ${action.payload.rating}/5`;
    if (action.payload?.kind === "steps") return `Steps ${action.payload.count}`;
  }
  return action.payload?.name ?? action.payload?.description ?? action.actionType;
}

function cardActionType(action: any): "meal" | "workout" | "recovery" | null {
  return action.actionType === "meal" || action.actionType === "workout" || action.actionType === "recovery"
    ? action.actionType
    : null;
}

function confirmationMacros(payload: any) {
  if (!payload || typeof payload !== "object") return undefined;
  const values = [payload.calories, payload.protein, payload.carbs, payload.fat];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  return { calories: payload.calories, protein: payload.protein, carbs: payload.carbs, fat: payload.fat };
}

function actionCardBase(action: any) {
  return {
    ordinal: confirmationOrdinal(action),
    actionType: cardActionType(action) ?? "recovery",
    title: confirmationDescription(action),
    description: confirmationDescription(action),
    date: action.resolvedDate,
    time: action.resolvedTime,
  };
}

function resultCardItemsForActions(actions: any[]): any[] {
  return actions.reduce<any[]>((items, action) => {
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

function pendingCardItems(actions: any[], existingCard: any): any[] {
  return actions.reduce<any[]>((items, action) => {
    const actionType = cardActionType(action);
    if (!actionType || action.status !== "pending") return items;
    const previous = existingCard?.data?.items?.find((item: any) => item.actionId === String(action._id));
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
      items.push({ ...base, reason: previous?.reason ?? action.validation?.messages?.at(-1) ?? "Confirmation is required" });
      return items;
    }
    items.push({
      ...base,
      validationMessages: action.validation?.messages ?? [],
    });
    return items;
  }, []);
}

function reconcileCards(message: any, group: any, actions: any[]) {
  const existingCards: any[] = Array.isArray(message.turnCards) ? message.turnCards : [];
  const actionById = new Map(actions.map((action) => [String(action._id), action]));
  const pending = actions.filter((action) => action.status === "pending" && cardActionType(action));
  const activeCommitted = actions.filter((action) => action.status === "committed" && action.committedRowRef && cardActionType(action));
  const undone = actions.filter((action) => action.status === "undone" && action.committedRowRef && cardActionType(action));
  const failed = actions.filter((action) => action.status === "failed" && cardActionType(action));
  const priorResultItems = existingCards
    .filter((card) => card.kind === "result")
    .flatMap((card) => card.data.items);
  const resultItems = resultCardItemsForActions(actions).map((item: any) => {
    const prior = priorResultItems.find((candidate: any) => candidate.actionId === item.actionId);
    return prior ? { ...item, title: prior.title, description: prior.description } : item;
  });
  const preservedResultFailures = priorResultItems.filter((item: any) => !item.actionId && item.status === "failed");
  const existingPending = existingCards.find((card) => card.kind === "confirmation" || card.kind === "clarification");
  const preserved = existingCards.flatMap((card) => {
    if (card.kind === "result" || card.kind === "undo" || card.kind === "confirmation" || card.kind === "clarification") return [];
    if (card.kind === "duplicate") {
      const items = card.data.items.filter((item: any) => {
        const action = actionById.get(String(item.actionId));
        return Boolean(action && action.status === "failed" && action.validation?.messages?.some((message: string) => /duplicate/i.test(message)));
      });
      return items.length > 0 ? [{ ...card, data: { ...card.data, items } }] : [];
    }
    if (card.kind === "failure") {
      const items = card.data.items.filter((item: any) => !item.actionId || !actionById.has(String(item.actionId)));
      return items.length > 0 || card.data.items.length === 0 ? [{ ...card, data: { ...card.data, items } }] : [];
    }
    return [card];
  });
  const cards: any[] = [...preserved];

  if (pending.length > 0) {
    const items = pendingCardItems(pending, existingPending);
    if (existingPending?.kind === "clarification") {
      cards.push({
        version: 1,
        kind: "clarification",
        data: { groupId: String(group._id), prompt: existingPending.data.prompt, items },
      });
    } else {
      cards.push({
        version: 1,
        kind: "confirmation",
        data: {
          groupId: String(group._id),
          expiresAt: group.createdAt + CONFIRMATION_TTL_MS,
          items,
        },
      });
    }
  }

  if (activeCommitted.length > 0) {
    cards.push({ version: 1, kind: "result", data: { groupId: String(group._id), items: [...resultItems, ...preservedResultFailures] } });
  } else if (failed.length > 0 || preservedResultFailures.length > 0) {
    cards.push({
      version: 1,
      kind: "failure",
      data: {
        groupId: String(group._id),
        code: "ACTION_GROUP_FAILED",
        message: "No items were saved.",
        retriable: true,
        items: [...resultItems.filter((item: any) => item.status === "failed"), ...preservedResultFailures]
          .map(({ status: _status, retriable: _retriable, ...item }: any) => item),
      },
    });
  }

  if (activeCommitted.length > 0 || undone.length > 0) {
    cards.push({
      version: 1,
      kind: "undo",
      data: {
        groupId: String(group._id),
        items: [...activeCommitted, ...undone].map((action) => ({
          ...actionCardBase(action),
          actionId: String(action._id),
          record: action.committedRowRef,
          state: action.status === "undone" ? "undone" : "available",
        })),
      },
    });
  }

  const allResolved = actions.length > 0 && actions.every((action) => action.status === "discarded" || action.status === "expired");
  if (allResolved) {
    cards.push({
      version: 1,
      kind: "confirmation",
      data: {
        groupId: String(group._id),
        expiresAt: group.createdAt + CONFIRMATION_TTL_MS,
        state: "resolved",
        items: actions.filter((action) => cardActionType(action)).map((action) => ({
          ...actionCardBase(action),
          actionId: String(action._id),
          ...(action.actionType === "meal" && confirmationMacros(action.payload)
            ? { macros: confirmationMacros(action.payload) }
            : {}),
          confidence: action.confidence,
          validationMessages: action.validation?.messages ?? [],
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
      .flatMap((card) => card.kind === "result" || card.kind === "undo" ? card.data.items : [])
      .find((item: any) => item.actionId === String(action._id));
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
  const messages = await ctx.db
    .query("chat_messages")
    .withIndex("by_action_group", (q) => q.eq("actionGroupId", actionGroupId))
    .collect();
  const message = messages
    .filter((candidate) => candidate.role === "ai")
    .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))[0];
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
    await assertCurrentTurnLease(ctx, userId, claimSubmissionId ?? message.clientSubmissionId ?? "", claimOwner, claimVersion);
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

async function assertCurrentTurnLease(
  ctx: MutationCtx,
  userId: string,
  clientSubmissionId: string,
  claimOwner: string,
  claimVersion: number,
) {
  const userMessage = await ctx.db
    .query("chat_messages")
    .withIndex("by_user_submission_and_role", (q) => q.eq("userId", userId).eq("clientSubmissionId", clientSubmissionId).eq("role", "user"))
    .first();
  const row = userMessage as any;
  if (
    !row
    || row.processingLeaseOwner !== claimOwner
    || row.processingLeaseVersion !== claimVersion
    || typeof row.processingLeaseExpiresAt !== "number"
    || row.processingLeaseExpiresAt <= Date.now()
  ) {
    throw new Error("Chat submission lease is no longer current");
  }
}

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
      const storedFingerprint = (userMessage as any).submissionFingerprint;
      if (storedFingerprint && storedFingerprint !== args.submissionFingerprint) {
        throw new Error("Submission already belongs to different request details");
      }
    }
    const assistant = await ctx.db
      .query("chat_messages")
      .withIndex("by_user_submission_and_role", (q) =>
        q.eq("userId", args.userId).eq("clientSubmissionId", args.clientSubmissionId).eq("role", "ai"),
      )
      .first();
    if (assistant) {
      if (!sameOptionalId(assistant.sessionId, args.sessionId)) throw new Error("Submission already belongs to a different chat session");
      if (userMessage && !(userMessage as any).submissionFingerprint) {
        await ctx.db.patch(userMessage._id, { submissionFingerprint: args.submissionFingerprint } as any);
      }
      if (assistant.turnContractVersion === 1 && assistant.turnOutcome) {
        return {
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
        };
      }
      return { state: "in_progress" as const };
    }
    const now = Date.now();
    const currentVersion = (userMessage as any)?.processingLeaseVersion ?? 0;
    const currentOwner = (userMessage as any)?.processingLeaseOwner;
    const currentExpiry = (userMessage as any)?.processingLeaseExpiresAt;
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
      await ctx.db.patch(userMessage._id, claimFields as any);
      return { state: "claimed" as const, messageId: userMessage._id, claimVersion: nextVersion };
    }
    const id = await ctx.db.insert("chat_messages", {
      userId: args.userId,
      sessionId: args.sessionId,
      role: "user",
      content: args.content,
      clientSubmissionId: args.clientSubmissionId,
      ...claimFields,
    } as any);
    if (args.sessionId && session && isHomepageTitle(session.title) && !session.previewTitle) {
      await ctx.db.patch(args.sessionId, { previewTitle: args.content.slice(0, 40).trim() });
    }
    return { state: "claimed" as const, messageId: id, claimVersion: nextVersion };
  },
});

export const getAssistantOutcomeForGroup = internalQuery({
  args: {
    userId: v.string(),
    actionGroupId: v.id("actionGroups"),
  },
  handler: async (ctx, { userId, actionGroupId }) => {
    const message = (await ctx.db
      .query("chat_messages")
      .withIndex("by_action_group", (q) => q.eq("actionGroupId", actionGroupId))
      .collect())
      .filter((candidate) => candidate.role === "ai")
      .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))[0];
    if (!message) return null;
    if (message.userId !== userId || message.role !== "ai") throw new Error("Not found");
    return message;
  },
});

export const updateSessionTitleFromAI = internalMutation({
  args: { userId: v.string(), sessionId: v.id("chat_sessions"), title: v.string() },
  handler: async (ctx, { userId, sessionId, title }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(sessionId, { title: title.slice(0, 60), updatedAt: Date.now() });
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

// ─── Homepage chat session ─────────────────────────────────────────────────
//
// Each calendar day gets its own homepage session, titled "__HOMEPAGE_YYYY-MM-DD__".
// This keeps daily conversations separate while preserving full history in
// the CoachPage session list.

const homepageTitle = (date: string) => `__HOMEPAGE_${date}__`;
const isHomepageTitle = (t: string) => t.startsWith("__HOMEPAGE_");

export const getOrCreateHomepageSession = internalMutation({
  args: { userId: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, { userId, date }) => {
    const today = date ?? new Date().toISOString().split("T")[0];
    const title = homepageTitle(today);
    const existing = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), title))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("chat_sessions", {
      userId,
      title,
      updatedAt: Date.now(),
      previewTitle: today,  // show the date as the label in CoachPage
    });
  },
});

export const getHomepageMessages = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const today = date ?? new Date().toISOString().split("T")[0];
    const title = homepageTitle(today);
    const session = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), title))
      .first();
    if (!session) return { sessionId: null, messages: [] as { role: string; content: string; ts: number; id: string }[] };
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const sorted = messages
      .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
      .slice(-30)
      .map((m) => ({
        role: m.role,
        content: m.content,
        ts: m._creationTime ?? 0,
        id: m._id,
        ...(m.turnContractVersion !== undefined ? { turnContractVersion: m.turnContractVersion } : {}),
        ...(m.turnOutcome !== undefined ? { turnOutcome: m.turnOutcome } : {}),
        ...(m.turnCards !== undefined ? { turnCards: m.turnCards } : {}),
        ...(m.actionGroupId !== undefined ? { actionGroupId: m.actionGroupId } : {}),
        ...(m.actionIds !== undefined ? { actionIds: m.actionIds } : {}),
        ...(m.clientSubmissionId !== undefined ? { clientSubmissionId: m.clientSubmissionId } : {}),
      }));
    return { sessionId: session._id, messages: sorted };
  },
});

export const clearHomepageMessages = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const today = new Date().toISOString().split("T")[0];
    const title = homepageTitle(today);
    const session = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), title))
      .first();
    if (!session) return;
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    await Promise.all(messages.map((m) => ctx.db.delete(m._id)));
  },
});

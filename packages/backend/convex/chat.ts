import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { assertChatTurnCards } from "../../shared/src/chat-turn";

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
    turnContractVersion: v.optional(v.literal(1)),
    turnOutcome: v.optional(v.union(
      v.literal("committed"),
      v.literal("confirmation_required"),
      v.literal("failed"),
      v.literal("no_action"),
    )),
    turnCards: v.optional(v.any()),
    actionGroupId: v.optional(v.id("actionGroups")),
    actionIds: v.optional(v.array(v.id("actions"))),
  },
  handler: async (ctx, args) => {
    const session = args.sessionId ? await ctx.db.get(args.sessionId) : null;
    if (args.sessionId && (!session || session.userId !== args.userId)) throw new Error("Not found");
    if (args.turnCards !== undefined) assertChatTurnCards(args.turnCards);
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
    const id = await ctx.db.insert("chat_messages", args);
    // Cache first user message as previewTitle on homepage sessions (avoids N+1 in getSessions)
    if (args.role === "user" && args.sessionId) {
      if (session && isHomepageTitle(session.title) && !session.previewTitle) {
        await ctx.db.patch(args.sessionId, { previewTitle: args.content.slice(0, 40).trim() });
      }
    }
    return id;
  },
});

export const updateAssistantOutcomeForGroup = internalMutation({
  args: {
    userId: v.string(),
    actionGroupId: v.id("actionGroups"),
    content: v.string(),
    turnOutcome: v.union(
      v.literal("committed"),
      v.literal("confirmation_required"),
      v.literal("failed"),
      v.literal("no_action"),
    ),
    turnCards: v.any(),
    actionIds: v.array(v.id("actions")),
  },
  handler: async (ctx, args) => {
    assertChatTurnCards(args.turnCards);
    const message = await ctx.db
      .query("chat_messages")
      .withIndex("by_action_group", (q) => q.eq("actionGroupId", args.actionGroupId))
      .first();
    if (!message) return null;
    if (message.userId !== args.userId || message.role !== "ai") throw new Error("Not found");
    await ctx.db.patch(message._id, {
      content: args.content,
      turnContractVersion: 1,
      turnOutcome: args.turnOutcome,
      turnCards: args.turnCards,
      actionIds: args.actionIds,
    });
    return await ctx.db.get(message._id);
  },
});

export const getAssistantOutcomeForGroup = internalQuery({
  args: {
    userId: v.string(),
    actionGroupId: v.id("actionGroups"),
  },
  handler: async (ctx, { userId, actionGroupId }) => {
    const message = await ctx.db
      .query("chat_messages")
      .withIndex("by_action_group", (q) => q.eq("actionGroupId", actionGroupId))
      .first();
    if (!message || message.userId !== userId || message.role !== "ai") throw new Error("Not found");
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

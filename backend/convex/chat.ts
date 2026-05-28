import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

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
      .filter((s) => !s.title.startsWith("__"))
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
      .map((m) => ({ role: m.role, content: m.content }));
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
  args: { sessionId: v.id("chat_sessions") },
  handler: async (ctx, { sessionId }) => {
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
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("chat_messages", args);
  },
});

export const updateSessionTitleFromAI = internalMutation({
  args: { sessionId: v.id("chat_sessions"), title: v.string() },
  handler: async (ctx, { sessionId, title }) => {
    await ctx.db.patch(sessionId, { title: title.slice(0, 60), updatedAt: Date.now() });
  },
});

export const touchSession = internalMutation({
  args: { sessionId: v.id("chat_sessions") },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, { updatedAt: Date.now() });
  },
});

// ─── Homepage chat session ─────────────────────────────────────────────────
//
// The homepage uses ONE persistent chat session per user, identified by the
// title prefix "__HOMEPAGE__". This keeps history continuous across reloads
// without leaking the homepage thread into the user's named coach sessions.

const HOMEPAGE_TITLE = "__HOMEPAGE__";

export const getOrCreateHomepageSession = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), HOMEPAGE_TITLE))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("chat_sessions", {
      userId,
      title: HOMEPAGE_TITLE,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Public query for the homepage to fetch its persistent chat thread.
 * Returns messages in chronological order, capped at the most recent 30
 * (the homepage UI doesn't need long history; the agent keeps last 12 in context).
 */
export const getHomepageMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), HOMEPAGE_TITLE))
      .first();
    if (!session) return { sessionId: null, messages: [] as { role: string; content: string; ts: number }[] };
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const sorted = messages
      .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0))
      .slice(-30)
      .map((m) => ({ role: m.role, content: m.content, ts: m._creationTime ?? 0 }));
    return { sessionId: session._id, messages: sorted };
  },
});

/**
 * Clear the homepage chat thread. Useful for "start fresh" UX.
 */
export const clearHomepageMessages = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db
      .query("chat_sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("title"), HOMEPAGE_TITLE))
      .first();
    if (!session) return;
    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    await Promise.all(messages.map((m) => ctx.db.delete(m._id)));
  },
});

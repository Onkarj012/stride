import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";

const OPENROUTER_KEY_SHAPE = /^sk-or-[A-Za-z0-9_-]{20,}$/;
const OPENROUTER_VERIFY_URL = "https://openrouter.ai/api/v1/key";
const UNREACHABLE = "Couldn't reach OpenRouter to check the key. Try again.";

/** Checks a key against OpenRouter's key endpoint. Never includes the key in an error. */
async function verifyOpenRouterKey(key: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_VERIFY_URL, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (res.status === 200) return;
  if (res.status === 401 || res.status === 403) throw new Error("OpenRouter rejected that key.");
  throw new Error(UNREACHABLE);
}

/** The caller's subject, the userId used across the ledger tables. Throws when signed out. */
async function callerUserId(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

/** Checks and stores the caller's OpenRouter key. Returns only its last 4 characters. */
export const saveOpenRouterKey = action({
  args: { key: v.string() },
  returns: v.object({ last4: v.string() }),
  handler: async (ctx, { key }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const trimmed = key.trim();
    if (!OPENROUTER_KEY_SHAPE.test(trimmed)) throw new Error("That doesn't look like an OpenRouter key.");
    await verifyOpenRouterKey(trimmed);
    await ctx.runMutation(internal.api_keys.storeOpenRouterKey, { userId: identity.subject, key: trimmed });
    return { last4: trimmed.slice(-4) };
  },
});

/** Writes the key row, replacing any earlier key for the same user. */
export const storeOpenRouterKey = internalMutation({
  args: { userId: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, key }) => {
    const row = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_and_provider", (q) => q.eq("userId", userId).eq("provider", "openrouter"))
      .unique();
    const value = { userId, provider: "openrouter" as const, key, last4: key.slice(-4), updatedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, value);
    else await ctx.db.insert("user_api_keys", value);
    return null;
  },
});

/** Deletes the caller's OpenRouter key. */
export const removeOpenRouterKey = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await callerUserId(ctx);
    const row = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_and_provider", (q) => q.eq("userId", userId).eq("provider", "openrouter"))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

/** Whether the caller has an OpenRouter key, and its last 4 characters. The key itself is never returned. */
export const openRouterKeyStatus = query({
  args: {},
  returns: v.object({ set: v.boolean(), last4: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const userId = await callerUserId(ctx);
    const row = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_and_provider", (q) => q.eq("userId", userId).eq("provider", "openrouter"))
      .unique();
    return { set: row !== null, last4: row?.last4 ?? null };
  },
});

/** The user's own OpenRouter key, or null. Called by the OpenRouter client, never by the app. */
export const ownOpenRouterKey = internalQuery({
  args: { userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("user_api_keys")
      .withIndex("by_userId_and_provider", (q) => q.eq("userId", userId).eq("provider", "openrouter"))
      .unique();
    return row?.key ?? null;
  },
});

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { assertLedgerWritable } from "./users";

const OPENROUTER_KEY_SHAPE = /^sk-or-[A-Za-z0-9_-]{20,}$/;
const OPENROUTER_VERIFY_URL = "https://openrouter.ai/api/v1/key";

/** A key-save failure. ConvexError data reaches the app even when production redacts plain errors. */
function keyError(code: string, message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code, message });
}

/** Checks a key against OpenRouter's key endpoint. Never includes the key in an error. */
async function verifyOpenRouterKey(key: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_VERIFY_URL, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    throw keyError("KEY_CHECK_FAILED", "Couldn't reach OpenRouter to check the key. Try again.");
  }
  if (res.status === 200) return;
  if (res.status === 401 || res.status === 403) throw keyError("KEY_REJECTED", "OpenRouter rejected that key.");
  throw keyError("KEY_CHECK_FAILED", "Couldn't reach OpenRouter to check the key. Try again.");
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
    if (!OPENROUTER_KEY_SHAPE.test(trimmed)) throw keyError("KEY_FORMAT", "That doesn't look like an OpenRouter key.");
    await verifyOpenRouterKey(trimmed);
    await ctx.runMutation(internal.api_keys.storeOpenRouterKey, { userId: identity.subject, key: trimmed });
    return { last4: trimmed.slice(-4) };
  },
});

/** Writes the key row, replacing any earlier key for the same user. Refuses if a clear ran during the OpenRouter check. */
export const storeOpenRouterKey = internalMutation({
  args: { userId: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, key }) => {
    await assertLedgerWritable(ctx, userId);
    // clearAllData deletes the profile row, and a real save always comes from Settings after it exists.
    const settings = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (settings === null) throw keyError("KEY_SAVE_CANCELLED", "Your data was cleared. Add the key again.");
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

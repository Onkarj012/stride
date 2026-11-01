import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUserId } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Returns whether this user has opted into label capture and saved meals. */
export const enabled = internalQuery({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return settings?.foodShortcutsEnabled === true;
  },
});

/** Reads the caller's opt-in setting. */
export const getEnabled = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return settings?.foodShortcutsEnabled === true;
  },
});

/** Saves the caller's opt-in setting, off by default for existing accounts. */
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled: next }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (settings === null) await ctx.db.insert("user_settings", { userId, foodShortcutsEnabled: next });
    else await ctx.db.patch("user_settings", settings._id, { foodShortcutsEnabled: next });
    return null;
  },
});

/** Rejects feature reads and writes until the user opts in. */
export async function requireFoodShortcuts(ctx: MutationCtx | QueryCtx, userId: string): Promise<void> {
  const settings = await ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
  if (settings?.foodShortcutsEnabled !== true) {
    throw new ConvexError({ code: "FOOD_SHORTCUTS_DISABLED", message: "Turn on saved meals and label capture in Settings first." });
  }
}

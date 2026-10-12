import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type ActionCtx } from "./_generated/server";
import { requireUserId } from "./time_zone";
import { assertLedgerWritable } from "./users";

/** Returns the authenticated HTTP endpoint that stores and registers photos in one server flow. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("Upload endpoint is unavailable");
    return `${siteUrl}/upload`;
  },
});

/** Confirms an already-owned upload without allowing callers to claim arbitrary storage ids. */
export const registerUpload = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    const existing = await ctx.db.query("uploads").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique();
    if (existing === null || existing.userId !== userId || (await ctx.db.system.get("_storage", storageId)) === null) {
      throw new Error("Upload not found. Upload it again.");
    }
    return null;
  },
});

/** Registers only a file the authenticated HTTP action just created, while blocking writes during account clearing. */
export const registerStoredUpload = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    await assertLedgerWritable(ctx, userId);
    if ((await ctx.db.system.get("_storage", storageId)) === null) throw new Error("Upload not found. Upload it again.");
    await ctx.db.insert("uploads", { userId, storageId, createdAt: Date.now() });
    return null;
  },
});

/** True when `userId` registered this file. */
export const ownsUpload = internalQuery({
  args: { userId: v.string(), storageId: v.id("_storage") },
  returns: v.boolean(),
  handler: async (ctx, { userId, storageId }) => {
    const row = await ctx.db
      .query("uploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .unique();
    return row !== null && row.userId === userId;
  },
});

/** Throws unless the caller owns the file, so no one can feed, or later delete, another user's upload. */
export async function requireOwnUpload(ctx: ActionCtx, userId: string, storageId: Id<"_storage">): Promise<void> {
  const owned: boolean = await ctx.runQuery(internal.uploads.ownsUpload, { userId, storageId });
  if (!owned) throw new Error("Photo not found. Upload it again.");
}

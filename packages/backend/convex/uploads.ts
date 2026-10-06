import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, type ActionCtx } from "./_generated/server";
import { requireUserId } from "./time_zone";

/** A short-lived URL a signed-in client POSTs a photo to. The client then calls `registerUpload` with the returned id. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Records the caller as the owner of a file they just uploaded. Registering your own file twice is a no-op. */
export const registerUpload = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    if ((await ctx.db.system.get("_storage", storageId)) === null) throw new Error("Upload not found. Upload it again.");
    const existing = await ctx.db
      .query("uploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .unique();
    if (existing !== null) {
      if (existing.userId !== userId) throw new Error("Upload not found. Upload it again.");
      return null;
    }
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

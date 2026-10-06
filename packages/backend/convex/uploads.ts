import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUserId } from "./time_zone";

/** A short-lived URL a signed-in client POSTs a photo to. The upload response holds the `_storage` id for `logInput`. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

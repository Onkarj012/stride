import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserFromToken } from "./auth";

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    return await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("asc")
      .collect();
  },
});

export const send = mutation({
  args: {
    token: v.string(),
    role: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    return await ctx.db.insert("chatMessages", {
      userId: user._id,
      role: args.role,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});

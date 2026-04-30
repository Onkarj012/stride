import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";

const TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token + Date.now().toString(36);
}

export async function getUserFromToken(ctx: QueryCtx | MutationCtx, token: string) {
  const session = await ctx.db
    .query("authSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  return await ctx.db.get(session.userId);
}

// --- Internal functions for database operations ---

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
    };
  },
});

export const doRegister = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) {
      throw new Error("Email already registered");
    }

    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      passwordHash: args.passwordHash,
      createdAt: Date.now(),
    });

    const today = new Date().toISOString().split("T")[0];
    await ctx.db.insert("dailyGoals", {
      userId,
      date: today,
      calorieGoal: 2400,
      proteinGoal: 180,
      carbGoal: 280,
      fatGoal: 80,
      waterGoal: 3.5,
    });

    const token = generateToken();
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    await ctx.db.insert("authSessions", {
      userId,
      token,
      expiresAt,
    });

    return { token, userId, name: args.name, email: args.email };
  },
});

export const doLogin = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const token = generateToken();
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    await ctx.db.insert("authSessions", {
      userId: args.userId,
      token,
      expiresAt,
    });

    return { token, userId: args.userId, name: args.name, email: args.email };
  },
});

// --- Public mutations (no bcryptjs needed) ---

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session) {
      await ctx.db.delete(session._id);
    }
    return { success: true };
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) return null;
    return { userId: user._id, name: user.name, email: user.email };
  },
});

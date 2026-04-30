"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import bcrypt from "bcryptjs";

export const register = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const passwordHash = await bcrypt.hash(args.password, 10);
    const result = await ctx.runMutation(internal.auth.doRegister, {
      email: args.email,
      passwordHash,
      name: args.name,
    });
    return result;
  },
});

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.auth.getUserByEmail, { email: args.email });
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const valid = await bcrypt.compare(args.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    const result = await ctx.runMutation(internal.auth.doLogin, {
      userId: user._id,
      name: user.name,
      email: user.email,
    });
    return result;
  },
});

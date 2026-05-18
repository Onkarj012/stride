import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const p = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!p) return null;
    return {
      weight: p.weight ?? null,
      height: p.height ?? null,
      age: p.age ?? null,
      activityLevel: p.activityLevel,
      calorieTarget: p.calorieTarget ?? null,
      proteinTarget: p.proteinTarget ?? null,
      carbTarget: p.carbTarget ?? null,
      fatTarget: p.fatTarget ?? null,
    };
  },
});

export const upsertProfile = mutation({
  args: {
    weight: v.optional(v.number()),
    height: v.optional(v.number()),
    age: v.optional(v.number()),
    activityLevel: v.optional(v.string()),
    calorieTarget: v.optional(v.number()),
    proteinTarget: v.optional(v.number()),
    carbTarget: v.optional(v.number()),
    fatTarget: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const patch = {
      activityLevel: args.activityLevel ?? existing?.activityLevel ?? "moderate",
      ...(args.weight !== undefined ? { weight: args.weight } : {}),
      ...(args.height !== undefined ? { height: args.height } : {}),
      ...(args.age !== undefined ? { age: args.age } : {}),
      ...(args.calorieTarget !== undefined ? { calorieTarget: args.calorieTarget } : {}),
      ...(args.proteinTarget !== undefined ? { proteinTarget: args.proteinTarget } : {}),
      ...(args.carbTarget !== undefined ? { carbTarget: args.carbTarget } : {}),
      ...(args.fatTarget !== undefined ? { fatTarget: args.fatTarget } : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("user_profiles", { userId, ...patch });
    }
  },
});

export const getProfileForContext = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("user_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

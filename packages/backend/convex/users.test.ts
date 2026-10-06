import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { CLEAR_LEDGER_BATCH, CLEAR_MESSAGE_BATCH, EXPORT_MESSAGE_LIMIT } from "./users";

const modules = import.meta.glob("./**/*.*s");

const PER_100G = { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, sodiumMg: 1 };

/** Ids one seeded user's restart rows point at. */
type Seeded = { chatId: Id<"chats">; draftId: Id<"drafts">; linkId: Id<"food_links">; fileId: Id<"_storage"> };

afterEach(() => {
  vi.useRealTimers();
});

/** Inserts one row in every per-user restart table for `userId`, plus `extraMessages` more messages and links. */
async function seedUser(t: TestConvex<typeof schema>, userId: string, sharedFood: Id<"foods">, extra = 0): Promise<Seeded> {
  const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
  return await t.run(async (ctx) => {
    const ownFood = await ctx.db.insert("foods", {
      name: "Homemade paneer",
      aliases: [],
      searchText: "Homemade paneer",
      per100g: PER_100G,
      source: "user",
      sourceId: `${userId}:homemade paneer`,
      verified: true,
      ownerUserId: userId,
    });
    const chatId = await ctx.db.insert("chats", { userId, title: "Lunch", updatedAt: 1 });
    await ctx.db.insert("messages", {
      userId,
      chatId,
      role: "user",
      text: "rice",
      attachments: [{ kind: "image", storageId: fileId }],
      toolCalls: [],
      draftIds: [],
      submissionId: "m0",
    });
    for (let i = 0; i < extra; i++) {
      await ctx.db.insert("messages", { userId, chatId, role: "assistant", text: `reply ${i}`, attachments: [], toolCalls: [], draftIds: [] });
      await ctx.db.insert("food_links", { userId, key: `food ${i}`, foodId: sharedFood, status: "active", uses: 1, updatedAt: 1 });
    }
    const draftId = await ctx.db.insert("drafts", {
      userId,
      chatId,
      submissionId: "d0",
      status: "pending",
      createdAt: 1,
      items: [{ text: "rice", foodId: sharedFood, grams: 150 }],
    });
    const linkId = await ctx.db.insert("food_links", { userId, key: "paneer", foodId: ownFood, status: "active", uses: 1, updatedAt: 1 });
    await ctx.db.insert("user_measures", { userId, measure: "katori", ml: 150 });
    const exerciseId = await ctx.db.insert("exercises", {
      sourceId: `${userId}-squat`,
      name: "Squat",
      category: "strength",
      equipment: null,
      mechanic: null,
      level: null,
      primaryMuscles: [],
      secondaryMuscles: [],
    });
    const sessionId = await ctx.db.insert("workout_sessions", {
      userId,
      localDate: "2026-10-05",
      timeZone: "Asia/Kolkata",
      startedAt: 1,
      submissionId: "w0",
    });
    await ctx.db.insert("sets", {
      userId,
      sessionId,
      exerciseId,
      setIndex: 0,
      reps: 5,
      weightKg: 60,
      revision: 1,
      status: "live",
      submissionId: "w0:s0",
    });
    await ctx.db.insert("tdee_snapshots", {
      userId,
      localDate: "2026-10-05",
      estimateKcal: 2400,
      trendKg: 72,
      windowDays: 14,
      confidence: 0.8,
    });
    return { chatId, draftId, linkId, fileId };
  });
}

/** A backend with a shared food and two users, each with rows in every restart table. */
async function setup(extra = 0) {
  const t = convexTest(schema, modules);
  const sharedFood = await t.run((ctx) =>
    ctx.db.insert("foods", { name: "Rice", aliases: [], searchText: "Rice", per100g: PER_100G, source: "fdc", sourceId: "1", verified: true }),
  );
  const a = await seedUser(t, "user_a", sharedFood, extra);
  const b = await seedUser(t, "user_b", sharedFood);
  return { t, sharedFood, a, b, user: t.withIdentity({ subject: "user_a" }) };
}

/** userId of every row left in each per-user restart table, plus foods by owner and the files still stored. */
async function remaining(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const owners = async <T extends { userId: string }>(rows: Promise<T[]>) => [...new Set((await rows).map((r) => r.userId))];
    return {
      chats: await owners(ctx.db.query("chats").take(1000)),
      messages: await owners(ctx.db.query("messages").take(1000)),
      drafts: await owners(ctx.db.query("drafts").take(1000)),
      food_links: await owners(ctx.db.query("food_links").take(1000)),
      user_measures: await owners(ctx.db.query("user_measures").take(1000)),
      workout_sessions: await owners(ctx.db.query("workout_sessions").take(1000)),
      sets: await owners(ctx.db.query("sets").take(1000)),
      tdee_snapshots: await owners(ctx.db.query("tdee_snapshots").take(1000)),
      foods: (await ctx.db.query("foods").take(1000)).map((f) => f.ownerUserId ?? "shared").sort(),
      files: (await ctx.db.system.query("_storage").take(1000)).length,
    };
  });
}

describe("clearAllData", () => {
  test("removes every restart table's rows and files for the caller, across batches, and nothing else", async () => {
    vi.useFakeTimers();
    // More messages and links than one batch, so both tables need a rescheduled pass.
    const { t, user } = await setup(Math.max(CLEAR_LEDGER_BATCH, CLEAR_MESSAGE_BATCH) + 5);
    await user.mutation(api.users.clearAllData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await user.query(api.users.ledgerClearPending, {})).toBe(false);
    expect(await remaining(t)).toEqual({
      chats: ["user_b"],
      messages: ["user_b"],
      drafts: ["user_b"],
      food_links: ["user_b"],
      user_measures: ["user_b"],
      workout_sessions: ["user_b"],
      sets: ["user_b"],
      tdee_snapshots: ["user_b"],
      foods: ["shared", "user_b"],
      files: 1,
    });
  });

  test("refuses chat, draft confirm and discard, food link and personal food writes until the clear finishes", async () => {
    vi.useFakeTimers();
    const { t, sharedFood, a, user } = await setup();
    await user.mutation(api.users.clearAllData, {});
    const cleared = /being cleared/;

    await expect(user.mutation(api.chats.createChat, {})).rejects.toThrow(cleared);
    await expect(
      t.mutation(internal.chats.claimTurn, {
        userId: "user_a",
        chatId: a.chatId,
        submissionId: "m1",
        text: "dal",
        attachments: [],
        audioPending: false,
      }),
    ).rejects.toThrow(cleared);
    await expect(
      t.mutation(internal.chats.insertAssistantMessage, {
        userId: "user_a",
        chatId: a.chatId,
        submissionId: "m0",
        text: "Logged.",
        toolCalls: [],
        draftIds: [],
        entryIds: [],
      }),
    ).rejects.toThrow(cleared);
    await expect(
      t.mutation(internal.pipeline.resolve.commitLog, {
        userId: "user_a",
        submissionId: "l1",
        inputKind: "text",
        items: [{ food: "rice", quantity: 1, unit: "cup", slot: null, date: null, fromPhoto: false, portionScale: null, cookingOil: false, confidence: 1 }],
        picks: [{ index: 0, foodId: sharedFood }],
      }),
    ).rejects.toThrow(cleared);
    await expect(user.mutation(api.pipeline.drafts.confirmDraft, { draftId: a.draftId })).rejects.toThrow(cleared);
    await expect(user.mutation(api.pipeline.drafts.discardDraft, { draftId: a.draftId })).rejects.toThrow(cleared);
    await expect(user.mutation(api.pipeline.drafts.forgetFoodLink, { linkId: a.linkId })).rejects.toThrow(cleared);
    await expect(user.mutation(api.foods_db.createUserFood, { name: "Ghee roti", per100g: PER_100G })).rejects.toThrow(cleared);

    // Another user's writes are not blocked.
    const other = t.withIdentity({ subject: "user_b" });
    await expect(other.mutation(api.chats.createChat, {})).resolves.toBeDefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(user.mutation(api.chats.createChat, {})).resolves.toBeDefined();
  });
});

describe("exportAllData", () => {
  test("includes the caller's restart rows only, with owned foods and no shared ones", async () => {
    const { a, user } = await setup();
    const data = await user.query(api.users.exportAllData, {});
    expect(data.chats.map((c) => c._id)).toEqual([a.chatId]);
    expect(data.messages.map((m) => m.attachments[0]?.storageId)).toEqual([a.fileId]);
    expect(data.drafts.map((d) => d._id)).toEqual([a.draftId]);
    expect(data.food_links.map((l) => l._id)).toEqual([a.linkId]);
    expect(data.foods.map((f) => f.ownerUserId)).toEqual(["user_a"]);
    expect(data.user_measures.map((m) => m.measure)).toEqual(["katori"]);
    expect(data.workout_sessions.map((s) => s.userId)).toEqual(["user_a"]);
    expect(data.sets.map((s) => s.reps)).toEqual([5]);
    expect(data.tdee_snapshots.map((s) => s.estimateKcal)).toEqual([2400]);
    expect(Object.values(data.truncated).every((flag) => !flag)).toBe(true);
  });

  test("caps a long table and marks it truncated", async () => {
    const { user } = await setup(EXPORT_MESSAGE_LIMIT);
    const data = await user.query(api.users.exportAllData, {});
    expect(data.messages).toHaveLength(EXPORT_MESSAGE_LIMIT);
    expect(data.truncated.messages).toBe(true);
    expect(data.truncated.food_links).toBe(false);
  });
});

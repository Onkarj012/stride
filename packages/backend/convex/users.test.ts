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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Inserts one row in every per-user restart table for `userId`, plus `extraMessages` more messages and links. */
async function seedUser(t: TestConvex<typeof schema>, userId: string, sharedFood: Id<"foods">, extra = 0): Promise<Seeded> {
  const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
  return await t.run(async (ctx) => {
    await ctx.db.insert("user_settings", { userId, timeZone: "Asia/Kolkata", calorieTarget: { kcal: 2200, source: "adaptive", appliedLocalDate: "2026-10-05" } });
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
    await ctx.db.insert("uploads", { userId, storageId: fileId, createdAt: 1 });
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
      const photo = await ctx.storage.store(new Blob(["standalone Compose photo"], { type: "image/jpeg" }));
      await ctx.db.insert("uploads", { userId, storageId: photo, createdAt: 1 });
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
      uploads: await owners(ctx.db.query("uploads").take(1000)),
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

/** Adds one live entry and one food memory event for both seeded users. */
async function seedLinkEvents(t: TestConvex<typeof schema>, linkId: Id<"food_links">) {
  await t.run(async (ctx) => {
    const link = await ctx.db.get(linkId);
    if (link === null) throw new Error("seeded link missing");
    for (const userId of ["user_a", "user_b"]) {
      const entryId = await ctx.db.insert("entries", {
        userId,
        localDate: "2026-10-05",
        timeZone: "Asia/Kolkata",
        slot: "lunch",
        loggedAt: 1,
        foodId: link.foodId,
        foodName: "Paneer",
        grams: 100,
        nutrients: { kcal: 265, protein: 18, carbs: 1, fat: 21, fiber: null, sugar: null, sodiumMg: null },
        source: "db",
        confidence: 1,
        flags: [],
        revision: 1,
        op: "add",
        status: "live",
        createdBy: "ai",
        submissionId: `${userId}:e0`,
      });
      await ctx.db.insert("food_link_events", {
        userId,
        key: "paneer",
        submissionId: `${userId}:d0`,
        entryId,
        changes: [{ linkId, before: null, after: { status: "active", uses: 1, updatedAt: 1 } }],
      });
    }
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
    expect((await t.run((ctx) => ctx.db.query("user_settings").take(10))).map((row) => row.userId)).toEqual(["user_b"]);
    expect(await remaining(t)).toEqual({
      uploads: ["user_b"],
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

  test("removes the caller's food memory events and keeps another user's", async () => {
    vi.useFakeTimers();
    const { t, a, user } = await setup();
    await seedLinkEvents(t, a.linkId);
    await user.mutation(api.users.clearAllData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.query("food_link_events").take(10))).map((row) => row.userId)).toEqual(["user_b"]);
  });

  test("removes the live text row of a reply streaming while the clear runs, and keeps another user's", async () => {
    vi.useFakeTimers();
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      for (const userId of ["user_a", "user_b"]) {
        const chatId = await ctx.db.insert("chats", { userId, title: "Live", updatedAt: 1 });
        const messageId = await ctx.db.insert("messages", {
          userId, chatId, role: "assistant", text: "", attachments: [], toolCalls: [], draftIds: [], submissionId: `${userId}-live:reply`, status: "streaming", claimedAt: 1,
        });
        await ctx.db.insert("reply_streams", { messageId, userId, text: "half a reply" });
      }
    });
    await user.mutation(api.users.clearAllData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.query("reply_streams").take(10))).map((row) => row.userId)).toEqual(["user_b"]);
  });

  test("removes the caller's saved OpenRouter key and keeps another user's", async () => {
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("user_api_keys", { userId: "user_a", provider: "openrouter", key: "sk-or-v1-test-000000000000000000", last4: "0000", updatedAt: 1 });
      await ctx.db.insert("user_api_keys", { userId: "user_b", provider: "openrouter", key: "sk-or-v1-test-111111111111111111", last4: "1111", updatedAt: 1 });
    });
    await user.mutation(api.users.clearAllData, {});
    expect(await t.run((ctx) => ctx.db.query("user_api_keys").take(10))).toEqual([
      expect.objectContaining({ userId: "user_b", last4: "1111" }),
    ]);
  });

  test("refuses chat, draft confirm and discard, food link and personal food writes until the clear finishes", async () => {
    vi.useFakeTimers();
    const { t, sharedFood, a, user } = await setup();
    await user.mutation(api.users.clearAllData, {});

    await expect(user.mutation(api.chats.createChat, {})).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(api.uploads.generateUploadUrl, {})).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(api.uploads.registerUpload, { storageId: a.fileId })).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(internal.uploads.registerStoredUpload, { storageId: a.fileId })).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(
      t.mutation(internal.chats.claimTurn, {
        userId: "user_a",
        chatId: a.chatId,
        submissionId: "m1",
        text: "dal",
        attachments: [],
        audioPending: false,
      }),
    ).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    const replyId = await t.run((ctx) =>
      ctx.db.insert("messages", {
        userId: "user_a",
        chatId: a.chatId,
        role: "assistant",
        text: "",
        attachments: [],
        toolCalls: [],
        draftIds: [],
        status: "streaming",
        claimedAt: 1,
      }),
    );
    await expect(
      t.mutation(internal.chats.finishReply, {
        userId: "user_a",
        messageId: replyId,
        claimedAt: 1,
        status: "done",
        text: "Logged.",
        toolCalls: [],
        draftIds: [],
        entryIds: [],
      }),
    ).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(
      t.mutation(internal.pipeline.resolve.commitLog, {
        userId: "user_a",
        submissionId: "l1",
        inputKind: "text",
        items: [{ food: "rice", quantity: 1, unit: "cup", slot: null, date: null, fromPhoto: false, amountFromImage: false, portionScale: null, cookingOil: false, confidence: 1 }],
        picks: [{ index: 0, foodId: sharedFood }],
      }),
    ).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(api.pipeline.drafts.confirmDraft, { draftId: a.draftId })).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(api.pipeline.drafts.discardDraft, { draftId: a.draftId })).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(api.pipeline.drafts.forgetFoodLink, { linkId: a.linkId })).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });
    await expect(user.mutation(api.foods_db.createUserFood, { name: "Ghee roti", per100g: PER_100G })).rejects.toMatchObject({ data: { code: "LEDGER_CLEARING" } });

    // Another user's writes are not blocked.
    const other = t.withIdentity({ subject: "user_b" });
    await expect(other.mutation(api.chats.createChat, {})).resolves.toBeDefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(user.mutation(api.chats.createChat, {})).resolves.toBeDefined();
  });
  test("a chat turn that finishes after the clear writes no draft for the deleted chat", async () => {
    vi.useFakeTimers();
    const { t, sharedFood, a, user } = await setup();
    const messageId = await t.run(async (ctx) => {
      const message = await ctx.db.query("messages").withIndex("by_userId_and_submissionId", (q) => q.eq("userId", "user_a").eq("submissionId", "m0")).unique();
      if (message === null) throw new Error("missing message");
      return message._id;
    });
    await user.mutation(api.users.clearAllData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // The model reply lands only now, after the marker is gone.
    const item = { food: "rice", quantity: 1, unit: "cup", slot: null, date: null, fromPhoto: false, amountFromImage: false, portionScale: null, cookingOil: false, confidence: 1 };
    const late = { userId: "user_a", inputKind: "chat" as const, items: [item], picks: [{ index: 0, foodId: sharedFood }] };
    await expect(t.mutation(internal.pipeline.resolve.commitLog, { ...late, submissionId: "m0:log", chatId: a.chatId, messageId })).rejects.toThrow(/Chat not found/);
    await expect(t.mutation(internal.pipeline.resolve.commitLog, { ...late, submissionId: "m0:log2", messageId })).rejects.toThrow(/Message not found/);
    expect(await user.query(api.pipeline.drafts.listPendingDrafts, {})).toEqual([]);
    expect((await remaining(t)).drafts).toEqual(["user_b"]);
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
    expect(data.user_settings.map((settings) => settings.calorieTarget)).toEqual([{ kcal: 2200, source: "adaptive", appliedLocalDate: "2026-10-05" }]);
    expect(Object.values(data.truncated).every((flag) => !flag)).toBe(true);
  });

  test("includes the caller's food memory events only", async () => {
    const { t, a, user } = await setup();
    await seedLinkEvents(t, a.linkId);
    const data = await user.query(api.users.exportAllData, {});
    expect(data.food_link_events.map((e) => e.userId)).toEqual(["user_a"]);
    expect(data.truncated.food_link_events).toBe(false);
  });

  test("caps a long table and marks it truncated", async () => {
    const { user } = await setup(EXPORT_MESSAGE_LIMIT);
    const data = await user.query(api.users.exportAllData, {});
    expect(data.messages).toHaveLength(EXPORT_MESSAGE_LIMIT);
    expect(data.truncated.messages).toBe(true);
    expect(data.truncated.food_links).toBe(false);
  });
});

describe("deleteAccount", () => {
  /** Adds a users row, a weight and an entry for both seeded users, since the restart seed has neither. */
  async function seedAccountRows(t: TestConvex<typeof schema>, sharedFood: Id<"foods">) {
    await t.run(async (ctx) => {
      for (const userId of ["user_a", "user_b"]) {
        await ctx.db.insert("users", { clerkId: userId, email: `${userId}@example.com`, name: userId });
        await ctx.db.insert("weights", { userId, localDate: "2026-10-05", kg: 72, loggedAt: 1 });
        await ctx.db.insert("entries", {
          userId,
          localDate: "2026-10-05",
          timeZone: "Asia/Kolkata",
          slot: "lunch",
          loggedAt: 1,
          foodId: sharedFood,
          foodName: "Rice",
          grams: 150,
          nutrients: { kcal: 195, protein: 4, carbs: 42, fat: 0.4, fiber: null, sugar: null, sodiumMg: null },
          source: "db",
          confidence: 1,
          flags: [],
          revision: 1,
          op: "add",
          status: "live",
          createdBy: "user",
          submissionId: `${userId}:e0`,
        });
      }
    });
  }

  test("clears the caller's rows, deletes their Clerk user, and leaves other users alone", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, sharedFood, user } = await setup();
    await seedAccountRows(t, sharedFood);

    await user.action(api.users.deleteAccount, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledWith("https://api.clerk.com/v1/users/user_a", {
      method: "DELETE",
      headers: { Authorization: "Bearer sk_test" },
    });
    const owners = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").take(10)).map((r) => r.clerkId),
      user_settings: (await ctx.db.query("user_settings").take(10)).map((r) => r.userId),
      weights: (await ctx.db.query("weights").take(10)).map((r) => r.userId),
      entries: (await ctx.db.query("entries").take(10)).map((r) => r.userId),
      messages: (await ctx.db.query("messages").take(10)).map((r) => r.userId),
    }));
    expect(owners).toEqual({
      users: ["user_b"],
      user_settings: ["user_b"],
      weights: ["user_b"],
      entries: ["user_b"],
      messages: ["user_b"],
    });
  });

  test("rows written after the first clear but before Clerk answers are swept too", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    const { t, sharedFood, user } = await setup();
    await seedAccountRows(t, sharedFood);
    vi.stubGlobal("fetch", vi.fn(async () => {
      // The first clear's batches finish and drop the write block; then another device logs a weight.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await t.run((ctx) => ctx.db.insert("weights", { userId: "user_a", localDate: "2026-10-06", kg: 71, loggedAt: 2 }));
      return new Response(null, { status: 200 });
    }));

    await user.action(api.users.deleteAccount, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const weights = await t.run(async (ctx) => (await ctx.db.query("weights").take(10)).map((r) => r.userId));
    expect(weights).toEqual(["user_b"]);
  });

  test("throws before clearing anything when the Clerk key is missing", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, user } = await setup();

    await expect(user.action(api.users.deleteAccount, {})).rejects.toMatchObject({ data: { code: "ACCOUNT_DELETE_FAILED" } });
    expect(fetchMock).not.toHaveBeenCalled();
    const settings = await t.run((ctx) => ctx.db.query("user_settings").take(10));
    expect(settings.map((row) => row.userId)).toEqual(["user_a", "user_b"]);
  });

  test("clears the caller's data before a Clerk failure, which reports its status", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => new Response("upstream detail", { status: 500 })));
    const { t, sharedFood, user } = await setup();
    await seedAccountRows(t, sharedFood);

    await expect(user.action(api.users.deleteAccount, {})).rejects.toMatchObject({ data: { code: "ACCOUNT_DELETE_FAILED" } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const owners = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").take(10)).map((r) => r.clerkId),
      user_settings: (await ctx.db.query("user_settings").take(10)).map((r) => r.userId),
      weights: (await ctx.db.query("weights").take(10)).map((r) => r.userId),
      entries: (await ctx.db.query("entries").take(10)).map((r) => r.userId),
      chats: (await ctx.db.query("chats").take(10)).map((r) => r.userId),
    }));
    expect(owners).toEqual({
      users: ["user_b"],
      user_settings: ["user_b"],
      weights: ["user_b"],
      entries: ["user_b"],
      chats: ["user_b"],
    });
    expect(await user.query(api.users.ledgerClearPending, {})).toBe(false);
  });
});

describe("clearAllData and portion rows", () => {
  test("clearing removes an owned food's portion rows with the food", async () => {
    vi.useFakeTimers();
    const { t, user } = await setup();
    await t.run(async (ctx) => {
      const food = await ctx.db.insert("foods", {
        name: "Homemade dal",
        aliases: [],
        searchText: "Homemade dal",
        per100g: PER_100G,
        source: "ai_estimate",
        sourceId: "user_a:ai:homemade dal",
        verified: false,
        ownerUserId: "user_a",
      });
      await ctx.db.insert("food_portions", { foodId: food, source: "ai_estimate", measure: "katori", description: "katori", gramsPerMeasure: 150 });
    });
    await user.mutation(api.users.clearAllData, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run((ctx) => ctx.db.query("food_portions").collect())).toEqual([]);
    expect((await remaining(t)).foods).toEqual(["shared", "user_b"]);
  });
});

describe("exportAllData includes portion rows", () => {
  test("an owned food's portion rows come with the export, and nothing is truncated", async () => {
    const { t, user } = await setup();
    const food = await t.run(async (ctx) => {
      const id = await ctx.db.insert("foods", {
        name: "Homemade dal",
        aliases: [],
        searchText: "Homemade dal",
        per100g: PER_100G,
        source: "user",
        sourceId: "user_a:homemade dal",
        verified: true,
        ownerUserId: "user_a",
      });
      await ctx.db.insert("food_portions", { foodId: id, source: "user", measure: "katori", description: "katori", gramsPerMeasure: 150 });
      return id;
    });

    const data = await user.query(api.users.exportAllData, {});
    expect(data.food_portions.map((row) => [row.foodId, row.measure, row.gramsPerMeasure])).toEqual([[food, "katori", 150]]);
    expect(data.truncated.food_portions).toBe(false);
  });
});

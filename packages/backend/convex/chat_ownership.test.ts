import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedOwnerSession() {
  const t = convexTest(schema, modules);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("chat_sessions", {
      userId: "owner",
      title: "Owner chat",
      updatedAt: 100,
    }),
  );
  return { t, sessionId };
}

test("internal chat operations reject foreign sessions", async () => {
  const { t, sessionId } = await seedOwnerSession();

  await expect(
    t.query(internal.chat.getMessageCount, { userId: "intruder", sessionId }),
  ).rejects.toThrow("Not found");
  await expect(
    t.mutation(internal.chat.addMessage, {
      userId: "intruder",
      sessionId,
      role: "user",
      content: "injected",
    }),
  ).rejects.toThrow("Not found");
  await expect(
    t.mutation(internal.chat.updateSessionTitleFromAI, {
      userId: "intruder",
      sessionId,
      title: "Hijacked",
    }),
  ).rejects.toThrow("Not found");
  await expect(
    t.mutation(internal.chat.touchSession, { userId: "intruder", sessionId }),
  ).rejects.toThrow("Not found");

  await expect(
    t.query(internal.chat.getMessagesForContext, { userId: "intruder", sessionId }),
  ).resolves.toEqual([]);

  const state = await t.run(async (ctx) => ({
    session: await ctx.db.get(sessionId),
    messages: await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect(),
  }));
  expect(state.session).toMatchObject({ title: "Owner chat", updatedAt: 100 });
  expect(state.messages).toEqual([]);
});

test("internal chat operations allow session owners", async () => {
  const { t, sessionId } = await seedOwnerSession();

  await t.mutation(internal.chat.addMessage, {
    userId: "owner",
    sessionId,
    role: "user",
    content: "hello",
  });
  await expect(
    t.query(internal.chat.getMessageCount, { userId: "owner", sessionId }),
  ).resolves.toBe(1);
  await t.mutation(internal.chat.updateSessionTitleFromAI, {
    userId: "owner",
    sessionId,
    title: "Updated chat",
  });
  await t.mutation(internal.chat.touchSession, { userId: "owner", sessionId });

  const state = await t.run(async (ctx) => ({
    session: await ctx.db.get(sessionId),
    messages: await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect(),
  }));
  expect(state.session?.title).toBe("Updated chat");
  expect(state.session?.updatedAt).toBeGreaterThan(100);
  expect(state.messages).toHaveLength(1);
  expect(state.messages[0]).toMatchObject({ userId: "owner", content: "hello" });
});

test("AI actions reject foreign sessions before persistence", async () => {
  const { t, sessionId } = await seedOwnerSession();
  const intruder = t.withIdentity({ subject: "intruder" });

  await expect(
    intruder.action(api.ai.chat, {
      message: "hello",
      sessionId,
      today: "2026-08-07",
    }),
  ).rejects.toThrow("Not found");
  await expect(
    intruder.action(api.ai.homepageInput, {
      message: "hello",
      sessionId,
      today: "2026-08-07",
    }),
  ).rejects.toThrow("Not found");

  const state = await t.run(async (ctx) => ({
    session: await ctx.db.get(sessionId),
    messages: await ctx.db
      .query("chat_messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect(),
  }));
  expect(state.session).toMatchObject({ title: "Owner chat", updatedAt: 100 });
  expect(state.messages).toEqual([]);
});

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { AI_INPUT_LIMITS } from "./ai_guard";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => vi.unstubAllEnvs());

test("generateUploadUrl returns the authenticated upload endpoint and rejects signed-out callers", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  const t = convexTest(schema, modules);
  expect(await t.withIdentity({ subject: "user_a" }).mutation(api.uploads.generateUploadUrl, {})).toBe("https://test.convex.site/upload");
  await expect(t.mutation(api.uploads.generateUploadUrl, {})).rejects.toThrow("Unauthenticated");
});

test("HTTP upload binds the authenticated creator, and another user cannot claim or use their file", async () => {
  const t = convexTest(schema, modules);
  const a = t.withIdentity({ subject: "user_a" });
  const response = await a.fetch("/upload", { method: "POST", body: new Blob(["jpeg"], { type: "image/jpeg" }) });
  expect(response.status).toBe(200);
  const [row] = await t.run((ctx) => ctx.db.query("uploads").take(10));
  if (!row) throw new Error("missing registered upload");
  expect(await response.json()).toEqual({ storageId: row.storageId });
  expect(row.userId).toBe("user_a");
  expect(await t.query(internal.uploads.ownsUpload, { userId: "user_a", storageId: row.storageId })).toBe(true);
  expect(await t.query(internal.uploads.ownsUpload, { userId: "user_b", storageId: row.storageId })).toBe(false);
  await a.mutation(api.uploads.registerUpload, { storageId: row.storageId });
  await expect(t.withIdentity({ subject: "user_b" }).mutation(api.uploads.registerUpload, { storageId: row.storageId })).rejects.toThrow(/Upload not found/);
  expect(await t.run((ctx) => ctx.db.query("uploads").take(10))).toHaveLength(1);
});

test("public registration refuses existing unregistered files, including legacy attachments", async () => {
  const t = convexTest(schema, modules);
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["old attachment"]));
    const chatId = await ctx.db.insert("chats", { userId: "user_b", title: "Legacy photo", updatedAt: 1 });
    await ctx.db.insert("messages", { userId: "user_b", chatId, role: "user", text: "old photo", attachments: [{ kind: "image", storageId: id }], toolCalls: [], draftIds: [] });
    return id;
  });
  const fresh = await t.run((ctx) => ctx.storage.store(new Blob(["fresh unregistered foreign file"])));
  for (const id of [storageId, fresh]) {
    await expect(t.withIdentity({ subject: "user_a" }).mutation(api.uploads.registerUpload, { storageId: id })).rejects.toThrow(/Upload not found/);
  }
  await expect(t.mutation(api.uploads.registerUpload, { storageId })).rejects.toThrow("Unauthenticated");
  expect(await t.run((ctx) => ctx.db.query("uploads").take(10))).toEqual([]);
});

test("HTTP upload rejects unauthenticated, non-image and oversized files without storing them", async () => {
  const t = convexTest(schema, modules);
  expect((await t.fetch("/upload", { method: "POST", body: new Blob(["jpeg"], { type: "image/jpeg" }) })).status).toBe(401);
  const user = t.withIdentity({ subject: "user_a" });
  expect((await user.fetch("/upload", { method: "POST", body: new Blob(["text"], { type: "text/plain" }) })).status).toBe(400);
  expect((await user.fetch("/upload", { method: "POST", body: new Blob([new Uint8Array(AI_INPUT_LIMITS.imageBytes + 1)], { type: "image/jpeg" }) })).status).toBe(413);
  expect(await t.run((ctx) => ctx.db.system.query("_storage").take(10))).toEqual([]);
});

test("an upload during account clearing is refused and the newly stored file is removed", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "user_a" });
  await t.run((ctx) => ctx.db.insert("ledger_clears", { userId: "user_a" }));
  const response = await user.fetch("/upload", { method: "POST", body: new Blob(["jpeg"], { type: "image/jpeg" }) });
  expect(response.status).toBe(409);
  expect(await response.text()).toMatch(/being cleared/);
  await expect(user.mutation(api.uploads.generateUploadUrl, {})).rejects.toThrow(/being cleared/);
  expect(await t.run((ctx) => ctx.db.query("uploads").take(10))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.system.query("_storage").take(10))).toEqual([]);
});

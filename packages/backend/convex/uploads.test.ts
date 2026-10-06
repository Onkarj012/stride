import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("generateUploadUrl returns a URL for a signed-in user", async () => {
  const t = convexTest(schema, modules);
  const url = await t.withIdentity({ subject: "user_a" }).mutation(api.uploads.generateUploadUrl, {});
  expect(url).toMatch(/^https?:\/\//);
});

test("generateUploadUrl and registerUpload reject signed-out callers", async () => {
  const t = convexTest(schema, modules);
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"])));
  await expect(t.mutation(api.uploads.generateUploadUrl, {})).rejects.toThrow("Unauthenticated");
  await expect(t.mutation(api.uploads.registerUpload, { storageId })).rejects.toThrow("Unauthenticated");
});

test("registerUpload records one owner, is idempotent for them, and refuses anyone else", async () => {
  const t = convexTest(schema, modules);
  const a = t.withIdentity({ subject: "user_a" });
  const b = t.withIdentity({ subject: "user_b" });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));

  await a.mutation(api.uploads.registerUpload, { storageId });
  await a.mutation(api.uploads.registerUpload, { storageId });
  await expect(b.mutation(api.uploads.registerUpload, { storageId })).rejects.toThrow(/Upload not found/);

  const rows = await t.run((ctx) => ctx.db.query("uploads").take(10));
  expect(rows.map((r) => [r.userId, r.storageId])).toEqual([["user_a", storageId]]);
  expect(await t.query(internal.uploads.ownsUpload, { userId: "user_a", storageId })).toBe(true);
  expect(await t.query(internal.uploads.ownsUpload, { userId: "user_b", storageId })).toBe(false);
});

test("registerUpload refuses a file that does not exist", async () => {
  const t = convexTest(schema, modules);
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["jpeg"]));
    await ctx.storage.delete(id);
    return id;
  });
  await expect(t.withIdentity({ subject: "user_a" }).mutation(api.uploads.registerUpload, { storageId })).rejects.toThrow(
    /Upload not found/,
  );
});

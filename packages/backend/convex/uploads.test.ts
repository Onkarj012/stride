import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("generateUploadUrl returns a URL for a signed-in user", async () => {
  const t = convexTest(schema, modules);
  const url = await t.withIdentity({ subject: "user_a" }).mutation(api.uploads.generateUploadUrl, {});
  expect(url).toMatch(/^https?:\/\//);
});

test("generateUploadUrl rejects signed-out callers", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.uploads.generateUploadUrl, {})).rejects.toThrow("Unauthenticated");
});

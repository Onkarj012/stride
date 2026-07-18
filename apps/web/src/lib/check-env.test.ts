import { describe, expect, it } from "vitest";
// @ts-expect-error The executable .mjs intentionally has no runtime dependency on TypeScript declarations.
import { missingProductionEnv } from "../../scripts/check-env.mjs";

describe("production environment check", () => {
  it("reports missing required variables and skips development", () => {
    expect(missingProductionEnv({ NODE_ENV: "production" })).toEqual([
      "VITE_CONVEX_URL",
      "VITE_CLERK_PUBLISHABLE_KEY",
    ]);
    expect(missingProductionEnv({ NODE_ENV: "development" })).toEqual([]);
  });
});

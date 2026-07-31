import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex/_generated/api": path.resolve(__dirname, "./src/lib/convex-api-shim.ts"),
      "@convex": path.resolve(__dirname, "../backend/convex"),
      "@stride/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

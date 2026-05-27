import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "../backend/convex"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split three.js + R3F + drei into a separate chunk so the rest
          // of the app stays light and the heavy 3D code can be lazy-loaded.
          if (
            id.includes("node_modules/three") ||
            id.includes("node_modules/@react-three") ||
            id.includes("node_modules/three-stdlib")
          ) {
            return "voxel-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});

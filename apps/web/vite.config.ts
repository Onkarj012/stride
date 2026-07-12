import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      // Icons are already precached via the workbox glob below; avoid
      // duplicate precache entries.
      includeManifestIcons: false,
      manifest: {
        name: "Stride",
        short_name: "Stride",
        description:
          "Stride is your adaptive AI wellness companion — nutrition and workout tracking with AI-driven guidance.",
        start_url: "/",
        display: "standalone",
        background_color: "#f8f8f8",
        theme_color: "#f8f8f8",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell only. Never let Workbox intercept or cache
        // Convex (data/API/websocket) or Clerk (auth) traffic — the app is
        // realtime and those requests must always hit the network directly.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // The 3D voxel textures are large, lazily loaded, and not part of
        // the app shell — keep them out of the precache manifest.
        globIgnores: ["**/voxels/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\.convex\.cloud$/.test(url.hostname) ||
              /\.convex\.site$/.test(url.hostname) ||
              /clerk\./.test(url.hostname) ||
              /\.clerk\.accounts\.dev$/.test(url.hostname),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Point the runtime import to a browser-safe shim.
      // The backend's _generated/api.js imports `convex/server` (Node-only),
      // which Rollup can't bundle. The shim re-exports anyApi from the
      // browser-safe ESM path. TypeScript types still come from api.d.ts.
      "@convex/_generated/api": path.resolve(__dirname, "./src/lib/convex-api-shim.ts"),
      "@convex": path.resolve(__dirname, "../../packages/backend/convex"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
});

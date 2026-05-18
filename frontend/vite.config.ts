import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugin to prevent bundling server-side convex code
const preventServerBundling = {
  name: 'prevent-server-bundling',
  resolveId(id) {
    // Intercept convex/server imports and mark as external
    if (id === 'convex/server' || id.includes('backend/convex/_generated')) {
      return { id, external: true }
    }
  },
}

export default defineConfig({
  plugins: [preventServerBundling, react(), tailwindcss()],
  build: {
    rollupOptions: {
      external: [
        'convex/server',
        /backend\/convex\/_generated/,
      ],
    },
  },
  server: {
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.preview.emergentagent.com',
      '.preview.emergentcf.cloud',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3210',
        changeOrigin: true,
      },
    },
  },
})

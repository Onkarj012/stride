import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      external: ['convex/server'],
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

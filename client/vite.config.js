import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Fail if 5173 is taken instead of quietly moving to another port, so an
    // old copy still running there can't be mistaken for this one
    port: 5173,
    strictPort: true,
    // shared/ (code used by both client and server) lives outside client/
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

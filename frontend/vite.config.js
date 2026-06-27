import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output directory (relative to frontend/). Must match the path
    // expected by backend/server.js: path.join(__dirname, '..', 'frontend', 'dist')
    outDir: 'dist',
  },
  server: {
    port: 3000,
    proxy: {
      // Django AI Backend (Port 8000)
      '/api/recommend-doc': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      // Node.js Backend (Port 5000) for all other api routes
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // For local dev: proxy API calls to vercel dev (runs on port 3000)
  // For production: API calls go directly to /api/* which Vercel handles
  const apiProxy = mode === 'development' 
    ? {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    : {};

  return {
    plugins: [react()],
    server: {
      proxy: apiProxy
    }
  }
})


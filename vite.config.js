import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // 15-minute timeout for long-running DuckDB historical analysis queries
        timeout: 900000,
        proxyTimeout: 900000,
      },
    },
  },
})


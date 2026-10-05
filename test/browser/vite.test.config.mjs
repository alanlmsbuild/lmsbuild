// The website for the browser tests: port 5199, with /api going to the test
// API on 3002 (never the dev servers on 5173 and 3001).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  plugins: [react()],
  server: { port: 5199, strictPort: true, proxy: { '/api': { target: 'http://localhost:3002', changeOrigin: true } } },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
  test: {
    // Bawaan node (ringan). Tes yang butuh DOM menandai dirinya dengan komentar
    // '// @vitest-environment jsdom' di baris pertama.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    port: 4174,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
  },
})

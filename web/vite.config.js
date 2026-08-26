import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
  },
})

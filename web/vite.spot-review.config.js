import path from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { spotReviewPlugin } from './scripts/spots/review-server.mjs'

const webRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [
    vue(),
    spotReviewPlugin({ dataRoot: path.join(webRoot, 'data/spots') }),
  ],
  build: {
    rollupOptions: { input: path.join(webRoot, 'review.html') },
  },
})

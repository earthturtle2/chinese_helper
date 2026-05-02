import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
  },
  optimizeDeps: {
    include: ['@huggingface/transformers', 'phonemizer', 'onnxruntime-web'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/audio': 'http://localhost:3001',
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,  // 允许外部访问
    strictPort: true,  // 端口被占用时报错而不是自动切换
    proxy: {
      '/plugins': {
        target: 'http://localhost:18789',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})

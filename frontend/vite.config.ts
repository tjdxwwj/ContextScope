import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:18789'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,  // 允许外部访问
    strictPort: true,  // 端口被占用时报错而不是自动切换
    proxy: {
      '/plugins': {
        target: proxyTarget,
        changeOrigin: true,
        bypass: (req) => {
          if (req.url && req.url.startsWith('/plugins/contextscope-dev/')) {
            if (req.url.includes('/api/')) {
              return undefined;
            }
            return req.url;
          }
        }
      }
    }
  },
  base: '/plugins/contextscope-dev/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})

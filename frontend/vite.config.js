import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      // Optimize for development stability
      fastRefresh: true
    })
  ],
  server: {
    port: 3000,
    hmr: {
      overlay: false,
      port: 24678,  // Use specific HMR port to prevent conflicts
      clientPort: 24678
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
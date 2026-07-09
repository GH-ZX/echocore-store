import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Default: GitHub project Pages at /echocore-store/
// Custom GoDaddy domain: set VITE_BASE_PATH=/ and VITE_SITE_DOMAIN=www.yourdomain.com in deploy secrets
const GH_PAGES_BASE = process.env.VITE_BASE_PATH
  || (process.env.VITE_SITE_DOMAIN ? '/' : '/echocore-store/');

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const useProductionBase = command === 'build' || (command === 'serve' && mode === 'production');

  return {
    base: useProductionBase ? GH_PAGES_BASE : '/',
    plugins: [react()],
    build: {
      sourcemap: false,
      target: 'es2020',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react'
              }
              if (id.includes('/react/')) {
                return 'vendor-react'
              }
              if (id.includes('framer-motion')) {
                return 'vendor-motion'
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase'
              }
              if (id.includes('embla-carousel')) {
                return 'vendor-carousel'
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons'
              }
              if (id.includes('ogl') || id.includes('/Aurora')) {
                return 'vendor-effects'
              }
            }
          },
        },
      },
    },
  }
})
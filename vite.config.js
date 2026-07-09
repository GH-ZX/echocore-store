import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Production: VITE_BASE_PATH=/ and VITE_SITE_DOMAIN=www.echocore412.com (GitHub Actions secrets)
export default defineConfig(({ command, mode }) => {
  const useProductionBase = command === 'build' || (command === 'serve' && mode === 'production');
  const productionBase = process.env.VITE_BASE_PATH
    || (process.env.VITE_SITE_DOMAIN ? '/' : '/echocore-store/');

  return {
    base: useProductionBase ? productionBase : '/',
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
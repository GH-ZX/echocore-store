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
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
      // CI has no .env — avoid crash when suites import modules that load supabase.js
      env: {
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key',
      },
    },
    build: {
      sourcemap: false,
      target: 'es2020',
      cssMinify: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-router-dom') || id.includes('react-router')) {
                return 'vendor-router'
              }
              if (id.includes('react-dom') || id.includes('/react/')) {
                return 'vendor-react'
              }
              if (id.includes('@base-ui') || id.includes('@radix-ui')) {
                return 'vendor-ui'
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
              // Keep invoice export libs out of the main vendor graph
              if (id.includes('jspdf') || id.includes('html-to-image') || id.includes('html2canvas')) {
                return 'vendor-invoice-export'
              }
            }
          },
        },
      },
    },
  }
})
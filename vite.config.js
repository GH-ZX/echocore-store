import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves at /echocore-store/ — use / locally so dev doesn't redirect
const GH_PAGES_BASE = '/echocore-store/'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const useGhPagesBase = command === 'build' || (command === 'serve' && mode === 'production')

  return {
    base: useGhPagesBase ? GH_PAGES_BASE : '/',
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
            }
          },
        },
      },
    },
  }
})
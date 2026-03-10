import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Include static assets to precache
      includeAssets: ['Favicon.png', 'vite.svg'],
      // Web App Manifest
      manifest: {
        name: 'MedxTerminal',
        short_name: 'Medx',
        description: 'Sistem Manajemen Data Pasien untuk Coass — Clinical Data Management',
        theme_color: '#136dec',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'id',
        orientation: 'portrait-primary',
        categories: ['medical', 'health', 'productivity'],
        icons: [
          {
            src: '/Favicon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/Favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Pasien Baru',
            short_name: 'Tambah Pasien',
            description: 'Registrasi pasien baru',
            url: '/add-patient',
            icons: [{ src: '/Favicon.png', sizes: '96x96' }],
          },
          {
            name: 'Jadwal',
            short_name: 'Jadwal',
            description: 'Lihat jadwal hari ini',
            url: '/schedule',
            icons: [{ src: '/Favicon.png', sizes: '96x96' }],
          },
        ],
      },
      // Workbox configuration
      workbox: {
        // Precache all built JS/CSS/HTML chunks
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Exclude large CSV from precache — handled via runtime CacheFirst below
        globIgnores: ['**/icd10.csv'],
        // Max precache entry size — increase for large JS bundles
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB

        runtimeCaching: [
          // ICD-10 CSV — heavy file, CacheFirst for 30 days
          {
            urlPattern: /\/data\/icd10\.csv$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'medx-icd10-data',
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase REST API — NetworkFirst: try server, fall back to cache (5s timeout)
          {
            urlPattern: /supabase\.co\/.*(rest|auth|functions).*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'medx-supabase-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts — CacheFirst, 1 year
          {
            urlPattern: /https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'medx-google-fonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // AI Worker (Cloudflare) — NetworkOnly (no caching for AI calls)
          {
            urlPattern: /workers\.dev\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      // Dev options: enable SW in development for easier testing
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})


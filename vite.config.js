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
      // Use injectManifest so our custom sw.js handles Background Sync
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
      // injectManifest config: Workbox injects precache list into src/sw.js
      injectManifest: {
        // Precache all built assets; CSV handled by runtime CacheFirst in sw.js
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['**/icd10.csv'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },
      // Dev options: enable SW in development for easier testing
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})


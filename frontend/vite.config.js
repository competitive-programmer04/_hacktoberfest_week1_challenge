import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,mjs}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
      manifest: {
        name: 'Touch Grass Birder',
        short_name: 'Birder',
        description: 'Offline bird call identifier powered by open source AI',
        theme_color: '#0b1f14',
        background_color: '#0b1f14',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
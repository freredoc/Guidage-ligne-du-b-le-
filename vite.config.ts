import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path : déploiement possible sur GitHub Pages (sous-dossier) ou racine.
// Surchargeable via la variable d'env BASE_PATH (ex: "/guidage-ligne-du-b-le-/").
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'TAN GPS Bus — Guidage ligne',
        short_name: 'TAN Bus',
        description:
          'GPS de conduite pour machinistes SEMITAN : suivi de ligne, arrêts et virages en temps réel.',
        lang: 'fr',
        theme_color: '#0f1012',
        background_color: '#0f1012',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Pré-cache du bundle de l'app (JS/CSS/HTML) + données + icônes.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // Tuiles CartoDB (fond Dark Matter) — mises en cache à la volée.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('basemaps.cartocdn.com'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'carto-tiles',
              expiration: {
                maxEntries: 4000,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 jours
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // CSS/JS Leaflet éventuels servis par CDN.
            urlPattern: ({ url }) => url.hostname.endsWith('cartocdn.com'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'carto-assets',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Alvos amplos: cobre WebView antiga de boxes Android 9 (Chrome ~55+).
      targets: ['defaults', 'Android >= 5', 'Chrome >= 55'],
      // Polyfills de APIs JS (Promise.allSettled, Array.flat, fetch via core-js…)
      // tanto no bundle legado quanto no moderno, para não quebrar em runtime.
      polyfills: true,
      modernPolyfills: true,
      // Garante polyfills essenciais mesmo que o detector de uso não os pegue.
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      // Registramos o SW manualmente em main.tsx (pra checar atualização
      // periodicamente), então não injetamos o registro automático aqui.
      injectRegister: false,
      // PWA hospedado (usado por um app de kiosk no box): o Service Worker dá
      // o offline (cacheia o app + mídias) e o autoUpdate publica versões novas
      // automaticamente quando o site é redeployado.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // Cache de mídias do Supabase Storage (CacheFirst, 7 dias)
          {
            urlPattern: /supabase\.co\/storage\/v1\/object\/public\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-media',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API Supabase: NetworkFirst com fallback ao cache
          {
            urlPattern: /supabase\.co\/rest\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Edge Functions (rss-proxy)
          {
            urlPattern: /supabase\.co\/functions\/v1\/rss-proxy/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rss-feeds',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 15 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Maranata Indoor Player',
        short_name: 'Indoor Player',
        description: 'Player de mídia indoor para Android boxes',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  build: {
    target: ['es2015', 'chrome60']
  },
  server: { port: 5174 },
})

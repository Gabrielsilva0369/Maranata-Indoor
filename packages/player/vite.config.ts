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
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,woff2}'],
        runtimeCaching: [
          // Cache de mídias da CDN da DigitalOcean Spaces (CacheFirst).
          {
            urlPattern: /digitaloceanspaces\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cdn',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API Supabase (playlist/config/telemetria): SEMPRE da rede, NUNCA do
          // cache do SW — senão o comando "Atualizar Tela" / "Reiniciar" podia
          // pegar a playlist velha em cache e não refletir a mudança. O offline
          // da playlist é garantido pelo cache em localStorage (usePlaylist).
          {
            urlPattern: /supabase\.co\/rest\/v1\//,
            handler: 'NetworkOnly',
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
          // Imagens externas das notícias (capa + logo da fonte). São aquecidas
          // no preload (mediaCache.warmCache) e servidas daqui — aparecem na hora
          // e seguem disponíveis offline. Vem DEPOIS da regra do Storage acima,
          // então as imagens do Supabase continuam no cache 'supabase-media'.
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'external-images',
              // 1 dia: alinhado ao TTL de 24h do cache do player.
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 },
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
  // Marca cada build com a data/hora — vai pra telemetria pra sabermos qual
  // versão cada tela está rodando (e confirmar se carregou o build novo).
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: { port: 5174 },
})

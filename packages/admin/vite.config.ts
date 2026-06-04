import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: {
      // COOP + COEP habilitam crossOriginIsolated (SharedArrayBuffer), exigido
      // pelo FFmpeg.wasm que transcodifica os vídeos no upload.
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 'credentialless' (em vez de 'require-corp') mantém o SharedArrayBuffer
      // E permite carregar imagens cross-origin SEM header CORP — necessário pras
      // miniaturas/logo do Supabase Storage, que senão ficam bloqueadas e não carregam.
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})

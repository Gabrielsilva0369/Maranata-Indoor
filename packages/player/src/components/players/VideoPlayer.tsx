import { useEffect, useRef } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'

interface Props {
  storagePath: string
  muted: boolean
  onEnd: () => void
}

export default function VideoPlayer({ storagePath, muted, onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgRef = useRef<HTMLVideoElement>(null)
  // Cache-first: se o vídeo já foi baixado localmente, toca do IndexedDB
  // (funciona OFFLINE / sem internet). Se ainda não, faz streaming da rede.
  const { url } = useCachedUrl(storagePath)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !url) return
    v.muted = muted
    try { v.currentTime = 0 } catch { /* ignore */ }
    v.play().catch(() => {
      // Autoplay com som bloqueado → tenta mudo; se ainda falhar, pula.
      v.muted = true
      v.play().catch(() => onEnd())
    })

    // Fundo borrado (sempre mudo, em loop) — preenche as laterais sem barras pretas.
    const bg = bgRef.current
    if (bg) {
      bg.muted = true
      try { bg.currentTime = 0 } catch { /* ignore */ }
      bg.play().catch(() => { /* ignore */ })
    }
  }, [url, muted, onEnd])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>

      {/* Fundo borrado — preenche o letterbox com o próprio vídeo borrado */}
      <video
        ref={bgRef}
        src={url || undefined}
        loop
        muted
        playsInline
        aria-hidden
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          filter: 'blur(24px) brightness(0.5)',
          transform: 'scale(1.08)',
        }}
      />

      {/* Vídeo principal — completo, sem corte */}
      <video
        ref={videoRef}
        src={url || undefined}
        onEnded={onEnd}
        onError={() => onEnd()}   // formato não suportado / falha → pula para o próximo
        playsInline
        preload="auto"
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  )
}

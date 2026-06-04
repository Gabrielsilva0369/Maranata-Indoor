import { useEffect, useRef } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'

interface Props {
  storagePath: string
  muted: boolean
  onEnd: () => void
}

export default function VideoPlayer({ storagePath, muted, onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
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
  }, [url, muted, onEnd])

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        src={url || undefined}
        onEnded={onEnd}
        onError={() => onEnd()}   // formato não suportado / falha → pula para o próximo
        playsInline
        preload="auto"
        style={{
          width: '100%', height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  )
}

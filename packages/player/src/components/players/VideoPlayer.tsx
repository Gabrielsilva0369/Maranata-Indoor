import { useEffect, useRef } from 'react'
import { getPublicUrl } from '../../lib/supabase'

interface Props {
  storagePath: string
  muted: boolean
  onEnd: () => void
}

export default function VideoPlayer({ storagePath, muted, onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgRef    = useRef<HTMLVideoElement>(null)
  const url = getPublicUrl(storagePath)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
    v.currentTime = 0
    v.play().catch(() => {
      v.muted = true
      v.play().catch(() => onEnd())
    })

    // Fundo borrado sincroniza com o principal
    const bg = bgRef.current
    if (bg) { bg.muted = true; bg.currentTime = 0; bg.play().catch(() => {}) }
  }, [storagePath, muted, onEnd])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>

      {/* Fundo borrado */}
      <video
        ref={bgRef}
        src={url}
        loop
        muted
        playsInline
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          filter: 'blur(24px) brightness(0.4)',
          transform: 'scale(1.08)',
        }}
      />

      {/* Vídeo principal — preenche toda a área (sem barras), corte mínimo */}
      <video
        ref={videoRef}
        src={url}
        onEnded={onEnd}
        onError={onEnd}
        playsInline
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'

interface Props {
  storagePath: string
  duration: number
  onEnd: () => void
}

export default function ImagePlayer({ storagePath, duration, onEnd }: Props) {
  const [progress, setProgress] = useState(0)
  const { url } = useCachedUrl(storagePath)

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    const total = duration * 1000

    const tick = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.min(elapsed / total, 1)
      setProgress(pct)
      if (pct >= 1) {
        clearInterval(tick)
        onEnd()
      }
    }, 50)

    return () => clearInterval(tick)
  }, [storagePath, duration, onEnd])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>

      {/* Fundo borrado — preenche sem barras pretas */}
      <img
        src={url}
        alt=""
        aria-hidden
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          filter: 'blur(24px) brightness(0.5)',
          transform: 'scale(1.08)',
        }}
        draggable={false}
      />

      {/* Imagem principal — completa, sem corte */}
      <img
        src={url}
        alt=""
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', height: '100%',
          objectFit: 'contain',
        }}
        draggable={false}
      />

      {/* Barra de progresso */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 3, background: 'rgba(255,255,255,0.15)', zIndex: 2 }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: '#60a5fa', transition: 'width 50ms linear' }} />
      </div>
    </div>
  )
}

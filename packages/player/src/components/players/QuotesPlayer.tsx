import { useEffect, useState } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'

interface QuotesConfig {
  quote: string
  author: string
  bg_type: 'color' | 'image'
  bg_image_path: string | null
  bg_color: string
  font_color: string
  font_size: number
}

interface Props {
  config: QuotesConfig
  duration: number
  showProgress?: boolean
  onEnd: () => void
}

// Frase motivacional: mostra a frase (e a citação/autor) por `duration` segundos
// sobre um fundo fixo, depois avança para a próxima mídia.
export default function QuotesPlayer({ config, duration, showProgress = true, onEnd }: Props) {
  const [progress, setProgress] = useState(0)
  const { url: bgUrl } = useCachedUrl(config.bg_type === 'image' ? config.bg_image_path : null)

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    const total = Math.max(1, duration) * 1000
    const tick = setInterval(() => {
      const pct = Math.min((Date.now() - start) / total, 1)
      setProgress(pct)
      if (pct >= 1) { clearInterval(tick); onEnd() }
    }, 100)
    return () => clearInterval(tick)
  }, [duration, onEnd])

  const bg = config.bg_type === 'image' && bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: config.bg_color }

  // font_size é px na base de 1080px de altura → escala pela altura real (vh).
  const fontSize = `${(config.font_size / 1080) * 100}vh`
  const authorSize = `${(config.font_size / 1080) * 100 * 0.45}vh`

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      ...bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '2.5vh',
    }}>
      {/* Escurece o fundo (imagem) p/ a frase ficar legível */}
      {config.bg_type === 'image' && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)' }} />
      )}

      <p style={{
        position: 'relative', zIndex: 1,
        color: config.font_color,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 700,
        fontSize,
        lineHeight: 1.3,
        textAlign: 'center',
        margin: 0,
        padding: '0 8%',
        textShadow: '0 2px 16px rgba(0,0,0,0.5)',
        maxWidth: '92%',
      }}>
        {config.quote}
      </p>

      {config.author?.trim() && (
        <p style={{
          position: 'relative', zIndex: 1,
          color: config.font_color, opacity: 0.85,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontStyle: 'italic',
          fontSize: authorSize,
          textAlign: 'center',
          margin: 0,
          textShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}>
          — {config.author.trim()}
        </p>
      )}

      {showProgress && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 3, background: 'rgba(255,255,255,0.15)', zIndex: 2 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: config.font_color, opacity: 0.7, transition: 'width 100ms linear' }} />
        </div>
      )}
    </div>
  )
}

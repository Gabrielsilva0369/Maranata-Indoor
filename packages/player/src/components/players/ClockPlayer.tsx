import { useEffect, useState } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'

interface ClockConfig {
  timezone: string
  font: string
  font_color: string
  bg_type: 'color' | 'image'
  bg_color: string
  bg_image_path: string | null
  show_seconds: boolean
}

interface Props {
  config: ClockConfig
  duration: number
  onEnd: () => void
}

const GOOGLE_FONTS = ['Roboto','Open Sans','Montserrat','Lato','Raleway','Oswald','Poppins','Playfair Display','Bebas Neue','Ubuntu']

export default function ClockPlayer({ config, duration, onEnd }: Props) {
  const [now, setNow] = useState(new Date())
  const [progress, setProgress] = useState(0)

  // Atualiza o relógio a cada segundo
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Countdown do item
  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    const total = duration * 1000
    const tick = setInterval(() => {
      const pct = Math.min((Date.now() - start) / total, 1)
      setProgress(pct)
      if (pct >= 1) { clearInterval(tick); onEnd() }
    }, 100)
    return () => clearInterval(tick)
  }, [duration, onEnd])

  // Carrega Google Font se necessário
  useEffect(() => {
    if (!GOOGLE_FONTS.includes(config.font)) return
    const id = `gf-${config.font.replace(/ /g, '-')}`
    if (document.getElementById(id)) return
    const link = Object.assign(document.createElement('link'), {
      id, rel: 'stylesheet',
      href: `https://fonts.googleapis.com/css2?family=${config.font.replace(/ /g, '+')}:wght@400;700&display=swap`,
    })
    document.head.appendChild(link)
  }, [config.font])

  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    hour: '2-digit', minute: '2-digit',
    ...(config.show_seconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(now)

  const weekday = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone, weekday: 'long',
  }).format(now)

  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(now)

  const { url: bgUrl } = useCachedUrl(config.bg_type === 'image' ? config.bg_image_path : null)

  const bgStyle: React.CSSProperties =
    config.bg_type === 'image' && bgUrl
      ? {
          backgroundImage: `url(${bgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : { backgroundColor: config.bg_color }

  return (
    <div style={{
      ...bgStyle,
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: `'${config.font}', system-ui, sans-serif`,
      color: config.font_color,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Overlay suave se tiver imagem de fundo */}
      {config.bg_type === 'image' && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          background: 'rgba(0,0,0,0.35)',
        }} />
      )}

      {/* Conteúdo */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '16px',
        textAlign: 'center', padding: '0 40px',
      }}>
        {/* Hora */}
        <div style={{
          fontSize: 'clamp(64px, 14vw, 180px)',
          fontWeight: 700,
          letterSpacing: '0.05em',
          lineHeight: 1,
          textShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {time}
        </div>

        {/* Separador */}
        <div style={{
          width: 60, height: 2,
          background: config.font_color,
          opacity: 0.4,
          borderRadius: 1,
        }} />

        {/* Dia da semana */}
        <div style={{
          fontSize: 'clamp(18px, 3vw, 42px)',
          fontWeight: 400,
          textTransform: 'capitalize',
          opacity: 0.9,
          letterSpacing: '0.08em',
          textShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}>
          {weekday}
        </div>

        {/* Data */}
        <div style={{
          fontSize: 'clamp(14px, 2.2vw, 32px)',
          fontWeight: 400,
          opacity: 0.75,
          textShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {date}
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 3, background: 'rgba(255,255,255,0.15)',
      }}>
        <div style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: config.font_color,
          opacity: 0.6,
          transition: 'width 100ms linear',
        }} />
      </div>
    </div>
  )
}

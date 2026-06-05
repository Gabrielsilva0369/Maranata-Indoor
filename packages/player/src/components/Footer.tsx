import { useState, useEffect, useRef } from 'react'
import { supabase, getPublicUrl } from '../lib/supabase'
import { getCachedArticles } from '../lib/newsCache'

interface FooterConfig {
  enabled: boolean
  type: 'text' | 'rss'
  text: string | null
  rss_feed_id: string | null
  logo_path: string | null
  timezone: string
  bg_color: string
  text_color: string
  font_size: number
  height: number
  scroll_speed: number
}

// ── Ticker: entra pela direita (relógio) e sai pela esquerda (logo) ───────────
function Ticker({ text, speed, color, fontSize }: {
  text: string; speed: number; color: string; fontSize: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef      = useRef<HTMLDivElement>(null)
  const frameRef     = useRef<number>(0)
  const posRef       = useRef<number | null>(null)
  const lastRef      = useRef<number>(0)

  // Reinicia quando o texto muda
  useEffect(() => {
    posRef.current = null
    lastRef.current = 0
  }, [text])

  useEffect(() => {
    const container = containerRef.current
    const el        = textRef.current
    if (!container || !el) return

    const animate = (ts: number) => {
      // Na primeira frame, posiciona fora à direita
      if (posRef.current === null) {
        posRef.current = container.offsetWidth
      }

      if (lastRef.current) {
        posRef.current -= speed * (ts - lastRef.current) / 1000
        if (posRef.current < -el.offsetWidth) {
          posRef.current = container.offsetWidth
        }
      }

      // Mantém translateY(-50%) para centralização vertical + translateX para animação
      el.style.transform = `translateX(${posRef.current}px) translateY(-50%)`

      lastRef.current = ts
      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [text, speed])

  return (
    <div ref={containerRef} style={{ overflow: 'hidden', flex: 1, height: '100%', position: 'relative' }}>
      <div ref={textRef} style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        whiteSpace: 'nowrap', willChange: 'transform',
        color, fontSize, lineHeight: 1,
      }}>
        {text}
      </div>
    </div>
  )
}

// ── Relógio direita ───────────────────────────────────────────────────────────
function FooterClock({ timezone, color, fontSize, height }: {
  timezone: string; color: string; fontSize: number; height: number
}) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])

  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)

  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone, weekday: 'short', day: '2-digit', month: 'short',
  }).format(now)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', paddingLeft: 16, paddingRight: 16, flexShrink: 0,
      borderLeft: `1px solid ${color}30`,
      minWidth: height * 2.2,
      color,
    }}>
      <div style={{ fontSize, fontWeight: 700, lineHeight: 1, letterSpacing: 1 }}>{time}</div>
      <div style={{ fontSize: fontSize * 0.62, opacity: 0.75, marginTop: 2, textTransform: 'capitalize', letterSpacing: 0.5 }}>{date}</div>
    </div>
  )
}

// ── Footer principal ──────────────────────────────────────────────────────────
export default function Footer({ config, scale = 1 }: { config: FooterConfig; scale?: number }) {
  const [tickerText, setTickerText] = useState('')

  // Dimensões escaladas à tela real
  const fontSize = config.font_size * scale
  const height = config.height * scale

  const fetchArticles = () => {
    if (!config.rss_feed_id) return

    // Usa os títulos já pré-carregados (preload) — funciona offline.
    const cached = getCachedArticles(config.rss_feed_id)
    if (cached.length > 0) {
      setTickerText(cached.map(a => a.title).filter(Boolean).join('     ·     '))
      return
    }

    // Fallback: busca direto da rede.
    supabase
      .from('rss_articles')
      .select('title')
      .eq('feed_id', config.rss_feed_id)
      .eq('active', true)
      .order('pub_date', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setTickerText(data?.map(a => a.title).filter(Boolean).join('     ·     ') ?? '')
      })
  }

  useEffect(() => {
    if (config.type === 'text') {
      setTickerText(config.text ?? '')
    } else {
      fetchArticles()
    }
  }, [config])

  useEffect(() => {
    if (config.type !== 'rss') return
    const id = setInterval(fetchArticles, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [config])

  const logoUrl = config.logo_path ? getPublicUrl(config.logo_path) : null

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: config.bg_color,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      boxShadow: '0 -2px 16px rgba(0,0,0,0.35)',
    }}>
      {/* Logo esquerda */}
      {logoUrl && (
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center',
          paddingLeft: 12 * scale, paddingRight: 12 * scale, flexShrink: 0,
          borderRight: `1px solid ${config.text_color}25`,
        }}>
          <img
            src={logoUrl}
            alt="logo"
            style={{ height: '72%', width: 'auto', maxWidth: height * 3, objectFit: 'contain' }}
            onError={e => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      {/* Ticker central */}
      {tickerText ? (
        <Ticker
          text={tickerText}
          speed={config.scroll_speed * scale}
          color={config.text_color}
          fontSize={fontSize}
        />
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Relógio direita */}
      <FooterClock
        timezone={config.timezone ?? 'America/Sao_Paulo'}
        color={config.text_color}
        fontSize={fontSize}
        height={height}
      />
    </div>
  )
}

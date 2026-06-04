import { useEffect, useState, useRef } from 'react'

interface RssItem {
  title: string
  description: string
  link: string
  pubDate: string
}

interface Props {
  rssUrl: string
  duration: number
  onEnd: () => void
}

const RSS_PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rss-proxy`

export default function RssPlayer({ rssUrl, duration, onEnd }: Props) {
  const [items, setItems] = useState<RssItem[]>([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const startedAt = useRef(Date.now())

  useEffect(() => {
    setLoading(true)
    setCurrent(0)
    startedAt.current = Date.now()

    fetch(`${RSS_PROXY}?url=${encodeURIComponent(rssUrl)}`, {
      headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => { setItems([]); setLoading(false) })
  }, [rssUrl])

  // Cycle through items; call onEnd when total duration expires
  useEffect(() => {
    if (items.length === 0) return

    const perItem = Math.max(5, Math.floor((duration * 1000) / items.length))

    const advance = () => {
      const elapsed = Date.now() - startedAt.current
      if (elapsed >= duration * 1000) {
        onEnd()
        return
      }
      setCurrent(c => (c + 1) % items.length)
      timerRef.current = setTimeout(advance, perItem)
    }

    timerRef.current = setTimeout(advance, perItem)
    return () => clearTimeout(timerRef.current)
  }, [items, duration, onEnd])

  // Fallback: call onEnd when duration expires even if no items
  useEffect(() => {
    const id = setTimeout(onEnd, duration * 1000)
    return () => clearTimeout(id)
  }, [duration, onEnd])

  if (loading) {
    return (
      <div style={fullscreen}>
        <p style={{ color: '#9ca3af', fontSize: 18 }}>Carregando notícias...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={fullscreen}>
        <p style={{ color: '#6b7280', fontSize: 18 }}>Sem itens no feed RSS.</p>
      </div>
    )
  }

  const item = items[current]

  return (
    <div
      style={{
        ...fullscreen,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'linear-gradient(to bottom, #111827, #0f172a)',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: '#1d4ed8', padding: '10px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2 }}>
          Notícias
        </span>
        <span style={{ color: '#bfdbfe', fontSize: 13 }}>
          {current + 1} / {items.length}
        </span>
      </div>

      {/* News card */}
      <div style={{ padding: '80px 48px 48px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h2
          style={{
            color: '#f9fafb', fontSize: 'clamp(24px, 4vw, 52px)',
            fontWeight: 700, lineHeight: 1.2, marginBottom: 20,
          }}
        >
          {item.title}
        </h2>
        {item.description && (
          <p
            style={{
              color: '#9ca3af', fontSize: 'clamp(14px, 2vw, 22px)',
              lineHeight: 1.6, maxWidth: '80%',
              display: '-webkit-box', WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
            dangerouslySetInnerHTML={{ __html: item.description }}
          />
        )}
        {item.pubDate && (
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 20 }}>
            {new Date(item.pubDate).toLocaleString('pt-BR')}
          </p>
        )}
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingBottom: 20 }}>
        {items.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === current ? 24 : 8, height: 8, borderRadius: 4,
              background: i === current ? '#60a5fa' : '#374151',
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>
    </div>
  )
}

const fullscreen: React.CSSProperties = {
  width: '100vw', height: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#111827', color: '#fff', fontFamily: 'system-ui, sans-serif',
  position: 'relative',
}

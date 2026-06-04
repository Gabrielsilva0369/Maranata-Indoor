import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

interface Article {
  id: string
  title: string
  description: string | null
  image_url: string | null
  source_logo: string | null
  source_name: string | null
  pub_date: string | null
}

interface Props {
  feedId: string
  duration: number       // segundos por artigo
  articleCount: number   // quantas notícias exibir
  onEnd: () => void
}

export default function RssNewsPlayer({ feedId, duration, articleCount, onEnd }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setLoading(true)
    setIndex(0)
    supabase
      .from('rss_articles')
      .select('id, title, description, image_url, source_logo, source_name, pub_date')
      .eq('feed_id', feedId)
      .eq('active', true)
      .order('pub_date', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        // Embaralha (Fisher-Yates) e pega articleCount aleatórios
        const pool = [...(data ?? [])]
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        setArticles(pool.slice(0, articleCount))
        setLoading(false)
      })
  }, [feedId, articleCount])

  const advance = useCallback(() => {
    setIndex(prev => {
      const next = prev + 1
      if (next >= articles.length) {
        onEnd()
        return prev
      }
      return next
    })
  }, [articles.length, onEnd])

  // Countdown e progresso por artigo
  useEffect(() => {
    if (articles.length === 0) return
    setProgress(0)
    const start = Date.now()
    const total = duration * 1000

    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const pct = Math.min((Date.now() - start) / total, 1)
      setProgress(pct)
      if (pct >= 1) {
        clearInterval(timerRef.current)
        advance()
      }
    }, 50)

    return () => clearInterval(timerRef.current)
  }, [index, articles.length, duration, advance])

  // Timeout de segurança se não houver artigos
  useEffect(() => {
    if (!loading && articles.length === 0) {
      const t = setTimeout(onEnd, 3000)
      return () => clearTimeout(t)
    }
  }, [loading, articles.length, onEnd])

  if (loading) return <LoadingScreen />

  if (articles.length === 0) {
    return (
      <div style={FULL}>
        <p style={{ color: '#6b7280', fontSize: 18, fontFamily: 'system-ui' }}>
          Sem notícias disponíveis.
        </p>
      </div>
    )
  }

  const article = articles[index]

  return (
    <div style={{ ...FULL, overflow: 'hidden', position: 'relative', fontFamily: 'system-ui, sans-serif' }}>

      {/* Imagem de fundo */}
      {article.image_url ? (
        <img
          key={article.image_url}
          src={article.image_url}
          alt=""
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'cover',
          }}
          onError={e => (e.currentTarget.style.display = 'none')}
        />
      ) : (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        }} />
      )}

      {/* Overlay escuro sobre a imagem */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.8) 100%)',
      }} />

      {/* Header: label + logo da fonte */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 4, height: 24, background: '#ef4444', borderRadius: 2,
          }} />
          <span style={{
            color: '#fff', fontWeight: 700, fontSize: 13,
            textTransform: 'uppercase', letterSpacing: 3,
          }}>
            Últimas Notícias
          </span>
        </div>

        {/* Logo da fonte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {article.source_name && (
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500 }}>
              {article.source_name}
            </span>
          )}
          {article.source_logo && (
            <img
              src={article.source_logo}
              alt={article.source_name ?? ''}
              style={{
                height: 36, width: 'auto', maxWidth: 120,
                objectFit: 'contain', borderRadius: 6,
                background: 'rgba(255,255,255,0.15)',
                padding: '4px 8px',
              }}
              onError={e => (e.currentTarget.style.display = 'none')}
            />
          )}
        </div>
      </div>

      {/* Rodapé: título + data */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '48px 40px 32px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)',
      }}>
        <h2 style={{
          color: '#fff',
          fontSize: 'clamp(22px, 3.5vw, 52px)',
          fontWeight: 700,
          lineHeight: 1.25,
          margin: 0,
          marginBottom: 12,
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {article.title}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {article.pub_date && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
              {new Date(article.pub_date).toLocaleString('pt-BR', {
                day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            {index + 1} / {articles.length}
          </span>
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
          background: '#ef4444',
          transition: 'width 50ms linear',
        }} />
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ ...FULL, flexDirection: 'column', gap: 12 }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid #374151', borderTopColor: '#ef4444',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#6b7280', fontSize: 14, fontFamily: 'system-ui' }}>Carregando notícias...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const FULL: React.CSSProperties = {
  width: '100%', height: '100%',
  background: '#0f172a', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
}

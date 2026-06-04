import { useState, useCallback, useEffect, useMemo } from 'react'
import type { PlaylistItem, ScreenConfig, FooterConfig } from '../hooks/usePlaylist'
import ImagePlayer from './players/ImagePlayer'
import VideoPlayer from './players/VideoPlayer'
import HtmlPlayer from './players/HtmlPlayer'
import RssNewsPlayer from './players/RssNewsPlayer'
import ClockPlayer from './players/ClockPlayer'
import WeatherPlayer from './players/WeatherPlayer'
import Footer from './Footer'
import { getPublicUrl } from '../lib/supabase'

interface Props {
  items: PlaylistItem[]
  screen: ScreenConfig
}

export default function PlaylistPlayer({ items, screen }: Props) {
  const [index, setIndex] = useState(0)

  const advance = useCallback(() => {
    setIndex(i => (i + 1) % items.length)
  }, [items.length])

  useEffect(() => { setIndex(0) }, [items])

  // Pré-cache de Storage URLs
  useEffect(() => {
    if (!('caches' in window)) return
    const urls = items.filter(i => i.media?.storage_path).map(i => getPublicUrl(i.media!.storage_path!))
    caches.open('supabase-media').then(cache => {
      urls.forEach(url => cache.add(url).catch(() => {}))
    })
  }, [items])

  if (items.length === 0) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#111827',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'system-ui' }}>
        <p>Playlist vazia. Adicione mídias no painel.</p>
      </div>
    )
  }

  const current = items[index % items.length]

  // ── Rodapé efetivo para este item ─────────────────────────────────────────
  const effectiveFooter = useMemo((): FooterConfig | null => {
    const base = screen.footer_config
    if (!base?.enabled) return null

    const ov = current.footer_override
    if (ov === null || ov === undefined) return base        // usa config da tela
    if (ov.enabled === false) return null                   // desativado para este item
    // Personalizado: sobrescreve o texto mantendo aparência da tela
    if (ov.text !== undefined) return { ...base, type: 'text', text: ov.text ?? base.text }
    return base
  }, [screen.footer_config, current.footer_override])

  const footerH = effectiveFooter ? effectiveFooter.height : 0

  // ── Renderiza o player atual ──────────────────────────────────────────────
  const { duration_override, media, rss_feed, rss_feed_id, audio_enabled } = current
  const duration = duration_override ?? media?.duration ?? 10
  const muted = audio_enabled === null ? !screen.sound_enabled : !audio_enabled

  const renderPlayer = () => {
    if (rss_feed_id && rss_feed) {
      return <RssNewsPlayer key={current.id} feedId={rss_feed_id} duration={duration}
        articleCount={current.rss_article_count ?? 5} onEnd={advance} />
    }
    if (media) {
      if (media.type === 'image' && media.storage_path)
        return <ImagePlayer key={current.id} storagePath={media.storage_path} duration={duration} onEnd={advance} />
      if (media.type === 'video' && media.storage_path)
        return <VideoPlayer key={current.id} storagePath={media.storage_path} muted={muted} onEnd={advance} />
      if (media.type === 'html')
        return <HtmlPlayer key={current.id} url={media.url} htmlContent={media.html_content} duration={duration} onEnd={advance} />
      if (media.type === 'clock' && media.clock_config)
        return <ClockPlayer key={current.id} config={media.clock_config} duration={duration} onEnd={advance} />
      if (media.type === 'weather' && media.weather_config)
        return <WeatherPlayer key={current.id} config={media.weather_config} duration={duration} onEnd={advance} />
    }
    // Item inválido — pula
    advance()
    return null
  }

  return (
    <>
      {/* Área da mídia — ocupa o espaço acima do rodapé (sem sobreposição) */}
      <div style={{
        width: '100vw',
        height: footerH > 0 ? `calc(100vh - ${footerH}px)` : '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {renderPlayer()}
      </div>

      {/* Rodapé overlay (position: fixed, sobrepõe a base) */}
      {effectiveFooter && <Footer config={effectiveFooter} />}
    </>
  )
}

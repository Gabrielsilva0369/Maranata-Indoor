import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { PlaylistItem, ScreenConfig, FooterConfig } from '../hooks/usePlaylist'
import ImagePlayer from './players/ImagePlayer'
import VideoPlayer from './players/VideoPlayer'
import HtmlPlayer from './players/HtmlPlayer'
import RssNewsPlayer from './players/RssNewsPlayer'
import ClockPlayer from './players/ClockPlayer'
import WeatherPlayer from './players/WeatherPlayer'
import YouTubePlayer from './players/YouTubePlayer'
import StreamPlayer from './players/StreamPlayer'
import Footer from './Footer'

interface Props {
  items: PlaylistItem[]
  screen: ScreenConfig
  onMediaChange?: (name: string) => void
}

// Verifica se um item está no horário/período agendado para exibição
function isItemActive(schedule: PlaylistItem['schedule'], now: Date): boolean {
  if (!schedule || !schedule.enabled) return true

  // Período por data (YYYY-MM-DD, comparação local)
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (schedule.date_start && today < schedule.date_start) return false
  if (schedule.date_end && today > schedule.date_end) return false

  // Dia da semana
  if (schedule.days && schedule.days.length > 0 && !schedule.days.includes(now.getDay())) {
    return false
  }

  // Janela de horário (HH:MM)
  const cur = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = schedule.start.split(':').map(Number)
  const [eh, em] = schedule.end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em

  if (startMin <= endMin) {
    return cur >= startMin && cur < endMin
  }
  // Cruza a meia-noite (ex: 22:00 → 06:00)
  return cur >= startMin || cur < endMin
}

export default function PlaylistPlayer({ items, screen, onMediaChange }: Props) {
  const [index, setIndex] = useState(0)

  // Relógio que reavalia os agendamentos a cada 30s
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Itens ativos no horário atual
  const activeItems = items.filter(i => isItemActive(i.schedule, now))

  // Escala proporcional à altura REAL do container (base 1080) — funciona
  // tanto em paisagem quanto em retrato (medindo o próprio elemento, não a janela).
  const rootRef = useRef<HTMLDivElement>(null)
  const [vScale, setVScale] = useState(1)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const update = () => setVScale(el.clientHeight / 1080)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const advance = useCallback(() => {
    setIndex(i => (i + 1) % Math.max(activeItems.length, 1))
  }, [activeItems.length])

  // Reinicia ao mudar a lista ou o conjunto ativo
  useEffect(() => { setIndex(0) }, [items, activeItems.length])

  // Reporta a mídia atual para a telemetria
  useEffect(() => {
    if (!onMediaChange) return
    const it = activeItems[index % Math.max(activeItems.length, 1)]
    if (!it) { onMediaChange('—'); return }
    const TYPE_LABEL: Record<string, string> = {
      image: 'Imagem', video: 'Vídeo', html: 'HTML', clock: 'Relógio', weather: 'Clima',
    }
    let name = ''
    if (it.rss_feed) {
      name = it.rss_feed.name || 'Notícias RSS'
    } else if (it.media) {
      name = it.media.name || TYPE_LABEL[it.media.type] || 'Mídia'
    }
    if (name) onMediaChange(name)
  }, [activeItems, index, onMediaChange])

  if (items.length === 0) {
    return (
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: '#111827',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'system-ui' }}>
        <p>Playlist vazia. Adicione mídias no painel.</p>
      </div>
    )
  }

  // Nenhum item no horário agendado agora → tela ociosa
  if (activeItems.length === 0) {
    return (
      <div ref={rootRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: '#000' }} />
    )
  }

  const current = activeItems[index % activeItems.length]

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
        return <VideoPlayer key={current.id} storagePath={media.storage_path} muted={muted} quality={screen.video_quality} onEnd={advance} />
      if (media.type === 'html')
        return <HtmlPlayer key={current.id} url={media.url} htmlContent={media.html_content} duration={duration} onEnd={advance} />
      if (media.type === 'clock' && media.clock_config)
        return <ClockPlayer key={current.id} config={media.clock_config} duration={duration} onEnd={advance} />
      if (media.type === 'weather' && media.weather_config)
        return <WeatherPlayer key={current.id} config={media.weather_config} duration={duration} onEnd={advance} />
      if (media.type === 'youtube' && media.url)
        return <YouTubePlayer key={current.id} url={media.url} duration={duration_override ?? media?.duration ?? 0} muted={muted} onEnd={advance} />
      if (media.type === 'stream' && media.url)
        return <StreamPlayer key={current.id} url={media.url} duration={duration_override ?? media?.duration ?? 0} muted={muted} onEnd={advance} />
    }
    // Item inválido — pula
    advance()
    return null
  }

  // Altura do rodapé escalada à tela real
  const footerH = effectiveFooter ? effectiveFooter.height * vScale : 0

  return (
    <div ref={rootRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: '#000', overflow: 'hidden' }}>
      {/* Área da mídia — ocupa a tela toda menos o rodapé (sem sobreposição) */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100%',
        height: footerH > 0 ? `calc(100% - ${footerH}px)` : '100%',
        overflow: 'hidden',
      }}>
        {renderPlayer()}
      </div>

      {/* Rodapé — largura total no rodapé da tela real */}
      {effectiveFooter && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: footerH }}>
          <Footer config={effectiveFooter} scale={vScale} />
        </div>
      )}
    </div>
  )
}

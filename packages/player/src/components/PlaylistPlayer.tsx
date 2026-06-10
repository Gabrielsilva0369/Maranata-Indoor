import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaylistItem, ScreenConfig, FooterConfig } from '../hooks/usePlaylist'
import ImagePlayer from './players/ImagePlayer'
import VideoPlayer from './players/VideoPlayer'
import HtmlPlayer from './players/HtmlPlayer'
import RssNewsPlayer from './players/RssNewsPlayer'
import ClockPlayer from './players/ClockPlayer'
import WeatherPlayer from './players/WeatherPlayer'
import YouTubePlayer from './players/YouTubePlayer'
import StreamPlayer from './players/StreamPlayer'
import QuotesPlayer from './players/QuotesPlayer'
import Footer from './Footer'

interface Props {
  items: PlaylistItem[]
  screen: ScreenConfig
  onMediaChange?: (name: string, type?: string, durationSec?: number, itemId?: string) => void
  /** Preview no admin: força tudo mudo (não sai som no painel). */
  forceMuted?: boolean
  /** Preview no admin: SEGUE o item que a tela está exibindo (não roda a playlist do zero). */
  preview?: boolean
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

export default function PlaylistPlayer({ items, screen, onMediaChange, forceMuted, preview }: Props) {
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
    // No preview, enquanto a tela estiver reportando o item no ar (followId), quem
    // manda é a telemetria (modo "seguir") — não avançamos sozinhos. Se o box ainda
    // não reportou (player antigo/offline), o preview cicla normalmente como fallback.
    if (preview && followIdRef.current) return
    setIndex(i => (i + 1) % Math.max(activeItems.length, 1))
  }, [activeItems.length, preview])

  // Reinicia ao mudar a lista ou o conjunto ativo (no preview, o item é seguido).
  useEffect(() => { if (!preview) setIndex(0) }, [items, activeItems.length, preview])

  // ── Modo SEGUIR (preview no admin) ─────────────────────────────────────────
  // Lê na telemetria da tela qual item ela está exibindo AGORA e posiciona o
  // preview no mesmo item — assim o painel mostra o que está no ar, não o começo.
  const [followId, setFollowId] = useState<string | null>(null)
  const followIdRef = useRef<string | null>(null)
  followIdRef.current = followId
  useEffect(() => {
    if (!preview || !screen.id) return
    let active = true
    const poll = async () => {
      const { data } = await supabase.from('screens').select('telemetry').eq('id', screen.id).maybeSingle()
      if (!active) return
      const cid = (data?.telemetry as { current_item_id?: string } | null)?.current_item_id
      if (cid) setFollowId(cid)
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => { active = false; clearInterval(t) }
  }, [preview, screen.id])

  useEffect(() => {
    if (!preview || !followId) return
    const i = activeItems.findIndex(it => it.id === followId)
    if (i >= 0) setIndex(prev => (prev === i ? prev : i))
  }, [preview, followId, activeItems])

  // Reporta a mídia atual para a telemetria
  useEffect(() => {
    if (!onMediaChange) return
    const it = activeItems[index % Math.max(activeItems.length, 1)]
    if (!it) { onMediaChange('—'); return }
    const TYPE_LABEL: Record<string, string> = {
      image: 'Imagem', video: 'Vídeo', html: 'HTML', clock: 'Relógio', weather: 'Clima',
    }
    let name = ''
    let type = ''
    let durationSec = 0
    if (it.rss_feed) {
      name = it.rss_feed.name || 'Notícias RSS'
      type = 'rss'
      // Bloco de notícias = (segundos por artigo) × (qtd de artigos)
      durationSec = (it.duration_override ?? 10) * (it.rss_article_count ?? 5)
    } else if (it.media) {
      name = it.media.name || TYPE_LABEL[it.media.type] || 'Mídia'
      type = it.media.type
      durationSec = it.duration_override ?? it.media.duration ?? 10
    }
    if (name) onMediaChange(name, type, durationSec, it.id)
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
  const muted = forceMuted ? true : (audio_enabled === null ? !screen.sound_enabled : !audio_enabled)

  // Barra de progresso (loading) por tela — pode ser desativada no admin.
  const showProgress = screen.show_progress !== false

  const renderPlayer = () => {
    if (rss_feed_id && rss_feed) {
      return <RssNewsPlayer key={current.id} feedId={rss_feed_id} duration={duration}
        articleCount={current.rss_article_count ?? 5} articleLinks={current.rss_article_links}
        quality={screen.video_quality} showProgress={showProgress} onEnd={advance} />
    }
    if (media) {
      if (media.type === 'image' && media.storage_path)
        return <ImagePlayer key={current.id} storagePath={media.storage_path} quality={screen.video_quality} duration={duration} showProgress={showProgress} onEnd={advance} />
      if (media.type === 'video' && media.storage_path)
        return <VideoPlayer key={current.id} storagePath={media.storage_path} muted={muted} quality={screen.video_quality} onEnd={advance} />
      if (media.type === 'html')
        return <HtmlPlayer key={current.id} url={media.url} htmlContent={media.html_content} duration={duration} showProgress={showProgress} onEnd={advance} />
      if (media.type === 'clock' && media.clock_config)
        return <ClockPlayer key={current.id} config={media.clock_config} quality={screen.video_quality} duration={duration} showProgress={showProgress} onEnd={advance} />
      if (media.type === 'weather' && media.weather_config)
        return <WeatherPlayer key={current.id} config={media.weather_config} duration={duration} showProgress={showProgress} onEnd={advance} />
      if (media.type === 'quotes' && media.quotes_config)
        return <QuotesPlayer key={current.id} config={media.quotes_config} quality={screen.video_quality} duration={duration} showProgress={showProgress} onEnd={advance} />
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
        <div style={{
          position: 'absolute', bottom: 0,
          left: `${screen.footer_margin_left ?? 0}px`,
          right: `${screen.footer_margin_right ?? 0}px`,
          height: footerH,
        }}>
          <Footer config={effectiveFooter} scale={vScale} />
        </div>
      )}
    </div>
  )
}

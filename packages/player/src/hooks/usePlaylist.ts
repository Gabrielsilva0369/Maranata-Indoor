import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { syncMediaCache, isCacheExpired } from '../lib/mediaCache'
import { timeoutSignal } from '../lib/network'
import type { SyncProgress } from '../lib/mediaCache'

export interface ClockConfig {
  timezone: string
  font: string
  font_color: string
  bg_type: 'color' | 'image'
  bg_color: string
  bg_image_path: string | null
  show_seconds: boolean
  font_scale?: number
}

export interface WeatherConfig {
  city_name: string
  country: string
  latitude: number
  longitude: number
  unit: 'C' | 'F'
  text_color: string
  bg_type: 'auto' | 'color'
  bg_color: string
  show_humidity: boolean
  show_wind: boolean
  show_feels_like: boolean
  font_scale?: number
}

export interface QuotesConfig {
  quote: string
  author: string
  font: string
  bg_type: 'color' | 'image'
  bg_image_path: string | null
  bg_color: string
  font_color: string
  font_size: number
}

export interface MediaItem {
  id: string
  name: string
  type: 'image' | 'video' | 'html' | 'clock' | 'weather' | 'youtube' | 'stream' | 'quotes'
  storage_path: string | null
  url: string | null
  html_content: string | null
  clock_config: ClockConfig | null
  weather_config: WeatherConfig | null
  quotes_config: QuotesConfig | null
  size_bytes: number | null
  rendition_sizes: Record<string, number> | null
  duration: number
}

export interface RssFeedItem {
  id: string
  name: string
  url: string
}

export interface PlaylistItemFooter {
  enabled: boolean
  text?: string | null
}

export interface ItemSchedule {
  enabled: boolean
  start: string
  end: string
  days: number[]
  date_start?: string | null
  date_end?: string | null
}

export interface PlaylistItem {
  id: string
  order_index: number
  duration_override: number | null
  rss_article_count: number | null
  rss_article_links: string[] | null
  audio_enabled: boolean | null
  footer_override: PlaylistItemFooter | null
  schedule: ItemSchedule | null
  media_id: string | null
  rss_feed_id: string | null
  media: MediaItem | null
  rss_feed: RssFeedItem | null
}

export interface FooterConfig {
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

export type ScreenOrientation = 'landscape' | 'landscape-reverse' | 'portrait' | 'portrait-reverse'

export type VideoQuality = 'sd' | 'qhd' | 'hd' | 'fhd'

export interface ScreenConfig {
  id: string
  name: string
  sound_enabled: boolean
  video_quality: VideoQuality
  show_progress: boolean
  playlist_id: string | null
  footer_config: FooterConfig | null
  orientation: ScreenOrientation
  footer_margin_left: number
  footer_margin_right: number
}

// Assinatura do conteúdo que afeta a reprodução (ignora campos voláteis como o
// timestamp de sync do RSS). Detecta quando a playlist MUDOU de fato — e só
// então reinicia a reprodução / dispara o download / mostra o preload.
function computeSig(data: any, items: PlaylistItem[]): string {
  return JSON.stringify({
    s: {
      sound_enabled: data.sound_enabled,
      video_quality: data.video_quality,
      show_progress: data.show_progress,
      playlist_id: data.playlist_id,
      orientation: data.orientation,
      footer_config: data.footer_config,
    },
    items: items.map(it => ({
      id: it.id, o: it.order_index, d: it.duration_override, a: it.audio_enabled,
      rc: it.rss_article_count, rl: it.rss_article_links, fo: it.footer_override, sc: it.schedule,
      mid: it.media_id, rid: it.rss_feed_id,
      m: it.media ? {
        t: it.media.type, sp: it.media.storage_path, u: it.media.url,
        h: it.media.html_content, c: it.media.clock_config, w: it.media.weather_config,
        q: it.media.quotes_config, dur: it.media.duration,
      } : null,
      rf: it.rss_feed ? { id: it.rss_feed.id, u: it.rss_feed.url, n: it.rss_feed.name } : null,
    })),
  })
}

export function usePlaylist(token: string) {
  const [screen, setScreen] = useState<ScreenConfig | null>(null)
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [paired, setPaired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncProgress | null>(null)
  // Assinatura do último conteúdo aplicado — evita reiniciar a playlist no poll
  // quando nada mudou (senão a cada 1 min ela voltava pro item 0).
  const lastSigRef = useRef('')

  // Aplica o conteúdo (do cache ou da rede) APENAS se mudou de fato, e dispara o
  // download de TODAS as mídias (que aciona a tela de carregamento). Centralizar
  // aqui garante: boot offline baixa/valida do cache; mudança de playlist reaciona
  // o preload; e conteúdo idêntico (poll) não reinicia nada.
  const applyContent = useCallback((screenData: ScreenConfig, fetchedItems: PlaylistItem[], persist: boolean) => {
    const sig = computeSig(screenData, fetchedItems)
    if (sig === lastSigRef.current) return
    lastSigRef.current = sig

    setScreen(screenData)
    setItems(fetchedItems)
    setPaired(true)

    if (persist) {
      try {
        localStorage.setItem(`maranata_player_cache_${token}`, JSON.stringify({
          cachedScreen: screenData,
          cachedItems: fetchedItems,
        }))
      } catch (e) {
        console.error('Erro ao gravar cache local da playlist:', e)
      }
    }

    // Baixa/valida o cache local de mídias (rendition da qualidade da tela).
    // O App segura a tela de carregamento até isto reportar 'done'/'error'.
    setSyncStatus({ status: 'syncing', completed: 0, total: 0 })
    syncMediaCache(fetchedItems, screenData.video_quality, screenData.footer_config, setSyncStatus).catch(e => {
      console.error('Erro na sincronização de cache de mídias:', e)
      setSyncStatus({ status: 'error', completed: 0, total: 0 })
    })
  }, [token])

  // Carrega o cache offline na inicialização (e já dispara o preload com ele).
  useEffect(() => {
    if (!token) return
    try {
      const cached = localStorage.getItem(`maranata_player_cache_${token}`)
      if (cached) {
        const { cachedScreen, cachedItems } = JSON.parse(cached)
        if (cachedScreen) {
          applyContent(cachedScreen, cachedItems ?? [], false)
        }
      }
    } catch (e) {
      console.error('Erro ao ler cache local da playlist:', e)
    }
  }, [token, applyContent])

  const fetchScreen = useCallback(async () => {
    if (!token) return
    try {
      const code = token.replace(/-/g, '').slice(0, 6).toUpperCase()
      // Timeout: num box ligado numa rede SEM internet o fetch fica pendurado;
      // o limite faz falhar rápido e cair pro cache offline em vez de travar.
      let screenQ = supabase
        .from('screens')
        .select('id, name, sound_enabled, video_quality, show_progress, playlist_id, footer_config, orientation, footer_margin_left, footer_margin_right')
        .eq('token', code)
      const sig1 = timeoutSignal(10000)
      if (sig1) screenQ = screenQ.abortSignal(sig1)
      const { data, error } = await screenQ.maybeSingle()

      if (error) throw error

      if (!data) {
        setPaired(false)
        setLoading(false)
        return
      }

      let fetchedItems: PlaylistItem[] = []
      if (data.playlist_id) {
        let itemsQ = supabase
          .from('playlist_items')
          .select('id, order_index, duration_override, rss_article_count, rss_article_links, audio_enabled, footer_override, schedule, media_id, rss_feed_id, media(*), rss_feed:rss_feeds(*)')
          .eq('playlist_id', data.playlist_id)
          .order('order_index')
        const sig2 = timeoutSignal(10000)
        if (sig2) itemsQ = itemsQ.abortSignal(sig2)
        const { data: playlistItems, error: itemsError } = await itemsQ

        if (itemsError) throw itemsError

        // Supabase tipa joins como array; normalizamos media/rss_feed para objeto único
        fetchedItems = (playlistItems ?? []).map((it: any) => ({
          ...it,
          media: Array.isArray(it.media) ? (it.media[0] ?? null) : it.media,
          rss_feed: Array.isArray(it.rss_feed) ? (it.rss_feed[0] ?? null) : it.rss_feed,
        })) as PlaylistItem[]
      }

      // Aplica só se mudou de fato (dedupe por assinatura) — no poll de 1 min com
      // conteúdo igual, NÃO reinicia a playlist nem mostra o preload. Se mudou,
      // applyContent redispara o download e a tela de carregamento reaparece.
      applyContent(data as ScreenConfig, fetchedItems, true)
    } catch (e) {
      console.error('Erro ao sincronizar com o Supabase (rodando no modo offline cache):', e)
    } finally {
      setLoading(false)
    }
  }, [token, applyContent])

  useEffect(() => { fetchScreen() }, [fetchScreen])

  // Re-busca a playlist/config a cada 1 minuto — assim mudanças no admin
  // aparecem sozinhas rápido, mesmo sem mandar comando.
  useEffect(() => {
    const id = setInterval(fetchScreen, 60 * 1000)
    return () => clearInterval(id)
  }, [fetchScreen])

  // Validade de 24h do cache: a cada 30 min checa se venceu. Se sim, força um
  // re-sync (resetando a assinatura) — o syncMediaCache então apaga TODO o cache
  // e rebaixa do zero. Cobre a tela que fica dias na mesma playlist sem mudar.
  useEffect(() => {
    const id = setInterval(() => {
      if (isCacheExpired()) {
        lastSigRef.current = ''
        fetchScreen()
      }
    }, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchScreen])

  return { screen, items, paired, loading, refetch: fetchScreen, syncStatus }
}

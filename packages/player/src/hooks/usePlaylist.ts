import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { syncMediaCache } from '../lib/mediaCache'
import type { SyncProgress } from '../lib/mediaCache'

export interface ClockConfig {
  timezone: string
  font: string
  font_color: string
  bg_type: 'color' | 'image'
  bg_color: string
  bg_image_path: string | null
  show_seconds: boolean
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
}

export interface MediaItem {
  id: string
  name: string
  type: 'image' | 'video' | 'html' | 'clock' | 'weather' | 'youtube' | 'stream'
  storage_path: string | null
  url: string | null
  html_content: string | null
  clock_config: ClockConfig | null
  weather_config: WeatherConfig | null
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

export interface ScreenConfig {
  id: string
  name: string
  sound_enabled: boolean
  playlist_id: string | null
  footer_config: FooterConfig | null
  orientation: ScreenOrientation
}

export function usePlaylist(token: string) {
  const [screen, setScreen] = useState<ScreenConfig | null>(null)
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [paired, setPaired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncProgress | null>(null)

  // Carrega cache offline na inicialização
  useEffect(() => {
    if (!token) return
    const cacheKey = `maranata_player_cache_${token}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { cachedScreen, cachedItems } = JSON.parse(cached)
        if (cachedScreen) {
          setScreen(cachedScreen)
          setPaired(true)
        }
        if (cachedItems) {
          setItems(cachedItems)
        }
      }
    } catch (e) {
      console.error('Erro ao ler cache local da playlist:', e)
    }
  }, [token])

  const fetchScreen = useCallback(async () => {
    if (!token) return
    try {
      const code = token.replace(/-/g, '').slice(0, 6).toUpperCase()
      const { data, error } = await supabase
        .from('screens')
        .select('id, name, sound_enabled, playlist_id, footer_config, orientation')
        .eq('token', code)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        setPaired(false)
        setLoading(false)
        return
      }

      setScreen(data)
      setPaired(true)

      let fetchedItems: PlaylistItem[] = []
      if (data.playlist_id) {
        const { data: playlistItems, error: itemsError } = await supabase
          .from('playlist_items')
          .select('id, order_index, duration_override, rss_article_count, audio_enabled, footer_override, schedule, media_id, rss_feed_id, media(*), rss_feed:rss_feeds(*)')
          .eq('playlist_id', data.playlist_id)
          .order('order_index')

        if (itemsError) throw itemsError

        // Supabase tipa joins como array; normalizamos media/rss_feed para objeto único
        fetchedItems = (playlistItems ?? []).map((it: any) => ({
          ...it,
          media: Array.isArray(it.media) ? (it.media[0] ?? null) : it.media,
          rss_feed: Array.isArray(it.rss_feed) ? (it.rss_feed[0] ?? null) : it.rss_feed,
        })) as PlaylistItem[]
        setItems(fetchedItems)
      } else {
        setItems([])
      }

      // Atualiza o cache offline
      const cacheKey = `maranata_player_cache_${token}`
      localStorage.setItem(cacheKey, JSON.stringify({
        cachedScreen: data,
        cachedItems: fetchedItems
      }))

      // Sincroniza o cache local de mídias em background
      syncMediaCache(fetchedItems, setSyncStatus).catch(e => {
        console.error('Erro na sincronização de cache de mídias:', e)
        setSyncStatus({ status: 'error', completed: 0, total: 0 })
      })
    } catch (e) {
      console.error('Erro ao sincronizar com o Supabase (rodando no modo offline cache):', e)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchScreen() }, [fetchScreen])

  // Re-busca a playlist/config a cada 1 minuto — assim mudanças no admin
  // aparecem sozinhas rápido, mesmo sem mandar comando.
  useEffect(() => {
    const id = setInterval(fetchScreen, 60 * 1000)
    return () => clearInterval(id)
  }, [fetchScreen])

  return { screen, items, paired, loading, refetch: fetchScreen, syncStatus }
}

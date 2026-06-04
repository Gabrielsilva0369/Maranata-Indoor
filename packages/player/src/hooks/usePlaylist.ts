import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
  type: 'image' | 'video' | 'html' | 'clock' | 'weather'
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

export interface PlaylistItem {
  id: string
  order_index: number
  duration_override: number | null
  rss_article_count: number | null
  audio_enabled: boolean | null
  footer_override: PlaylistItemFooter | null
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

export interface ScreenConfig {
  id: string
  name: string
  sound_enabled: boolean
  playlist_id: string | null
  footer_config: FooterConfig | null
}

export function usePlaylist(token: string) {
  const [screen, setScreen] = useState<ScreenConfig | null>(null)
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [paired, setPaired] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchScreen = useCallback(async () => {
    const code = token.replace(/-/g, '').slice(0, 6).toUpperCase()
    const { data } = await supabase
      .from('screens')
      .select('id, name, sound_enabled, playlist_id, footer_config')
      .eq('token', code)
      .maybeSingle()

    if (!data) {
      setPaired(false)
      setLoading(false)
      return
    }

    setScreen(data)
    setPaired(true)

    if (data.playlist_id) {
      const { data: playlistItems } = await supabase
        .from('playlist_items')
        .select('id, order_index, duration_override, rss_article_count, audio_enabled, footer_override, media_id, rss_feed_id, media(*), rss_feed:rss_feeds(*)')
        .eq('playlist_id', data.playlist_id)
        .order('order_index')

      setItems((playlistItems as PlaylistItem[]) ?? [])
    } else {
      setItems([])
    }
    setLoading(false)
  }, [token])

  useEffect(() => { fetchScreen() }, [fetchScreen])

  // Polling a cada 5 minutos
  useEffect(() => {
    const id = setInterval(fetchScreen, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchScreen])

  return { screen, items, paired, loading, refetch: fetchScreen }
}

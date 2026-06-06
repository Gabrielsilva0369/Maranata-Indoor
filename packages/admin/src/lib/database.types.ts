export type MediaType = 'image' | 'video' | 'html' | 'clock' | 'weather' | 'youtube' | 'stream'

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

export interface ClockConfig {
  timezone: string
  font: string
  font_color: string
  bg_type: 'color' | 'image'
  bg_color: string
  bg_image_path: string | null
  show_seconds: boolean
}

export interface FooterConfig {
  enabled: boolean
  type: 'text' | 'rss'
  text: string | null
  rss_feed_id: string | null
  logo_path: string | null     // Supabase Storage path
  timezone: string             // para o relógio à direita
  bg_color: string
  text_color: string
  font_size: number            // px
  height: number               // px
  scroll_speed: number         // px/s
}

export type ScreenOrientation = 'landscape' | 'landscape-reverse' | 'portrait' | 'portrait-reverse'

export interface ScreenTelemetry {
  current_media?: string
  resolution?: string
  user_agent?: string
  app_version?: string
  storage_estimate?: string  // cache salvo
  storage_total?: string     // armazenamento disponível para o app
  storage_free?: string      // livre estimado
  cpu?: string               // processador (núcleos · arquitetura)
  ram?: string               // memória RAM aproximada
  device_model?: string      // modelo do aparelho (quando disponível)
}

export interface Screen {
  id: string
  name: string
  token: string
  playlist_id: string | null
  sound_enabled: boolean
  video_quality: 'sd' | 'qhd' | 'hd' | 'fhd'
  footer_config: FooterConfig | null
  orientation: ScreenOrientation
  telemetry: ScreenTelemetry | null
  online_since: string | null
  pending_command: string | null
  last_seen: string | null
  last_screenshot: string | null
  last_screenshot_at: string | null
  created_at: string
}

export interface MediaFolder {
  id: string
  name: string
  created_at: string
}

export interface Media {
  id: string
  name: string
  type: MediaType
  storage_path: string | null
  url: string | null
  html_content: string | null
  clock_config: ClockConfig | null
  weather_config: WeatherConfig | null
  folder_id: string | null
  duration: number
  created_at: string
}

export interface Playlist {
  id: string
  name: string
  created_at: string
}

export interface RssFeed {
  id: string
  name: string
  url: string
  last_synced_at: string | null
  created_at: string
}

export interface RssArticle {
  id: string
  feed_id: string
  title: string
  description: string | null
  image_url: string | null
  source_logo: string | null
  source_name: string | null
  link: string | null
  pub_date: string | null
  fetched_at: string
  active: boolean
}

export interface PlaylistItemFooter {
  enabled: boolean
  text?: string | null
}

export interface ItemSchedule {
  enabled: boolean
  start: string                // "HH:MM"
  end: string                  // "HH:MM"
  days: number[]               // 0=Dom ... 6=Sáb; vazio = todos os dias
  date_start?: string | null   // "YYYY-MM-DD" — só exibe a partir desta data
  date_end?: string | null     // "YYYY-MM-DD" — só exibe até esta data
}

export interface PlaylistItem {
  id: string
  playlist_id: string
  media_id: string | null
  rss_feed_id: string | null
  order_index: number
  duration_override: number | null
  rss_article_count: number | null
  audio_enabled: boolean | null
  footer_override: PlaylistItemFooter | null
  schedule: ItemSchedule | null
  media?: Media | null
  rss_feed?: RssFeed | null
}

export interface AppBundle {
  id: string
  version: string
  storage_path: string
  checksum: string | null
  notes: string | null
  active: boolean
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      screens:        { Row: Screen;      Insert: Omit<Screen,      'id' | 'created_at'>; Update: Partial<Omit<Screen,      'id'>> }
      media:          { Row: Media;       Insert: Omit<Media,       'id' | 'created_at'>; Update: Partial<Omit<Media,       'id'>> }
      playlists:      { Row: Playlist;    Insert: Omit<Playlist,    'id' | 'created_at'>; Update: Partial<Omit<Playlist,    'id'>> }
      playlist_items: { Row: PlaylistItem; Insert: Omit<PlaylistItem, 'id'>;              Update: Partial<Omit<PlaylistItem, 'id'>> }
      rss_feeds:      { Row: RssFeed;     Insert: Omit<RssFeed,     'id' | 'created_at' | 'last_synced_at'>; Update: Partial<Omit<RssFeed, 'id'>> }
      rss_articles:   { Row: RssArticle;  Insert: Omit<RssArticle,  'id'>;               Update: Partial<Omit<RssArticle,  'id'>> }
      app_bundles:    { Row: AppBundle;   Insert: Omit<AppBundle,   'id' | 'created_at'>; Update: Partial<Omit<AppBundle,   'id'>> }
    }
  }
}

export type MediaType = 'image' | 'video' | 'html' | 'clock' | 'weather' | 'youtube' | 'stream' | 'quotes'

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
  font_scale?: number   // multiplicador do tamanho da fonte (1 = padrão)
}

export interface ClockConfig {
  timezone: string
  font: string
  font_color: string
  bg_type: 'color' | 'image'
  bg_color: string
  bg_image_path: string | null
  show_seconds: boolean
  font_scale?: number   // multiplicador do tamanho da fonte (1 = padrão)
}

export interface QuotesConfig {
  quote: string               // a frase
  author: string              // a citação / autor
  font: string                // família da fonte
  bg_type: 'color' | 'image'
  bg_image_path: string | null
  bg_color: string            // usado se não houver imagem de fundo
  font_color: string
  font_size: number           // px (na base 1080 de altura)
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
  margin_top: number           // px — espaço no topo
  margin_bottom: number        // px — espaço na base
  margin_left: number          // px — espaço na esquerda
  margin_right: number         // px — espaço na direita
}

export type ScreenOrientation = 'landscape' | 'landscape-reverse' | 'portrait' | 'portrait-reverse'

// Cadastro do ponto onde a tela fica — usado para catalogar e vender mídia.
// Guardado em screens.profile (jsonb); todos os campos são opcionais.
export interface ScreenProfile {
  // Info / contato
  place_name?: string          // nome do estabelecimento (ex.: "Academia Mais Músculo")
  phone1?: string
  phone2?: string
  // Localização
  lat?: number | null
  lng?: number | null
  address?: string             // logradouro
  number?: string
  complement?: string
  district?: string            // bairro
  zip?: string                 // CEP
  country?: string             // país (ISO alpha-2, ex.: BR)
  state?: string               // estado/província
  city?: string
  // Métricas de público
  segment?: string             // segmento (ex.: Academia, Padaria… ou texto livre)
  open_time?: string           // "HH:MM"
  close_time?: string          // "HH:MM"
  open_24h?: boolean           // aberto 24 horas
  weekdays?: number[]          // 0=Dom … 6=Sáb
  foot_traffic?: number | null // fluxo médio de pessoas/mês
  social_classes?: string[]    // ['A','B','C','D']
  // Configurações
  timezone?: string
}

export interface ScreenTelemetry {
  current_media?: string
  current_item_id?: string   // id do item no ar — o preview do admin segue este id
  resolution?: string
  user_agent?: string
  app_version?: string
  storage_estimate?: string  // cache salvo
  storage_total?: string     // armazenamento disponível para o app
  storage_free?: string      // livre estimado
  cpu?: string               // processador (núcleos · arquitetura)
  ram?: string               // memória RAM aproximada
  device_model?: string      // modelo do aparelho (quando disponível)
  internet?: string          // 'ok' | 'sem' | '' (checagem real de internet)
  storage_quota_bytes?: number  // cota total do app em bytes
}

export interface Screen {
  id: string
  name: string
  token: string
  playlist_id: string | null
  sound_enabled: boolean
  video_quality: 'sd' | 'qhd' | 'hd' | 'fhd'
  show_progress: boolean
  footer_config: FooterConfig | null
  orientation: ScreenOrientation
  telemetry: ScreenTelemetry | null
  online_since: string | null
  session_started_at: string | null
  pending_command: string | null
  last_seen: string | null
  last_screenshot: string | null
  last_screenshot_at: string | null
  footer_margin_left: number
  footer_margin_right: number
  profile: ScreenProfile | null
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
  quotes_config: QuotesConfig | null
  size_bytes: number | null
  rendition_sizes: Record<string, number> | null
  folder_id: string | null
  client_id: string | null
  duration: number
  created_at: string
}

export type ClientType = 'fisica' | 'juridica'

export interface Client {
  id: string
  name: string
  type: ClientType
  document: string | null      // CPF (física) ou CNPJ (jurídica)
  email: string | null
  phone1: string | null
  phone2: string | null
  image_path: string | null
  address: string | null
  number: string | null
  complement: string | null
  district: string | null
  zip: string | null
  state: string | null
  city: string | null
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
  rss_article_links: string[] | null   // notícias escolhidas (por link); null = automático
  audio_enabled: boolean | null
  footer_override: PlaylistItemFooter | null
  schedule: ItemSchedule | null
  media?: Media | null
  rss_feed?: RssFeed | null
}

export interface Asset {
  hash: string
  path: string
  rendition_sizes: Record<string, number> | null
  refs: number
  created_at: string
}

export interface ScreenActionLog {
  id: string
  screen_id: string
  action: 'refresh' | 'reload' | 'clear_cache' | 'screenshot' | 'update'
  executed_by: string | null
  status: 'pending' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  completed_at: string | null
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
      assets:         { Row: Asset;       Insert: Omit<Asset,       'created_at'>;        Update: Partial<Asset> }
      clients:        { Row: Client;      Insert: Omit<Client,      'id' | 'created_at'>; Update: Partial<Omit<Client,      'id'>> }
    }
  }
}

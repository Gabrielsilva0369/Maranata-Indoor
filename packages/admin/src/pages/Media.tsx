import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Media, MediaType, ClockConfig, WeatherConfig, QuotesConfig, MediaFolder } from '../lib/database.types'
import { Upload, Trash2, Plus, Image, Film, Code, Clock, Cloud, Search, MapPin, Pencil, Folder, FolderPlus, Layers, Youtube, Radio, Quote, Images, X } from 'lucide-react'
import { transcodeVideoRenditions } from '../lib/videoTranscode'
import { uploadToSpaces, deleteFromSpaces, mediaUrl } from '../lib/spaces'
import { putAsset, releaseAsset, retainAsset } from '../lib/assets'

// Sobe as 3 qualidades do vídeo (SD/HD/FullHD) e devolve o storage_path base
// (o arquivo _fhd; o player deriva _hd/_sd trocando o sufixo).
async function uploadVideoRenditions(
  file: File,
  onProgress: (n: number) => void,
  onStatus: (s: 'loading' | 'analyzing' | 'transcoding' | 'done' | 'error' | null) => void,
): Promise<{ path: string; sizes: Record<string, number> }> {
  const r = await transcodeVideoRenditions({ file, onProgress, onStatusChange: onStatus })
  const base = `videos/${Date.now()}-${Math.random().toString(36).slice(2)}`
  const sizes: Record<string, number> = {}
  for (const q of ['sd', 'qhd', 'hd', 'fhd'] as const) {
    await uploadToSpaces(`${base}_${q}.mp4`, r[q], 'video/mp4')
    sizes[q] = r[q].size
  }
  return { path: `${base}_fhd.mp4`, sizes }
}

// Remove da DO. Vídeo novo tem 4 renditions (_sd/_qhd/_hd/_fhd) → remove as 4.
// Imagem (renditions _fhd.jpg ou legado) passa por releaseAsset (refs/dedup).
async function removeMediaStorage(storagePath: string | null | undefined) {
  if (!storagePath) return
  if (/_fhd\.mp4$/.test(storagePath)) {
    const base = storagePath.replace(/_fhd\.mp4$/, '')
    await Promise.all([
      deleteFromSpaces(`${base}_sd.mp4`),
      deleteFromSpaces(`${base}_qhd.mp4`),
      deleteFromSpaces(`${base}_hd.mp4`),
      deleteFromSpaces(`${base}_fhd.mp4`),
    ])
  } else {
    await releaseAsset(storagePath)
  }
}

const TYPE_LABELS: Record<MediaType, string> = {
  image: 'Imagem', video: 'Vídeo', html: 'HTML', clock: 'Relógio', weather: 'Clima', youtube: 'YouTube', stream: 'Stream', quotes: 'Frases',
}
const TYPE_ICONS: Record<MediaType, React.ReactNode> = {
  image: <Image size={14} />, video: <Film size={14} />, html: <Code size={14} />,
  clock: <Clock size={14} />, weather: <Cloud size={14} />,
  youtube: <Youtube size={14} />, stream: <Radio size={14} />, quotes: <Quote size={14} />,
}

// Extrai o ID de vídeo do YouTube de várias formas de URL
export function youtubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  // Já é um ID puro
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim()
  return null
}

const TIMEZONES = [
  { label: 'Brasília (UTC-3)',          value: 'America/Sao_Paulo' },
  { label: 'Manaus (UTC-4)',            value: 'America/Manaus' },
  { label: 'Fortaleza (UTC-3)',         value: 'America/Fortaleza' },
  { label: 'Recife (UTC-3)',            value: 'America/Recife' },
  { label: 'Belém (UTC-3)',             value: 'America/Belem' },
  { label: 'Cuiabá (UTC-4)',            value: 'America/Cuiaba' },
  { label: 'Porto Velho (UTC-4)',       value: 'America/Porto_Velho' },
  { label: 'Rio Branco (UTC-5)',        value: 'America/Rio_Branco' },
  { label: 'Fernando de Noronha (UTC-2)', value: 'America/Noronha' },
  { label: 'UTC',                       value: 'UTC' },
  { label: 'Nova York (UTC-5)',         value: 'America/New_York' },
  { label: 'Los Angeles (UTC-8)',       value: 'America/Los_Angeles' },
  { label: 'Lisboa (UTC+0)',            value: 'Europe/Lisbon' },
  { label: 'Londres (UTC+0)',           value: 'Europe/London' },
  { label: 'Madrid (UTC+1)',            value: 'Europe/Madrid' },
]

const FONTS = [
  { label: 'Padrão (system-ui)',  value: 'system-ui' },
  { label: 'Arial',               value: 'Arial' },
  { label: 'Georgia',             value: 'Georgia' },
  { label: 'Roboto',              value: 'Roboto' },
  { label: 'Open Sans',           value: 'Open Sans' },
  { label: 'Montserrat',          value: 'Montserrat' },
  { label: 'Lato',                value: 'Lato' },
  { label: 'Raleway',             value: 'Raleway' },
  { label: 'Oswald',              value: 'Oswald' },
  { label: 'Poppins',             value: 'Poppins' },
  { label: 'Playfair Display',    value: 'Playfair Display' },
  { label: 'Bebas Neue',          value: 'Bebas Neue' },
  { label: 'Ubuntu',              value: 'Ubuntu' },
  { label: 'Courier New',         value: 'Courier New' },
]

const GOOGLE_FONTS = FONTS.filter(f => !['system-ui','Arial','Georgia','Courier New'].includes(f.value))

const DEFAULT_CLOCK: ClockConfig = {
  timezone: 'America/Sao_Paulo',
  font: 'system-ui',
  font_color: '#ffffff',
  bg_type: 'color',
  bg_color: '#0f172a',
  bg_image_path: null,
  show_seconds: true,
  font_scale: 1,
}

const DEFAULT_QUOTES: QuotesConfig = {
  quote: '',
  author: '',
  font: 'system-ui',
  bg_type: 'color',
  bg_image_path: null,
  bg_color: '#0f172a',
  font_color: '#ffffff',
  font_size: 60,
}

// ── Reaproveitar uma imagem já enviada (asset) como fundo ─────────────────────
function AssetPickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (path: string) => void }) {
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets-picker'],
    queryFn: async () => {
      // Só fundos já usados (frase/relógio) — não polui com imagens de mídia.
      const { data, error } = await supabase
        .from('assets')
        .select('hash, path, created_at')
        .or('path.ilike.quotes-bg/%,path.ilike.clock-bg/%')
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as { hash: string; path: string; created_at: string }[]
    },
  })

  // Miniatura leve: usa a rendition _sd da imagem (mesma extensão do base).
  const thumb = (path: string) => mediaUrl(path.replace(/_fhd\.(\w+)$/, '_sd.$1'))

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold flex items-center gap-2"><Images size={18} className="text-brand-600" /> Reaproveitar imagem enviada</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-8">Carregando imagens…</p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Nenhuma imagem enviada ainda.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map(a => (
                <button key={a.hash} onClick={() => onSelect(a.path)}
                  className="aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-brand-500 transition-colors bg-gray-100">
                  <img src={thumb(a.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Frase motivacional: preview + formulário ──────────────────────────────────
function QuotesPreview({ cfg, bgUrl }: { cfg: QuotesConfig; bgUrl?: string }) {
  const text = cfg.quote.trim() || 'Sua frase aqui…'
  // Carrega a Google Font escolhida (se for uma).
  useEffect(() => {
    if (!GOOGLE_FONTS.find(f => f.value === cfg.font)) return
    const id = `gf-${cfg.font.replace(/ /g, '-')}`
    if (document.getElementById(id)) return
    document.head.appendChild(Object.assign(document.createElement('link'), {
      id, rel: 'stylesheet',
      href: `https://fonts.googleapis.com/css2?family=${cfg.font.replace(/ /g, '+')}:wght@400;700&display=swap`,
    }))
  }, [cfg.font])

  const bg = cfg.bg_type === 'image' && bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: cfg.bg_color }
  return (
    <div style={{ ...bg, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', fontFamily: cfg.font,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <p style={{
        position: 'relative', color: cfg.font_color, textAlign: 'center', fontWeight: 700,
        lineHeight: 1.25, textShadow: '0 2px 8px rgba(0,0,0,0.5)',
        fontSize: Math.max(12, cfg.font_size * 0.3), margin: 0,
      }}>{text}</p>
      {cfg.author.trim() && (
        <p style={{
          position: 'relative', color: cfg.font_color, opacity: 0.85, textAlign: 'center',
          fontStyle: 'italic', textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          fontSize: Math.max(9, cfg.font_size * 0.16), margin: 0,
        }}>{cfg.author.trim()}</p>
      )}
    </div>
  )
}

function QuotesForm({ cfg, onChange, bgUrl, onBgFileChange, onOpenPicker }: {
  cfg: QuotesConfig
  onChange: (c: QuotesConfig) => void
  bgUrl?: string
  onBgFileChange: (f: File | null) => void
  onOpenPicker: () => void
}) {
  const bgFileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<QuotesConfig>) => onChange({ ...cfg, ...patch })

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Preview</label>
        <QuotesPreview cfg={cfg} bgUrl={bgUrl} />
      </div>

      {/* Frase */}
      <div>
        <label className="block text-sm font-medium mb-1">Frase</label>
        <textarea value={cfg.quote} onChange={e => set({ quote: e.target.value })} rows={3}
          placeholder="A mente decidida move montanhas. A mente hesitante não move nem a si mesma."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
      </div>

      {/* Citação / Autor */}
      <div>
        <label className="block text-sm font-medium mb-1">Citação <span className="text-gray-400 font-normal">(autor)</span></label>
        <input value={cfg.author} onChange={e => set({ author: e.target.value })}
          placeholder="Napoleão Hill"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Fonte */}
      <div>
        <label className="block text-sm font-medium mb-1">Fonte</label>
        <select value={cfg.font} onChange={e => set({ font: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {/* Cor + tamanho da fonte */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Cor da fonte</label>
          <div className="flex gap-2">
            <input type="color" value={cfg.font_color} onChange={e => set({ font_color: e.target.value })}
              className="w-10 h-9 rounded border cursor-pointer" />
            <input value={cfg.font_color} onChange={e => set({ font_color: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tamanho: <span className="text-brand-600">{cfg.font_size}px</span></label>
          <input type="range" min={24} max={140} step={2} value={cfg.font_size}
            onChange={e => set({ font_size: parseInt(e.target.value, 10) })}
            className="w-full accent-brand-600 mt-2" />
        </div>
      </div>

      {/* Fundo */}
      <div>
        <label className="block text-sm font-medium mb-2">Fundo (vale para todas as frases)</label>
        <div className="flex gap-2 mb-3">
          {(['color', 'image'] as const).map(bt => (
            <button key={bt} onClick={() => set({ bg_type: bt })}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${cfg.bg_type === bt ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
              {bt === 'color' ? 'Cor sólida' : 'Imagem'}
            </button>
          ))}
        </div>
        {cfg.bg_type === 'color' && (
          <div className="flex gap-2">
            <input type="color" value={cfg.bg_color} onChange={e => set({ bg_color: e.target.value })}
              className="w-10 h-9 rounded border cursor-pointer" />
            <input value={cfg.bg_color} onChange={e => set({ bg_color: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        )}
        {cfg.bg_type === 'image' && (
          <div className="space-y-2">
            <input ref={bgFileRef} type="file" accept="image/*"
              onChange={e => onBgFileChange(e.target.files?.[0] ?? null)} className="hidden" />
            <button onClick={() => bgFileRef.current?.click()}
              className="flex items-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-brand-400 w-full justify-center">
              <Upload size={16} />
              {bgUrl ? 'Trocar imagem de fundo' : 'Selecionar imagem de fundo'}
            </button>
            <button onClick={onOpenPicker}
              className="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm text-gray-600 hover:border-brand-400 w-full justify-center">
              <Images size={16} />
              Reaproveitar imagem já enviada
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Preview miniatura do relógio ──────────────────────────────────────────────
function ClockPreview({ cfg, bgUrl }: { cfg: ClockConfig; bgUrl?: string }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Carrega Google Font no preview
  useEffect(() => {
    if (!GOOGLE_FONTS.find(f => f.value === cfg.font)) return
    const id = `gf-${cfg.font.replace(/ /g,'-')}`
    if (document.getElementById(id)) return
    const link = Object.assign(document.createElement('link'), {
      id, rel: 'stylesheet',
      href: `https://fonts.googleapis.com/css2?family=${cfg.font.replace(/ /g,'+')}:wght@400;700&display=swap`,
    })
    document.head.appendChild(link)
  }, [cfg.font])

  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: cfg.timezone, hour: '2-digit', minute: '2-digit',
    ...(cfg.show_seconds ? { second: '2-digit' } : {}), hour12: false,
  }).format(now)

  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: cfg.timezone, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
  }).format(now)

  const bg = cfg.bg_type === 'image' && bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: cfg.bg_color }

  return (
    <div style={{ ...bg, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: cfg.font, color: cfg.font_color, gap: 8, padding: 16,
    }}>
      <div style={{ fontSize: `calc(clamp(24px, 5vw, 48px) * ${cfg.font_scale ?? 1})`, fontWeight: 700, letterSpacing: 2, lineHeight: 1 }}>
        {time}
      </div>
      <div style={{ fontSize: `calc(clamp(10px, 1.5vw, 16px) * ${cfg.font_scale ?? 1})`, opacity: 0.8, textTransform: 'capitalize', textAlign: 'center' }}>
        {date}
      </div>
    </div>
  )
}

// ── Clima: utilitários ────────────────────────────────────────────────────────
const DEFAULT_WEATHER: WeatherConfig = {
  city_name: '', country: '', latitude: 0, longitude: 0,
  unit: 'C', text_color: '#ffffff',
  bg_type: 'auto', bg_color: '#1e40af',
  show_humidity: true, show_wind: true, show_feels_like: true,
  font_scale: 1,
}

function weatherGradient(code: number): [string, string] {
  if (code === 0) return ['#1e90ff', '#87ceeb']
  if (code <= 3) return ['#5b8ab5', '#90b5d0']
  if (code <= 48) return ['#607080', '#9aaabb']
  if (code <= 55) return ['#4a7a9b', '#6a9ab5']
  if (code <= 67) return ['#2c4a6e', '#4a6a8e']
  if (code <= 77) return ['#a0b8d0', '#c8dcea']
  if (code <= 82) return ['#3a5a7e', '#5a7a9e']
  return ['#1a1a3e', '#2a2a5e']
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  return '⛈️'
}

function weatherDesc(code: number): string {
  if (code === 0) return 'Céu limpo'
  if (code <= 2) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if (code <= 48) return 'Névoa'
  if (code <= 55) return 'Chuvisco'
  if (code <= 67) return 'Chuva'
  if (code <= 77) return 'Neve'
  if (code <= 82) return 'Pancadas'
  return 'Tempestade'
}

function toF(c: number) { return Math.round(c * 9 / 5 + 32) }

interface LiveWeather {
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  wind_speed_10m: number
  weather_code: number
}

function WeatherPreviewCard({ cfg, live }: { cfg: WeatherConfig; live: LiveWeather | null }) {
  const code = live?.weather_code ?? 0
  const [g1, g2] = cfg.bg_type === 'auto' ? weatherGradient(code) : [cfg.bg_color, cfg.bg_color]
  const temp = live ? (cfg.unit === 'F' ? toF(live.temperature_2m) : Math.round(live.temperature_2m)) : '--'
  const feels = live ? (cfg.unit === 'F' ? toF(live.apparent_temperature) : Math.round(live.apparent_temperature)) : '--'
  const unit = cfg.unit === 'F' ? '°F' : '°C'
  const fs = cfg.font_scale ?? 1
  return (
    <div style={{ background: `linear-gradient(135deg, ${g1}, ${g2})`, borderRadius: 12,
      aspectRatio: '16/9', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', color: cfg.text_color,
      fontFamily: 'system-ui', gap: 6, position: 'relative', overflow: 'hidden' }}>
      {cfg.city_name && (
        <p style={{ fontSize: 14 * fs, opacity: 0.85, fontWeight: 300, letterSpacing: 2, textTransform: 'uppercase' }}>
          {cfg.city_name}{cfg.country ? `, ${cfg.country}` : ''}
        </p>
      )}
      <div style={{ fontSize: 48 * fs, lineHeight: 1 }}>{weatherEmoji(code)}</div>
      <div style={{ fontSize: 42 * fs, fontWeight: 200, lineHeight: 1 }}>{temp}{unit}</div>
      <div style={{ fontSize: 14 * fs, opacity: 0.8 }}>{weatherDesc(code)}</div>
      {live && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12 * fs, opacity: 0.75, marginTop: 4 }}>
          {cfg.show_feels_like && <span>Sensação {feels}{unit}</span>}
          {cfg.show_humidity && <span>💧 {live.relative_humidity_2m}%</span>}
          {cfg.show_wind && <span>💨 {Math.round(live.wind_speed_10m)} km/h</span>}
        </div>
      )}
    </div>
  )
}

// ── Formulário de clima ───────────────────────────────────────────────────────
function WeatherForm({ cfg, onChange }: { cfg: WeatherConfig; onChange: (c: WeatherConfig) => void }) {
  const [search, setSearch] = useState(cfg.city_name || '')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [live, setLive] = useState<LiveWeather | null>(null)
  const set = (patch: Partial<WeatherConfig>) => onChange({ ...cfg, ...patch })

  const fetchLive = async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&wind_speed_unit=kmh&timezone=auto`
      )
      const data = await res.json()
      setLive(data.current)
    } catch { /* silencioso */ }
  }

  const geocode = async () => {
    if (!search.trim()) return
    setSearching(true); setSearchError('')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      const data = await res.json()
      if (!data[0]) { setSearchError('Cidade não encontrada.'); return }
      const { lat, lon, address } = data[0]
      const country = address?.country_code?.toUpperCase() ?? ''
      const newCfg = { ...cfg, city_name: search.trim(), country, latitude: parseFloat(lat), longitude: parseFloat(lon) }
      onChange(newCfg)
      fetchLive(parseFloat(lat), parseFloat(lon))
    } catch { setSearchError('Erro ao buscar. Tente novamente.') }
    finally { setSearching(false) }
  }

  // Auto-fetch live se já tem coordenadas
  useEffect(() => {
    if (cfg.latitude && cfg.longitude) fetchLive(cfg.latitude, cfg.longitude)
  }, [])

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div>
        <label className="block text-sm font-medium mb-2">Preview</label>
        <WeatherPreviewCard cfg={cfg} live={live} />
      </div>

      {/* Busca de cidade */}
      <div>
        <label className="block text-sm font-medium mb-1">Cidade</label>
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && geocode()}
            placeholder="ex: São Paulo, Recife, Lisboa..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button onClick={geocode} disabled={searching || !search.trim()}
            className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50">
            <Search size={14} />
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
        {searchError && <p className="text-red-500 text-xs mt-1">{searchError}</p>}
        {cfg.latitude !== 0 && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <MapPin size={10} /> {cfg.latitude.toFixed(4)}, {cfg.longitude.toFixed(4)} · {cfg.country}
          </p>
        )}
      </div>

      {/* Unidade */}
      <div>
        <label className="block text-sm font-medium mb-1">Unidade de temperatura</label>
        <div className="flex gap-2">
          {(['C', 'F'] as const).map(u => (
            <button key={u} onClick={() => set({ unit: u })}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${cfg.unit === u ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
              °{u === 'C' ? 'Celsius' : 'Fahrenheit'}
            </button>
          ))}
        </div>
      </div>

      {/* Fundo */}
      <div>
        <label className="block text-sm font-medium mb-1">Fundo</label>
        <div className="flex gap-2 mb-2">
          {(['auto', 'color'] as const).map(bt => (
            <button key={bt} onClick={() => set({ bg_type: bt })}
              className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors ${cfg.bg_type === bt ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
              {bt === 'auto' ? 'Automático (muda com tempo)' : 'Cor fixa'}
            </button>
          ))}
        </div>
        {cfg.bg_type === 'color' && (
          <div className="flex gap-2">
            <input type="color" value={cfg.bg_color} onChange={e => set({ bg_color: e.target.value })}
              className="w-9 h-9 rounded border cursor-pointer" />
            <input value={cfg.bg_color} onChange={e => set({ bg_color: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        )}
      </div>

      {/* Cor do texto */}
      <div>
        <label className="block text-sm font-medium mb-1">Cor do texto</label>
        <div className="flex gap-2">
          <input type="color" value={cfg.text_color} onChange={e => set({ text_color: e.target.value })}
            className="w-9 h-9 rounded border cursor-pointer" />
          <input value={cfg.text_color} onChange={e => set({ text_color: e.target.value })}
            className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {/* Tamanho da fonte */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Tamanho da fonte: <span className="text-brand-600">{Math.round((cfg.font_scale ?? 1) * 100)}%</span>
        </label>
        <input type="range" min={0.5} max={2.5} step={0.05} value={cfg.font_scale ?? 1}
          onChange={e => set({ font_scale: parseFloat(e.target.value) })}
          className="w-full accent-brand-600" />
      </div>

      {/* Exibir */}
      <div>
        <label className="block text-sm font-medium mb-2">Exibir</label>
        <div className="space-y-2">
          {[
            ['show_feels_like', 'Sensação térmica'] as const,
            ['show_humidity', 'Umidade'] as const,
            ['show_wind', 'Velocidade do vento'] as const,
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={cfg[key]} onChange={e => set({ [key]: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-600" />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Formulário de configuração do relógio ─────────────────────────────────────
function ClockForm({ cfg, onChange, bgUrl, onBgFileChange, onOpenPicker }: {
  cfg: ClockConfig
  onChange: (c: ClockConfig) => void
  bgUrl?: string
  onBgFileChange: (f: File | null) => void
  onOpenPicker: () => void
}) {
  const bgFileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<ClockConfig>) => onChange({ ...cfg, ...patch })

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div>
        <label className="block text-sm font-medium mb-2">Preview</label>
        <ClockPreview cfg={cfg} bgUrl={bgUrl} />
      </div>

      {/* Fuso horário */}
      <div>
        <label className="block text-sm font-medium mb-1">Fuso horário</label>
        <select value={cfg.timezone} onChange={e => set({ timezone: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
        </select>
      </div>

      {/* Fonte */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Fonte</label>
          <select value={cfg.font} onChange={e => set({ font: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cor da fonte</label>
          <div className="flex gap-2">
            <input type="color" value={cfg.font_color} onChange={e => set({ font_color: e.target.value })}
              className="w-10 h-9 rounded border cursor-pointer" />
            <input value={cfg.font_color} onChange={e => set({ font_color: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
      </div>

      {/* Tamanho da fonte */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Tamanho da fonte: <span className="text-brand-600">{Math.round((cfg.font_scale ?? 1) * 100)}%</span>
        </label>
        <input type="range" min={0.5} max={2.5} step={0.05} value={cfg.font_scale ?? 1}
          onChange={e => set({ font_scale: parseFloat(e.target.value) })}
          className="w-full accent-brand-600" />
      </div>

      {/* Fundo */}
      <div>
        <label className="block text-sm font-medium mb-2">Fundo</label>
        <div className="flex gap-2 mb-3">
          {(['color', 'image'] as const).map(bt => (
            <button key={bt} onClick={() => set({ bg_type: bt })}
              className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${cfg.bg_type === bt ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}
            >
              {bt === 'color' ? 'Cor sólida' : 'Imagem'}
            </button>
          ))}
        </div>
        {cfg.bg_type === 'color' && (
          <div className="flex gap-2">
            <input type="color" value={cfg.bg_color} onChange={e => set({ bg_color: e.target.value })}
              className="w-10 h-9 rounded border cursor-pointer" />
            <input value={cfg.bg_color} onChange={e => set({ bg_color: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        )}
        {cfg.bg_type === 'image' && (
          <div className="space-y-2">
            <input ref={bgFileRef} type="file" accept="image/*"
              onChange={e => onBgFileChange(e.target.files?.[0] ?? null)} className="hidden" />
            <button onClick={() => bgFileRef.current?.click()}
              className="flex items-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-brand-400 w-full justify-center"
            >
              <Upload size={16} />
              {bgUrl ? 'Trocar imagem de fundo' : 'Selecionar imagem de fundo'}
            </button>
            <button onClick={onOpenPicker}
              className="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm text-gray-600 hover:border-brand-400 w-full justify-center">
              <Images size={16} />
              Reaproveitar imagem já enviada
            </button>
          </div>
        )}
      </div>

      {/* Mostrar segundos */}
      <div className="flex items-center gap-3">
        <input type="checkbox" id="show-sec" checked={cfg.show_seconds}
          onChange={e => set({ show_seconds: e.target.checked })}
          className="w-4 h-4 rounded accent-brand-600" />
        <label htmlFor="show-sec" className="text-sm font-medium">Mostrar segundos</label>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MediaPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [type, setType] = useState<MediaType>('image')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [duration, setDuration] = useState(30)
  const [file, setFile] = useState<File | null>(null)
  const [clockCfg, setClockCfg] = useState<ClockConfig>({ ...DEFAULT_CLOCK })
  const [weatherCfg, setWeatherCfg] = useState<WeatherConfig>({ ...DEFAULT_WEATHER })
  const [quotesCfg, setQuotesCfg] = useState<QuotesConfig>({ ...DEFAULT_QUOTES })
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string>()
  // Reaproveitar um asset já enviado como fundo (sem novo upload).
  const [bgAssetPath, setBgAssetPath] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [transcodeStatus, setTranscodeStatus] = useState<'loading' | 'analyzing' | 'transcoding' | 'done' | 'error' | null>(null)
  const [transcodeProgress, setTranscodeProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Pastas: 'all' = todas, null = sem pasta, ou um id de pasta
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'all'>('all')
  const [folderId, setFolderId] = useState<string | null>(null)  // pasta no formulário
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Gera preview local da imagem de fundo
  useEffect(() => {
    if (!bgFile) { setBgPreviewUrl(undefined); return }
    const url = URL.createObjectURL(bgFile)
    setBgPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [bgFile])

  const { data: mediaList = [] } = useQuery<Media[]>({
    queryKey: ['media'],
    queryFn: async () => {
      const { data, error } = await supabase.from('media').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ['media-folders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('media_folders').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('media_folders').insert({ name: name.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media-folders'] })
      setShowNewFolder(false); setNewFolderName('')
    },
  })

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      // media.folder_id vira null automaticamente (ON DELETE SET NULL)
      const { error } = await supabase.from('media_folders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media-folders'] })
      qc.invalidateQueries({ queryKey: ['media'] })
      setSelectedFolder('all')
    },
  })

  // Mídias filtradas pela pasta selecionada
  const visibleMedia = mediaList.filter(m =>
    selectedFolder === 'all' ? true : m.folder_id === selectedFolder
  )

  const addMedia = useMutation({
    mutationFn: async () => {
      setUploading(true)
      setTranscodeStatus(null)
      setTranscodeProgress(0)
      let storagePath: string | null = null
      let sizeBytes: number | null = null
      let renditionSizes: Record<string, number> | null = null
      let finalClock = clockCfg

      // Upload arquivo (imagem/vídeo)
      if ((type === 'image' || type === 'video') && file) {
        if (type === 'video') {
          const r = await uploadVideoRenditions(file, setTranscodeProgress, setTranscodeStatus)
          storagePath = r.path
          renditionSizes = r.sizes
        } else {
          // Imagem: gera renditions SD/540p/HD/FullHD e deduplica por conteúdo.
          const r = await putAsset(file, 'images')
          storagePath = r.path
          renditionSizes = r.rendition_sizes
        }
      }

      // Fundo do relógio: novo upload, ou reaproveitar um asset já enviado.
      if (type === 'clock' && clockCfg.bg_type === 'image') {
        if (bgFile) {
          const r = await putAsset(bgFile, 'clock-bg')
          finalClock = { ...clockCfg, bg_image_path: r.path }
        } else if (bgAssetPath) {
          await retainAsset(bgAssetPath)
          finalClock = { ...clockCfg, bg_image_path: bgAssetPath }
        }
      }

      // Frase: novo upload, ou reaproveitar um asset já enviado.
      let finalQuotes = { ...quotesCfg, quote: quotesCfg.quote.trim(), author: quotesCfg.author.trim() }
      if (type === 'quotes' && quotesCfg.bg_type === 'image') {
        if (bgFile) {
          const r = await putAsset(bgFile, 'quotes-bg')
          finalQuotes = { ...finalQuotes, bg_image_path: r.path }
        } else if (bgAssetPath) {
          await retainAsset(bgAssetPath)
          finalQuotes = { ...finalQuotes, bg_image_path: bgAssetPath }
        }
      }

      const { error } = await supabase.from('media').insert({
        name: name.trim(),
        type,
        storage_path: storagePath,
        url: url.trim() || null,
        html_content: htmlContent.trim() || null,
        clock_config: type === 'clock' ? finalClock : null,
        weather_config: type === 'weather' ? weatherCfg : null,
        quotes_config: type === 'quotes' ? finalQuotes : null,
        size_bytes: sizeBytes,
        rendition_sizes: renditionSizes,
        folder_id: folderId,
        duration,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] })
      resetForm()
    },
    onError: () => setUploading(false),
  })

  const updateMedia = useMutation({
    mutationFn: async () => {
      if (!editingId) return
      setUploading(true)
      const existing = mediaList.find(m => m.id === editingId)
      const patch: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim() || null,
        html_content: htmlContent.trim() || null,
        weather_config: type === 'weather' ? weatherCfg : null,
        folder_id: folderId,
        duration,
      }

      // Substituir arquivo de imagem/vídeo (se um novo foi escolhido)
      if ((type === 'image' || type === 'video') && file) {
        setTranscodeStatus(null)
        setTranscodeProgress(0)
        let newPath: string
        if (type === 'video') {
          const r = await uploadVideoRenditions(file, setTranscodeProgress, setTranscodeStatus)
          newPath = r.path
          patch.rendition_sizes = r.sizes
          patch.size_bytes = null
        } else {
          const r = await putAsset(file, 'images')
          newPath = r.path
          patch.rendition_sizes = r.rendition_sizes
          patch.size_bytes = null
        }
        await removeMediaStorage(existing?.storage_path)
        patch.storage_path = newPath
      }

      // Relógio: substituir fundo (novo upload ou asset reaproveitado) ou manter
      if (type === 'clock') {
        let finalClock = clockCfg
        const oldBg = existing?.clock_config?.bg_image_path
        if (clockCfg.bg_type === 'image' && bgFile) {
          const r = await putAsset(bgFile, 'clock-bg')
          if (oldBg) await releaseAsset(oldBg)
          finalClock = { ...clockCfg, bg_image_path: r.path }
        } else if (clockCfg.bg_type === 'image' && bgAssetPath && bgAssetPath !== oldBg) {
          await retainAsset(bgAssetPath)
          if (oldBg) await releaseAsset(oldBg)
          finalClock = { ...clockCfg, bg_image_path: bgAssetPath }
        }
        patch.clock_config = finalClock
      }

      // Frase: substituir fundo (novo upload ou asset reaproveitado)
      if (type === 'quotes') {
        let finalQuotes = { ...quotesCfg, quote: quotesCfg.quote.trim(), author: quotesCfg.author.trim() }
        const oldBg = existing?.quotes_config?.bg_image_path
        if (quotesCfg.bg_type === 'image' && bgFile) {
          const r = await putAsset(bgFile, 'quotes-bg')
          if (oldBg) await releaseAsset(oldBg)
          finalQuotes = { ...finalQuotes, bg_image_path: r.path }
        } else if (quotesCfg.bg_type === 'image' && bgAssetPath && bgAssetPath !== oldBg) {
          await retainAsset(bgAssetPath)
          if (oldBg) await releaseAsset(oldBg)
          finalQuotes = { ...finalQuotes, bg_image_path: bgAssetPath }
        }
        patch.quotes_config = finalQuotes
      }

      const { error } = await supabase.from('media').update(patch).eq('id', editingId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] })
      resetForm()
    },
    onError: () => setUploading(false),
  })

  const deleteMedia = useMutation({
    mutationFn: async (item: Media) => {
      await removeMediaStorage(item.storage_path)
      if (item.clock_config?.bg_image_path) await releaseAsset(item.clock_config.bg_image_path)
      if (item.quotes_config?.bg_image_path) await releaseAsset(item.quotes_config.bg_image_path)
      const { error } = await supabase.from('media').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  })

  const getPublicUrl = (path: string) => mediaUrl(path)

  const resetForm = () => {
    setName(''); setUrl(''); setHtmlContent(''); setDuration(30)
    setFile(null); setType('image'); setClockCfg({ ...DEFAULT_CLOCK }); setWeatherCfg({ ...DEFAULT_WEATHER })
    setQuotesCfg({ ...DEFAULT_QUOTES })
    setBgFile(null); setBgPreviewUrl(undefined); setBgAssetPath(null); setUploading(false)
    setTranscodeStatus(null); setTranscodeProgress(0)
    setEditingId(null); setFolderId(null); setShowAdd(false)
  }

  const openCreate = () => {
    resetForm()
    // Cria já dentro da pasta atual (se uma pasta específica estiver selecionada)
    setFolderId(selectedFolder === 'all' ? null : selectedFolder)
    setShowAdd(true)
  }

  const openEdit = (item: Media) => {
    setEditingId(item.id)
    setType(item.type)
    setName(item.name)
    setUrl(item.url ?? '')
    setHtmlContent(item.html_content ?? '')
    setDuration(item.duration)
    setFolderId(item.folder_id)
    setFile(null)
    setBgFile(null)
    setBgAssetPath(null)
    setClockCfg(item.clock_config ?? { ...DEFAULT_CLOCK })
    setWeatherCfg(item.weather_config ?? { ...DEFAULT_WEATHER })
    setQuotesCfg(item.quotes_config ?? { ...DEFAULT_QUOTES })
    // Preview do fundo existente (relógio ou frases)
    const bgPath = item.clock_config?.bg_image_path ?? item.quotes_config?.bg_image_path
    setBgPreviewUrl(bgPath ? mediaUrl(bgPath) : undefined)
    setShowAdd(true)
  }

  const handleSave = () => {
    if (editingId) updateMedia.mutate()
    else addMedia.mutate()
  }

  // Ao editar, o arquivo de imagem/vídeo é opcional (mantém o atual)
  const isSaveDisabled = !name.trim() || uploading || addMedia.isPending || updateMedia.isPending ||
    ((type === 'image' || type === 'video') && !file && !editingId) ||
    (type === 'weather' && weatherCfg.latitude === 0) ||
    (type === 'youtube' && !youtubeId(url)) ||
    (type === 'stream' && !url.trim()) ||
    (type === 'quotes' && !quotesCfg.quote.trim())

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Mídias</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowNewFolder(true); setNewFolderName('') }}
            className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <FolderPlus size={16} /> Nova Pasta
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nova Mídia
          </button>
        </div>
      </div>

      {/* Barra de pastas */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button onClick={() => setSelectedFolder('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedFolder === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Layers size={14} /> Todas
          <span className="text-xs opacity-70">({mediaList.length})</span>
        </button>
        <button onClick={() => setSelectedFolder(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedFolder === null ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Sem pasta
          <span className="text-xs opacity-70">({mediaList.filter(m => !m.folder_id).length})</span>
        </button>
        {folders.map(f => {
          const count = mediaList.filter(m => m.folder_id === f.id).length
          const active = selectedFolder === f.id
          return (
            <div key={f.id} className={`group flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <button onClick={() => setSelectedFolder(f.id)} className="flex items-center gap-1.5">
                <Folder size={14} /> {f.name}
                <span className="text-xs opacity-70">({count})</span>
              </button>
              <button
                onClick={() => { if (confirm(`Remover pasta "${f.name}"? As mídias voltam para "Sem pasta".`)) deleteFolder.mutate(f.id) }}
                className={`ml-1 opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'hover:text-red-200' : 'hover:text-red-600'}`}
                title="Remover pasta">
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal nova pasta */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Nova Pasta</h3>
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newFolderName.trim() && createFolder.mutate(newFolderName)}
              placeholder="Nome da pasta" autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="flex gap-2">
              <button onClick={() => setShowNewFolder(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={() => createFolder.mutate(newFolderName)} disabled={!newFolderName.trim() || createFolder.isPending}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl my-4">
            <h3 className="text-lg font-semibold mb-4">{editingId ? 'Editar Mídia' : 'Nova Mídia'}</h3>
            <div className="space-y-4">
              {/* Tipo (fixo ao editar) */}
              <div>
                <label className="block text-sm font-medium mb-1">Tipo</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['image', 'video', 'html', 'clock', 'weather', 'youtube', 'stream', 'quotes'] as MediaType[]).map(t => (
                    <button key={t} onClick={() => !editingId && setType(t)}
                      disabled={!!editingId}
                      className={`py-2 rounded-lg border text-sm font-medium transition-colors flex flex-col items-center gap-1 ${type === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'} ${editingId && type !== t ? 'opacity-40' : ''} ${editingId ? 'cursor-not-allowed' : ''}`}
                    >
                      {TYPE_ICONS[t]}
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                {editingId && <p className="text-xs text-gray-400 mt-1">O tipo não pode ser alterado.</p>}
              </div>

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              {/* Pasta */}
              <div>
                <label className="block text-sm font-medium mb-1">Pasta</label>
                <select value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">— Sem pasta —</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              {/* Arquivo imagem/vídeo */}
              {(type === 'image' || type === 'video') && (
                <div>
                  <label className="block text-sm font-medium mb-1">Arquivo</label>
                  <input ref={fileRef} type="file" accept={type === 'image' ? 'image/*' : 'video/*'}
                    onChange={e => setFile(e.target.files?.[0] ?? null)} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-brand-400 w-full justify-center"
                  >
                    <Upload size={16} />
                    {file ? file.name : (editingId ? 'Trocar arquivo (opcional)' : 'Selecionar arquivo')}
                  </button>
                  {editingId && !file && (
                    <p className="text-xs text-gray-400 mt-1">Mantém o arquivo atual se nada for selecionado.</p>
                  )}
                </div>
              )}

              {/* HTML */}
              {type === 'html' && (
                <div>
                  <label className="block text-sm font-medium mb-1">URL ou HTML</label>
                  <input value={url} onChange={e => setUrl(e.target.value)}
                    placeholder="https://... (ou deixe em branco e escreva HTML abaixo)"
                    className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <textarea value={htmlContent} onChange={e => setHtmlContent(e.target.value)}
                    placeholder="<h1>Olá</h1>" rows={3}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              )}

              {/* YouTube */}
              {type === 'youtube' && (
                <div>
                  <label className="block text-sm font-medium mb-1">URL do YouTube (vídeo ou live)</label>
                  <input value={url} onChange={e => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... ou /live/..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  {url && (youtubeId(url)
                    ? <p className="text-xs text-green-600 mt-1">✓ Vídeo reconhecido: {youtubeId(url)}</p>
                    : <p className="text-xs text-red-500 mt-1">URL do YouTube não reconhecida.</p>
                  )}
                  <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg p-2">
                    ⚠️ Vídeos/lives monetizados de terceiros exibem anúncios do YouTube (não há como remover de forma legítima). Para signage sem anúncio, use conteúdo próprio sem monetização ou um Stream HLS direto.
                  </p>
                </div>
              )}

              {/* Stream HLS */}
              {type === 'stream' && (
                <div>
                  <label className="block text-sm font-medium mb-1">URL do stream (HLS .m3u8)</label>
                  <input value={url} onChange={e => setUrl(e.target.value)}
                    placeholder="https://.../playlist.m3u8"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-xs text-gray-500 mt-2 bg-blue-50 rounded-lg p-2">
                    Toca o stream direto, sem anúncios e desatendido. Ideal para live indoor. Use a URL .m3u8 da sua transmissão (própria ou de um provedor que forneça o feed direto).
                  </p>
                </div>
              )}

              {/* Clima */}
              {type === 'weather' && (
                <WeatherForm cfg={weatherCfg} onChange={setWeatherCfg} />
              )}

              {/* Relógio */}
              {type === 'clock' && (
                <ClockForm
                  cfg={clockCfg}
                  onChange={setClockCfg}
                  bgUrl={bgPreviewUrl}
                  onBgFileChange={f => { setBgFile(f); setBgAssetPath(null) }}
                  onOpenPicker={() => setPickerOpen(true)}
                />
              )}

              {/* Frases motivacionais */}
              {type === 'quotes' && (
                <QuotesForm
                  cfg={quotesCfg}
                  onChange={setQuotesCfg}
                  bgUrl={bgPreviewUrl}
                  onBgFileChange={f => { setBgFile(f); setBgAssetPath(null) }}
                  onOpenPicker={() => setPickerOpen(true)}
                />
              )}

              {/* Progresso de Transcodificação */}
              {transcodeStatus && (
                <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs font-medium text-brand-800">
                    <span>
                      {transcodeStatus === 'loading' && 'Inicializando conversor de vídeo...'}
                      {transcodeStatus === 'analyzing' && 'Analisando formato do vídeo...'}
                      {transcodeStatus === 'transcoding' && 'Convertendo vídeo para formato compatível (H.264)...'}
                      {transcodeStatus === 'done' && 'Conversão concluída! Enviando...'}
                      {transcodeStatus === 'error' && 'Erro ao converter o vídeo.'}
                    </span>
                    <span className="font-mono">{transcodeProgress}%</span>
                  </div>
                  <div className="w-full bg-brand-200/50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-brand-600 h-1.5 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${transcodeProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-brand-600/80 leading-normal">
                    Para garantir que o vídeo reproduza sem travar em qualquer TV Box, convertemos automaticamente para H.264 + AAC. Isso pode levar alguns minutos em arquivos grandes.
                  </p>
                </div>
              )}

              {/* Duração */}
              <div>
                <label className="block text-sm font-medium mb-1">Duração (segundos)</label>
                <input type="number" min={1} value={duration} onChange={e => setDuration(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {type === 'quotes' && (
                  <p className="text-xs text-gray-400 mt-1">Tempo que a frase fica na tela.</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={resetForm} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={handleSave} disabled={isSaveDisabled}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {uploading || addMedia.isPending || updateMedia.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Picker: reaproveitar uma imagem já enviada como fundo */}
      {pickerOpen && (
        <AssetPickerModal
          onClose={() => setPickerOpen(false)}
          onSelect={path => {
            setBgAssetPath(path)
            setBgFile(null)
            setBgPreviewUrl(mediaUrl(path))
            setPickerOpen(false)
          }}
        />
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {visibleMedia.map(item => (
          <div key={item.id} className="bg-white border rounded-xl overflow-hidden group">
            <div className="aspect-video bg-gray-100 relative flex items-center justify-center overflow-hidden">
              {item.storage_path && item.type === 'image' && (
                <img src={getPublicUrl(item.storage_path)} alt={item.name} className="w-full h-full object-cover" />
              )}
              {item.storage_path && item.type === 'video' && (
                <video src={getPublicUrl(item.storage_path)} className="w-full h-full object-cover" muted />
              )}
              {item.type === 'clock' && item.clock_config && (
                <ClockPreview
                  cfg={item.clock_config}
                  bgUrl={item.clock_config.bg_image_path ? getPublicUrl(item.clock_config.bg_image_path) : undefined}
                />
              )}
              {item.type === 'html' && <div className="text-gray-400"><Code size={24} /></div>}
              {item.type === 'youtube' && item.url && youtubeId(item.url) && (
                <img src={`https://img.youtube.com/vi/${youtubeId(item.url)}/hqdefault.jpg`} alt={item.name}
                  className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              {item.type === 'stream' && <div className="text-gray-400"><Radio size={24} /></div>}
              {item.type === 'weather' && item.weather_config && (
                <WeatherPreviewCard cfg={item.weather_config} live={null} />
              )}
              {item.type === 'quotes' && item.quotes_config && (
                <QuotesPreview
                  cfg={item.quotes_config}
                  bgUrl={item.quotes_config.bg_image_path ? getPublicUrl(item.quotes_config.bg_image_path) : undefined}
                />
              )}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(item)} title="Editar"
                  className="bg-white/90 text-gray-700 hover:bg-white p-1 rounded-lg shadow"
                ><Pencil size={14} /></button>
                <button onClick={() => { if (confirm('Remover mídia?')) deleteMedia.mutate(item) }} title="Remover"
                  className="bg-red-600 text-white p-1 rounded-lg shadow"
                ><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  {TYPE_ICONS[item.type]} {TYPE_LABELS[item.type]}
                </span>
                <span className="text-xs text-gray-400">{item.duration}s</span>
              </div>
            </div>
          </div>
        ))}
        {visibleMedia.length === 0 && (
          <p className="col-span-5 text-center text-gray-400 py-12">
            {selectedFolder === 'all' ? 'Nenhuma mídia cadastrada.' : 'Nenhuma mídia nesta pasta.'}
          </p>
        )}
      </div>
    </div>
  )
}

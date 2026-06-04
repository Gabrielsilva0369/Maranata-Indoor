import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Media, MediaType, ClockConfig, WeatherConfig } from '../lib/database.types'
import { Upload, Trash2, Plus, Image, Film, Code, Clock, Cloud, Search, MapPin } from 'lucide-react'

const TYPE_LABELS: Record<MediaType, string> = {
  image: 'Imagem', video: 'Vídeo', html: 'HTML', clock: 'Relógio', weather: 'Clima',
}
const TYPE_ICONS: Record<MediaType, React.ReactNode> = {
  image: <Image size={14} />, video: <Film size={14} />, html: <Code size={14} />,
  clock: <Clock size={14} />, weather: <Cloud size={14} />,
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
      <div style={{ fontSize: 'clamp(24px, 5vw, 48px)', fontWeight: 700, letterSpacing: 2, lineHeight: 1 }}>
        {time}
      </div>
      <div style={{ fontSize: 'clamp(10px, 1.5vw, 16px)', opacity: 0.8, textTransform: 'capitalize', textAlign: 'center' }}>
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
  return (
    <div style={{ background: `linear-gradient(135deg, ${g1}, ${g2})`, borderRadius: 12,
      aspectRatio: '16/9', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', color: cfg.text_color,
      fontFamily: 'system-ui', gap: 6, position: 'relative', overflow: 'hidden' }}>
      {cfg.city_name && (
        <p style={{ fontSize: 14, opacity: 0.85, fontWeight: 300, letterSpacing: 2, textTransform: 'uppercase' }}>
          {cfg.city_name}{cfg.country ? `, ${cfg.country}` : ''}
        </p>
      )}
      <div style={{ fontSize: 48, lineHeight: 1 }}>{weatherEmoji(code)}</div>
      <div style={{ fontSize: 42, fontWeight: 200, lineHeight: 1 }}>{temp}{unit}</div>
      <div style={{ fontSize: 14, opacity: 0.8 }}>{weatherDesc(code)}</div>
      {live && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, opacity: 0.75, marginTop: 4 }}>
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
function ClockForm({ cfg, onChange, bgUrl, onBgFileChange }: {
  cfg: ClockConfig
  onChange: (c: ClockConfig) => void
  bgUrl?: string
  onBgFileChange: (f: File | null) => void
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
          <>
            <input ref={bgFileRef} type="file" accept="image/*"
              onChange={e => onBgFileChange(e.target.files?.[0] ?? null)} className="hidden" />
            <button onClick={() => bgFileRef.current?.click()}
              className="flex items-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-brand-400 w-full justify-center"
            >
              <Upload size={16} />
              {bgUrl ? 'Trocar imagem de fundo' : 'Selecionar imagem de fundo'}
            </button>
          </>
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
  const [type, setType] = useState<MediaType>('image')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [duration, setDuration] = useState(30)
  const [file, setFile] = useState<File | null>(null)
  const [clockCfg, setClockCfg] = useState<ClockConfig>({ ...DEFAULT_CLOCK })
  const [weatherCfg, setWeatherCfg] = useState<WeatherConfig>({ ...DEFAULT_WEATHER })
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string>()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const addMedia = useMutation({
    mutationFn: async () => {
      setUploading(true)
      let storagePath: string | null = null
      let finalClock = clockCfg

      // Upload arquivo (imagem/vídeo)
      if ((type === 'image' || type === 'video') && file) {
        const ext = file.name.split('.').pop()
        const path = `${type}s/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: err } = await supabase.storage.from('media').upload(path, file)
        if (err) throw err
        storagePath = path
      }

      // Upload fundo do relógio
      if (type === 'clock' && clockCfg.bg_type === 'image' && bgFile) {
        const ext = bgFile.name.split('.').pop()
        const path = `clock-bg/${Date.now()}.${ext}`
        const { error: err } = await supabase.storage.from('media').upload(path, bgFile)
        if (err) throw err
        finalClock = { ...clockCfg, bg_image_path: path }
      }

      const { error } = await supabase.from('media').insert({
        name: name.trim(),
        type,
        storage_path: storagePath,
        url: url.trim() || null,
        html_content: htmlContent.trim() || null,
        clock_config: type === 'clock' ? finalClock : null,
        weather_config: type === 'weather' ? weatherCfg : null,
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

  const deleteMedia = useMutation({
    mutationFn: async (item: Media) => {
      if (item.storage_path) await supabase.storage.from('media').remove([item.storage_path])
      if (item.clock_config?.bg_image_path) await supabase.storage.from('media').remove([item.clock_config.bg_image_path])
      const { error } = await supabase.from('media').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  })

  const getPublicUrl = (path: string) =>
    supabase.storage.from('media').getPublicUrl(path).data.publicUrl

  const resetForm = () => {
    setName(''); setUrl(''); setHtmlContent(''); setDuration(30)
    setFile(null); setType('image'); setClockCfg({ ...DEFAULT_CLOCK }); setWeatherCfg({ ...DEFAULT_WEATHER })
    setBgFile(null); setBgPreviewUrl(undefined); setUploading(false)
    setShowAdd(false)
  }

  const isSaveDisabled = !name.trim() || uploading || addMedia.isPending ||
    ((type === 'image' || type === 'video') && !file) ||
    (type === 'weather' && weatherCfg.latitude === 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Mídias</h2>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nova Mídia
        </button>
      </div>

      {/* Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl my-4">
            <h3 className="text-lg font-semibold mb-4">Nova Mídia</h3>
            <div className="space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium mb-1">Tipo</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['image', 'video', 'html', 'clock', 'weather'] as MediaType[]).map(t => (
                    <button key={t} onClick={() => setType(t)}
                      className={`py-2 rounded-lg border text-sm font-medium transition-colors flex flex-col items-center gap-1 ${type === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}
                    >
                      {TYPE_ICONS[t]}
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
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
                    {file ? file.name : 'Selecionar arquivo'}
                  </button>
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
                  onBgFileChange={f => { setBgFile(f) }}
                />
              )}

              {/* Duração */}
              <div>
                <label className="block text-sm font-medium mb-1">Duração (segundos)</label>
                <input type="number" min={1} value={duration} onChange={e => setDuration(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={resetForm} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={() => addMedia.mutate()} disabled={isSaveDisabled}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {uploading || addMedia.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {mediaList.map(item => (
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
              {item.type === 'weather' && item.weather_config && (
                <WeatherPreviewCard cfg={item.weather_config} live={null} />
              )}
              <button onClick={() => { if (confirm('Remover mídia?')) deleteMedia.mutate(item) }}
                className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              ><Trash2 size={14} /></button>
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
        {mediaList.length === 0 && (
          <p className="col-span-5 text-center text-gray-400 py-12">Nenhuma mídia cadastrada.</p>
        )}
      </div>
    </div>
  )
}

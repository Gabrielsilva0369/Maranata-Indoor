import { useState, useRef, useEffect } from 'react'
import { uploadToSpaces, deleteFromSpaces, mediaUrl } from '../lib/spaces'
import type { Screen, Playlist, RssFeed, FooterConfig, ScreenOrientation, ScreenProfile } from '../lib/database.types'
import { X, Upload, ImageOff, Info, MapPin, BarChart3, Settings, ExternalLink, Search, Loader2 } from 'lucide-react'
import LocationMap from './LocationMap'
import PhoneField from './PhoneField'
import { COUNTRIES, countryName } from '../lib/countries'

const TIMEZONES = [
  { label: 'Brasília (UTC-3)',            value: 'America/Sao_Paulo' },
  { label: 'Manaus (UTC-4)',              value: 'America/Manaus' },
  { label: 'Fortaleza (UTC-3)',           value: 'America/Fortaleza' },
  { label: 'Belém (UTC-3)',               value: 'America/Belem' },
  { label: 'Cuiabá (UTC-4)',              value: 'America/Cuiaba' },
  { label: 'Porto Velho (UTC-4)',         value: 'America/Porto_Velho' },
  { label: 'Rio Branco (UTC-5)',          value: 'America/Rio_Branco' },
  { label: 'UTC',                         value: 'UTC' },
  { label: 'Nova York (UTC-5)',           value: 'America/New_York' },
  { label: 'Lisboa / Londres (UTC+0)',    value: 'Europe/Lisbon' },
]

export const DEFAULT_FOOTER: FooterConfig = {
  enabled: true,
  type: 'text',
  text: 'Bem-vindo!',
  rss_feed_id: null,
  logo_path: null,
  timezone: 'America/Sao_Paulo',
  bg_color: '#1e293b',
  text_color: '#ffffff',
  font_size: 18,
  height: 56,
  scroll_speed: 80,
  margin_top: 0,
  margin_bottom: 0,
  margin_left: 0,
  margin_right: 0,
}

// Upload da logo do rodapé na DO e devolve o footer_config final a ser salvo.
export async function uploadFooterLogo(
  screen: Screen, cfg: FooterConfig | null, logoFile: File | null, removeLogo: boolean,
): Promise<FooterConfig | null> {
  let finalCfg = cfg
  if (cfg) {
    if (removeLogo && screen.footer_config?.logo_path) {
      await deleteFromSpaces(screen.footer_config.logo_path)
      finalCfg = { ...cfg, logo_path: null }
    }
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `footer-logos/${Date.now()}.${ext}`
      await uploadToSpaces(path, logoFile, logoFile.type || 'image/png')
      finalCfg = { ...cfg, logo_path: path }
    }
  }
  return finalCfg
}

// ── Mini-relógio para o preview ───────────────────────────────────────────────
function MiniClock({ timezone, color, fontSize }: { timezone: string; color: string; fontSize: number }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, day: '2-digit', month: 'short' }).format(now)
  return (
    <div style={{ color, textAlign: 'center', lineHeight: 1.2, flexShrink: 0, paddingRight: 10 }}>
      <div style={{ fontSize, fontWeight: 700 }}>{time}</div>
      <div style={{ fontSize: fontSize * 0.65, opacity: 0.75 }}>{date}</div>
    </div>
  )
}

// ── Modal de configuração do rodapé ───────────────────────────────────────────
export function FooterModal({ screen, feeds, onClose, onSave }: {
  screen: Screen
  feeds: RssFeed[]
  onClose: () => void
  onSave: (cfg: FooterConfig | null, logoFile: File | null, removeLogo: boolean) => void
}) {
  const [cfg, setCfg] = useState<FooterConfig>(
    screen.footer_config ? { ...DEFAULT_FOOTER, ...screen.footer_config } : { ...DEFAULT_FOOTER }
  )
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | undefined>(
    screen.footer_config?.logo_path ? mediaUrl(screen.footer_config.logo_path) : undefined
  )
  const [removeLogo, setRemoveLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<FooterConfig>) => setCfg(c => ({ ...c, ...patch }))

  const handleLogoFile = (file: File | null) => {
    setLogoFile(file)
    setRemoveLogo(false)
    if (file) setLogoPreview(URL.createObjectURL(file))
  }
  const handleRemoveLogo = () => {
    setLogoFile(null); setLogoPreview(undefined); setRemoveLogo(true); set({ logo_path: null })
  }

  const previewText = cfg.type === 'rss'
    ? (feeds.find(f => f.id === cfg.rss_feed_id)?.name ?? 'Feed RSS') + ' • Título de exemplo da notícia mais recente'
    : (cfg.text ?? '')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-lg sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold truncate">Rodapé — {screen.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Overlay fixo na parte inferior</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-4"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium">Ativar rodapé</p>
              <p className="text-xs text-gray-400">Exibe o rodapé sobre todo o conteúdo</p>
            </div>
            <button onClick={() => set({ enabled: !cfg.enabled })}
              className={`relative w-14 h-8 rounded-full transition-colors ${cfg.enabled ? 'bg-brand-600' : 'bg-gray-300'}`}>
              <span style={{ transform: cfg.enabled ? 'translateX(28px)' : 'translateX(2px)' }}
                className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform" />
            </button>
          </div>

          <div className={cfg.enabled ? '' : 'opacity-40 pointer-events-none'}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Conteúdo do ticker</label>
              <div className="flex gap-2">
                {(['text', 'rss'] as const).map(t => (
                  <button key={t} onClick={() => set({ type: t })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${cfg.type === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
                    {t === 'text' ? 'Texto fixo' : 'Notícias RSS'}
                  </button>
                ))}
              </div>
            </div>

            {cfg.type === 'text' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Texto</label>
                <input value={cfg.text ?? ''} onChange={e => set({ text: e.target.value })}
                  placeholder="Seu texto aqui..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[40px]" />
              </div>
            )}

            {cfg.type === 'rss' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Feed RSS</label>
                <select value={cfg.rss_feed_id ?? ''} onChange={e => set({ rss_feed_id: e.target.value || null })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">— Selecione —</option>
                  {feeds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Logo <span className="text-gray-400 font-normal">(canto esquerdo)</span></label>
                <input ref={logoRef} type="file" accept="image/*"
                  onChange={e => handleLogoFile(e.target.files?.[0] ?? null)} className="hidden" />
                {logoPreview && !removeLogo ? (
                  <div className="flex items-center gap-2">
                    <img src={logoPreview} alt="logo" className="h-10 object-contain rounded border bg-gray-50 p-1" />
                    <button onClick={handleRemoveLogo} className="text-red-500 hover:text-red-700 text-xs"><ImageOff size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => logoRef.current?.click()}
                    className="flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 text-xs text-gray-500 hover:border-brand-400 w-full justify-center">
                    <Upload size={13} /> Selecionar imagem
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fuso horário <span className="text-gray-400 font-normal">(relógio)</span></label>
                <select value={cfg.timezone} onChange={e => set({ timezone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Aparência</p>
              <div className="grid grid-cols-2 gap-3">
                {[['Cor de fundo', 'bg_color'] as const, ['Cor do texto', 'text_color'] as const].map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium mb-1">{label}</label>
                    <div className="flex gap-2">
                      <input type="color" value={cfg[key]} onChange={e => set({ [key]: e.target.value })}
                        className="w-9 h-9 rounded border cursor-pointer" />
                      <input value={cfg[key]} onChange={e => set({ [key]: e.target.value })}
                        className="flex-1 border rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Altura (px)</label>
                  <input type="number" min={36} max={120} value={cfg.height} onChange={e => set({ height: Number(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Fonte (px)</label>
                  <input type="number" min={10} max={48} value={cfg.font_size} onChange={e => set({ font_size: Number(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Velocidade (px/s)</label>
                  <input type="number" min={20} max={400} value={cfg.scroll_speed} onChange={e => set({ scroll_speed: Number(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Espaçamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Margem superior (px)</label>
                    <input type="number" min={0} max={100} value={cfg.margin_top ?? 0} onChange={e => set({ margin_top: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Margem inferior (px)</label>
                    <input type="number" min={0} max={100} value={cfg.margin_bottom ?? 0} onChange={e => set({ margin_bottom: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Margem esquerda (px)</label>
                    <input type="number" min={0} max={100} value={cfg.margin_left ?? 0} onChange={e => set({ margin_left: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Margem direita (px)</label>
                    <input type="number" min={0} max={100} value={cfg.margin_right ?? 0} onChange={e => set({ margin_right: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
              <div style={{ borderRadius: 8, overflow: 'hidden', height: cfg.height, backgroundColor: cfg.bg_color, display: 'flex', alignItems: 'center' }}>
                {logoPreview && !removeLogo && (
                  <img src={logoPreview} alt="logo" style={{ height: '75%', maxWidth: 100, objectFit: 'contain', marginLeft: 8, marginRight: 8, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, overflow: 'hidden', paddingLeft: logoPreview ? 0 : 12 }}>
                  <span style={{ color: cfg.text_color, fontSize: cfg.font_size, whiteSpace: 'nowrap' }}>{previewText || '—'}</span>
                </div>
                <div style={{ borderLeft: `1px solid ${cfg.text_color}25`, marginLeft: 8 }}>
                  <MiniClock timezone={cfg.timezone} color={cfg.text_color} fontSize={cfg.font_size} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t bg-gray-50 flex-shrink-0">
          {screen.footer_config && (
            <button onClick={() => onSave(null, null, true)}
              className="border border-red-200 text-red-600 hover:bg-red-50 rounded-lg px-4 py-2.5 text-sm transition-colors min-h-[40px] sm:w-auto w-full">
              Remover
            </button>
          )}
          <div className="flex-1 hidden sm:block" />
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={onClose} className="border rounded-lg px-4 py-2.5 text-sm flex-1 sm:flex-none min-h-[40px]">Cancelar</button>
            <button onClick={() => onSave(cfg, logoFile, removeLogo)}
              className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex-1 sm:flex-none min-h-[40px]">
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal de edição dos detalhes da tela ──────────────────────────────────────
// Lista de segmentos (sem "Outro" — esse entra como opção sentinel no JSX e abre
// um campo de texto livre).
const SEGMENTS = [
  'Academia', 'Padaria', 'Restaurante', 'Lanchonete', 'Bar', 'Cafeteria',
  'Supermercado/Mercado', 'Conveniência', 'Açougue', 'Hortifruti',
  'Farmácia', 'Clínica/Consultório', 'Hospital', 'Laboratório', 'Estética/SPA',
  'Salão/Barbearia', 'Pet shop', 'Loja/Varejo', 'Shopping', 'Concessionária',
  'Oficina/Auto center', 'Posto de combustível', 'Banco/Financeira', 'Imobiliária',
  'Escritório/Coworking', 'Indústria', 'Escola/Faculdade', 'Igreja/Templo',
  'Hotel/Pousada', 'Clube/Lazer', 'Estádio/Arena', 'Aeroporto', 'Rodoviária',
]
const WEEKDAYS = [
  { i: 0, l: 'Dom' }, { i: 1, l: 'Seg' }, { i: 2, l: 'Ter' }, { i: 3, l: 'Qua' },
  { i: 4, l: 'Qui' }, { i: 5, l: 'Sex' }, { i: 6, l: 'Sáb' },
]
const SOCIAL_CLASSES = ['A', 'B', 'C', 'D']

type TabKey = 'info' | 'local' | 'metrics' | 'config'

export function EditScreenModal({ screen, playlists, onClose, onSave }: {
  screen: Screen
  playlists: Playlist[]
  onClose: () => void
  onSave: (patch: Partial<Screen>) => void
}) {
  const [tab, setTab] = useState<TabKey>('info')

  // Configurações técnicas da tela (já existiam).
  const [name, setName] = useState(screen.name)
  const [playlistId, setPlaylistId] = useState(screen.playlist_id ?? '')
  const [soundEnabled, setSoundEnabled] = useState(screen.sound_enabled)
  const [showProgress, setShowProgress] = useState(screen.show_progress !== false)
  const [videoQuality, setVideoQuality] = useState<'sd' | 'qhd' | 'hd' | 'fhd'>(screen.video_quality ?? 'hd')
  const [orientation, setOrientation] = useState<ScreenOrientation>(screen.orientation ?? 'landscape')

  // Cadastro do ponto (novo — em screens.profile).
  const [p, setProfile] = useState<ScreenProfile>(screen.profile ?? {})
  const setP = (patch: Partial<ScreenProfile>) => setProfile(prev => ({ ...prev, ...patch }))

  // Segmento "Outro": ativo quando o valor salvo não está na lista de presets.
  const initSeg = screen.profile?.segment
  const [segOther, setSegOther] = useState(!!initSeg && !SEGMENTS.includes(initSeg))

  const [geocoding, setGeocoding] = useState(false)

  // Geocodifica os campos de endereço (Nominatim/OSM, grátis, mundial) e move o pino.
  const geocode = async () => {
    const parts = [p.address, p.number, p.district, p.city, p.state, countryName(p.country), p.zip].filter(Boolean)
    if (parts.length === 0) return
    setGeocoding(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts.join(', '))}`
      const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
      const data = await res.json()
      if (data?.[0]) setP({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
      else alert('Endereço não encontrado. Arraste o pino manualmente no mapa.')
    } catch {
      alert('Não foi possível buscar o endereço agora.')
    } finally {
      setGeocoding(false)
    }
  }

  const ORIENTATIONS: { value: ScreenOrientation; label: string; hint: string }[] = [
    { value: 'landscape', label: 'Horizontal', hint: 'TV deitada (padrão)' },
    { value: 'landscape-reverse', label: 'Horizontal ⤬', hint: 'TV deitada de cabeça para baixo (180°)' },
    { value: 'portrait', label: 'Vertical ↻', hint: 'TV em pé, girar 90° horário' },
    { value: 'portrait-reverse', label: 'Vertical ↺', hint: 'TV em pé, girar 90° anti-horário' },
  ]

  const toggleArr = <T,>(arr: T[] | undefined, v: T): T[] => {
    const a = arr ?? []
    return a.includes(v) ? a.filter(x => x !== v) : [...a, v]
  }

  const mapsUrl = (p.lat != null && p.lng != null)
    ? `https://www.google.com/maps?q=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent([p.address, p.number, p.city, p.state, countryName(p.country)].filter(Boolean).join(' '))}`

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: 'Info', icon: <Info size={15} /> },
    { key: 'local', label: 'Localização', icon: <MapPin size={15} /> },
    { key: 'metrics', label: 'Métricas', icon: <BarChart3 size={15} /> },
    { key: 'config', label: 'Configurações', icon: <Settings size={15} /> },
  ]

  const field = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
  const lbl = 'block text-sm font-medium mb-1'

  const save = () => onSave({
    name: name.trim(),
    playlist_id: playlistId || null,
    sound_enabled: soundEnabled,
    video_quality: videoQuality,
    show_progress: showProgress,
    orientation,
    profile: p,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-2xl my-4 flex flex-col max-h-[92vh]">
        {/* Header + abas */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5">
          <h3 className="text-lg font-semibold">Editar Tela</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex gap-1 px-2 sm:px-4 pt-3 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                tab === t.key ? 'text-brand-600 border-brand-600' : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo rolável */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 border-t">
          {/* ── INFO ── */}
          {tab === 'info' && (
            <>
              <div>
                <label className={lbl}>Nome da tela</label>
                <input value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Ex: Recepção" />
              </div>
              <div>
                <label className={lbl}>Nome do estabelecimento</label>
                <input value={p.place_name ?? ''} onChange={e => setP({ place_name: e.target.value })}
                  className={field} placeholder="Ex: Academia Mais Músculo" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Telefone #1</label>
                  <PhoneField value={p.phone1} onChange={v => setP({ phone1: v })} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className={lbl}>Telefone #2</label>
                  <PhoneField value={p.phone2} onChange={v => setP({ phone2: v })} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <label className={lbl}>Código de pareamento</label>
                <input value={screen.token.slice(0, 6).toUpperCase()} disabled
                  className={`${field} font-mono bg-gray-50 text-gray-400`} />
                <p className="text-xs text-gray-400 mt-1">O código é fixo, gerado pelo dispositivo.</p>
              </div>
            </>
          )}

          {/* ── LOCALIZAÇÃO ── */}
          {tab === 'local' && (
            <>
              <div className="rounded-xl overflow-hidden border h-56 sm:h-64 relative">
                <LocationMap lat={p.lat} lng={p.lng} onChange={(lat, lng) => setP({ lat, lng })} />
                <a href={mapsUrl} target="_blank" rel="noreferrer"
                  className="absolute top-2 left-2 z-[1000] inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-brand-600 text-xs font-medium px-2.5 py-1.5 rounded-lg shadow">
                  <ExternalLink size={13} /> Abrir no Maps
                </a>
              </div>
              <p className="text-xs text-gray-400 -mt-1">Arraste o pino ou clique no mapa para ajustar a posição exata.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className={lbl}>Endereço</label>
                  <input value={p.address ?? ''} onChange={e => setP({ address: e.target.value })}
                    className={field} placeholder="Ex: Avenida Brasil" />
                </div>
                <div>
                  <label className={lbl}>Número</label>
                  <input value={p.number ?? ''} onChange={e => setP({ number: e.target.value })}
                    className={field} placeholder="Nº 123" />
                </div>
              </div>
              <div>
                <label className={lbl}>Complemento</label>
                <input value={p.complement ?? ''} onChange={e => setP({ complement: e.target.value })}
                  className={field} placeholder="Sala, andar, ponto de referência…" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Bairro</label>
                  <input value={p.district ?? ''} onChange={e => setP({ district: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={lbl}>CEP</label>
                  <input value={p.zip ?? ''} onChange={e => setP({ zip: e.target.value })}
                    className={field} placeholder="00000-000" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>País</label>
                  <select value={p.country ?? ''} onChange={e => setP({ country: e.target.value })} className={field}>
                    <option value="">Selecione</option>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Estado / Província</label>
                  <input value={p.state ?? ''} onChange={e => setP({ state: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={lbl}>Cidade</label>
                  <input value={p.city ?? ''} onChange={e => setP({ city: e.target.value })} className={field} />
                </div>
              </div>
              <button onClick={geocode} disabled={geocoding}
                className="w-full flex items-center justify-center gap-2 border border-brand-200 text-brand-600 hover:bg-brand-50 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50">
                {geocoding ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Localizar endereço no mapa
              </button>
            </>
          )}

          {/* ── MÉTRICAS ── */}
          {tab === 'metrics' && (
            <>
              <div>
                <label className={lbl}>Segmento</label>
                <select
                  value={segOther ? 'Outro' : (p.segment ?? '')}
                  onChange={e => {
                    if (e.target.value === 'Outro') { setSegOther(true); setP({ segment: '' }) }
                    else { setSegOther(false); setP({ segment: e.target.value }) }
                  }}
                  className={field}>
                  <option value="">Selecione</option>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="Outro">Outro…</option>
                </select>
                {segOther && (
                  <input value={p.segment ?? ''} onChange={e => setP({ segment: e.target.value })}
                    className={`${field} mt-2`} placeholder="Qual segmento?" autoFocus />
                )}
              </div>
              <div>
                <label className={lbl}>Horário de funcionamento</label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="time" value={p.open_time ?? '00:00'} disabled={p.open_24h}
                    onChange={e => setP({ open_time: e.target.value })}
                    className={`${field} disabled:bg-gray-50 disabled:text-gray-400`} />
                  <input type="time" value={p.open_24h ? '23:59' : (p.close_time ?? '')} disabled={p.open_24h}
                    onChange={e => setP({ close_time: e.target.value })}
                    className={`${field} disabled:bg-gray-50 disabled:text-gray-400`} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
                  <input type="checkbox" checked={!!p.open_24h}
                    onChange={e => setP(e.target.checked
                      ? { open_24h: true, open_time: '00:00', close_time: '23:59' }
                      : { open_24h: false })}
                    className="w-4 h-4 rounded accent-brand-600" />
                  Aberto 24 horas
                </label>
              </div>
              <div>
                <label className={lbl}>Dias da semana</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(d => {
                    const on = (p.weekdays ?? []).includes(d.i)
                    return (
                      <button key={d.i} onClick={() => setP({ weekdays: toggleArr(p.weekdays, d.i) })}
                        className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300 text-slate-600'}`}>
                        {d.l}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Fluxo de pessoas <span className="text-gray-400 font-normal">(por mês)</span></label>
                  <input type="number" min={0} value={p.foot_traffic ?? ''}
                    onChange={e => setP({ foot_traffic: e.target.value === '' ? null : Number(e.target.value) })}
                    className={field} placeholder="Ex: 15000" />
                  <p className="text-xs text-gray-400 mt-1">Média de pessoas que circulam no local por mês.</p>
                </div>
                <div>
                  <label className={lbl}>Classes sociais</label>
                  <div className="grid grid-cols-4 gap-2">
                    {SOCIAL_CLASSES.map(c => {
                      const on = (p.social_classes ?? []).includes(c)
                      return (
                        <button key={c} onClick={() => setP({ social_classes: toggleArr(p.social_classes, c) })}
                          className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300 text-slate-600'}`}>
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── CONFIGURAÇÕES (técnicas) ── */}
          {tab === 'config' && (
            <>
              <div>
                <label className={lbl}>Playlist</label>
                <select value={playlistId} onChange={e => setPlaylistId(e.target.value)} className={field}>
                  <option value="">— Sem playlist —</option>
                  {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Fuso horário</label>
                <select value={p.timezone ?? ''} onChange={e => setP({ timezone: e.target.value })} className={field}>
                  <option value="">Selecione</option>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Orientação</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORIENTATIONS.map(o => (
                    <button key={o.value} onClick={() => setOrientation(o.value)}
                      className={`py-2 px-1 rounded-lg border text-xs font-medium transition-colors ${orientation === o.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}
                      title={o.hint}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">{ORIENTATIONS.find(o => o.value === orientation)?.hint}</p>
              </div>
              <div>
                <label className={lbl}>Qualidade de vídeo</label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { value: 'sd', label: 'SD', hint: '480p — box fraco' },
                    { value: 'qhd', label: '540p', hint: '960×540 — box de 540p' },
                    { value: 'hd', label: 'HD', hint: '720p — equilíbrio' },
                    { value: 'fhd', label: 'Full HD', hint: '1080p — TV boa' },
                  ] as const).map(q => (
                    <button key={q.value} onClick={() => setVideoQuality(q.value)}
                      className={`py-2 px-1 rounded-lg border text-xs font-medium transition-colors ${videoQuality === q.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}
                      title={q.hint}>
                      {q.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">SD/540p em box fraco (roda liso) e Full HD em TV boa. <b>540p</b> casa exato com box 960×540.</p>
              </div>
              <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium">Som</p>
                  <p className="text-xs text-gray-400">Habilita áudio nos vídeos (padrão da tela)</p>
                </div>
                <button onClick={() => setSoundEnabled(v => !v)}
                  className={`relative w-14 h-8 rounded-full transition-colors ${soundEnabled ? 'bg-brand-600' : 'bg-gray-300'}`}>
                  <span style={{ transform: soundEnabled ? 'translateX(28px)' : 'translateX(2px)' }}
                    className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform" />
                </button>
              </div>
              <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium">Barra de progresso</p>
                  <p className="text-xs text-gray-400">A barrinha de tempo no rodapé da mídia</p>
                </div>
                <button onClick={() => setShowProgress(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${showProgress ? 'bg-brand-600' : 'bg-gray-200'}`}>
                  <span style={{ transform: showProgress ? 'translateX(22px)' : 'translateX(2px)' }}
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Rodapé fixo */}
        <div className="flex gap-2 px-4 sm:px-6 py-4 border-t bg-gray-50 rounded-b-2xl justify-end">
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={!name.trim()}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { uploadToSpaces, deleteFromSpaces, mediaUrl } from '../lib/spaces'
import type { Screen, Playlist, RssFeed, FooterConfig, ScreenOrientation } from '../lib/database.types'
import { X, Upload, ImageOff } from 'lucide-react'

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-semibold">Rodapé — {screen.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Overlay fixo na parte inferior da tela</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium">Ativar rodapé</p>
              <p className="text-xs text-gray-400">Exibe o rodapé sobre todo o conteúdo</p>
            </div>
            <button onClick={() => set({ enabled: !cfg.enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? 'bg-brand-600' : 'bg-gray-200'}`}>
              <span style={{ transform: cfg.enabled ? 'translateX(22px)' : 'translateX(2px)' }}
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
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
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
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

        <div className="flex gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          {screen.footer_config && (
            <button onClick={() => onSave(null, null, true)}
              className="border border-red-200 text-red-600 hover:bg-red-50 rounded-lg px-4 py-2 text-sm transition-colors">
              Remover
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => onSave(cfg, logoFile, removeLogo)}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de edição dos detalhes da tela ──────────────────────────────────────
export function EditScreenModal({ screen, playlists, onClose, onSave }: {
  screen: Screen
  playlists: Playlist[]
  onClose: () => void
  onSave: (patch: Partial<Screen>) => void
}) {
  const [name, setName] = useState(screen.name)
  const [playlistId, setPlaylistId] = useState(screen.playlist_id ?? '')
  const [soundEnabled, setSoundEnabled] = useState(screen.sound_enabled)
  const [showProgress, setShowProgress] = useState(screen.show_progress !== false)
  const [videoQuality, setVideoQuality] = useState<'sd' | 'qhd' | 'hd' | 'fhd'>(screen.video_quality ?? 'hd')
  const [orientation, setOrientation] = useState<ScreenOrientation>(screen.orientation ?? 'landscape')

  const ORIENTATIONS: { value: ScreenOrientation; label: string; hint: string }[] = [
    { value: 'landscape', label: 'Horizontal', hint: 'TV deitada (padrão)' },
    { value: 'landscape-reverse', label: 'Horizontal ⤬', hint: 'TV deitada de cabeça para baixo (180°)' },
    { value: 'portrait', label: 'Vertical ↻', hint: 'TV em pé, girar 90° horário' },
    { value: 'portrait-reverse', label: 'Vertical ↺', hint: 'TV em pé, girar 90° anti-horário' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold">Editar Tela</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome da tela</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Código de pareamento</label>
            <input value={screen.token.slice(0, 6).toUpperCase()} disabled
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono bg-gray-50 text-gray-400" />
            <p className="text-xs text-gray-400 mt-1">O código é fixo, gerado pelo dispositivo.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Playlist</label>
            <select value={playlistId} onChange={e => setPlaylistId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">— Sem playlist —</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Orientação</label>
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
            <label className="block text-sm font-medium mb-1">Qualidade de vídeo</label>
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
              className={`relative w-11 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-brand-600' : 'bg-gray-200'}`}>
              <span style={{ transform: soundEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
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
        </div>

        <div className="flex gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl justify-end">
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={() => onSave({ name: name.trim(), playlist_id: playlistId || null, sound_enabled: soundEnabled, video_quality: videoQuality, show_progress: showProgress, orientation })}
            disabled={!name.trim()}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

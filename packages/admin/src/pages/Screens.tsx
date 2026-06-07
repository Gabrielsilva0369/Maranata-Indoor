import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen, Playlist, RssFeed, FooterConfig } from '../lib/database.types'
import { Plus, Trash2, Volume2, VolumeX, PanelBottom, Pencil, Monitor } from 'lucide-react'
import { FooterModal, EditScreenModal, uploadFooterLogo } from '../components/screenSettings'

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 90_000
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Screens() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [pairCode, setPairCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newPlaylistId, setNewPlaylistId] = useState('')
  const [newQuality, setNewQuality] = useState<'sd' | 'qhd' | 'hd' | 'fhd'>('hd')
  const [newShowProgress, setNewShowProgress] = useState(true)
  const [pairError, setPairError] = useState('')
  const [footerScreen, setFooterScreen] = useState<Screen | null>(null)
  const [editScreen, setEditScreen] = useState<Screen | null>(null)

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ['screens'],
    queryFn: async () => {
      const { data, error } = await supabase.from('screens').select('*').order('created_at')
      if (error) throw error
      return data
    },
    refetchInterval: 30_000,
  })

  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ['playlists'],
    queryFn: async () => {
      const { data, error } = await supabase.from('playlists').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const { data: feeds = [] } = useQuery<RssFeed[]>({
    queryKey: ['rss-feeds'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rss_feeds').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const addScreen = useMutation({
    mutationFn: async () => {
      const token = pairCode.toUpperCase()
      const { data: existing } = await supabase.from('screens').select('id').ilike('token', `${token}%`).maybeSingle()
      if (existing) throw new Error('Código já pareado ou inválido.')
      const { error } = await supabase.from('screens').insert({
        name: newName, token, sound_enabled: false,
        playlist_id: newPlaylistId || null,
        video_quality: newQuality,
        show_progress: newShowProgress,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['screens'] })
      setShowAdd(false); setPairCode(''); setNewName(''); setNewPlaylistId(''); setNewQuality('hd'); setNewShowProgress(true); setPairError('')
    },
    onError: (e: Error) => setPairError(e.message),
  })

  const deleteScreen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('screens').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screens'] }),
  })

  const updateScreen = useMutation({
    mutationFn: async (patch: { id: string } & Partial<Screen>) => {
      const { id, ...rest } = patch
      const { error } = await supabase.from('screens').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screens'] }),
  })

  const saveFooter = async (screen: Screen, cfg: FooterConfig | null, logoFile: File | null, removeLogo: boolean) => {
    const finalCfg = await uploadFooterLogo(screen, cfg, logoFile, removeLogo)
    updateScreen.mutate({ id: screen.id, footer_config: finalCfg })
    setFooterScreen(null)
  }

  const onlineCount = screens.filter(s => isOnline(s.last_seen)).length

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Telas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {screens.length} {screens.length === 1 ? 'tela' : 'telas'}
            {screens.length > 0 && (
              <> · <span className="text-green-600 font-medium">{onlineCount} online</span></>
            )}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <Plus size={16} /> Adicionar Tela
        </button>
      </div>

      {/* Modal pareamento */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Adicionar Tela</h3>
            <p className="text-sm text-gray-500 mb-4">Abra o player no dispositivo e insira o código de 6 letras.</p>
            <div className="space-y-3">
              <input placeholder="Código (ex: A3F9B2)" value={pairCode}
                onChange={e => setPairCode(e.target.value.toUpperCase().slice(0, 6))}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                maxLength={6} />
              <input placeholder="Nome da tela" value={newName} onChange={e => setNewName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Playlist</label>
                <select value={newPlaylistId} onChange={e => setNewPlaylistId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">— Sem playlist —</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Qualidade de vídeo</label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { value: 'sd', label: 'SD', hint: '480p — box fraco' },
                    { value: 'qhd', label: '540p', hint: '960×540 — box de 540p' },
                    { value: 'hd', label: 'HD', hint: '720p — equilíbrio' },
                    { value: 'fhd', label: 'Full HD', hint: '1080p — TV boa' },
                  ] as const).map(q => (
                    <button key={q.value} type="button" onClick={() => setNewQuality(q.value)}
                      className={`py-2 px-1 rounded-lg border text-xs font-medium transition-colors ${newQuality === q.value ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}
                      title={q.hint}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs font-medium text-gray-500">Barra de progresso</span>
                <button type="button" onClick={() => setNewShowProgress(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${newShowProgress ? 'bg-brand-600' : 'bg-gray-200'}`}>
                  <span style={{ transform: newShowProgress ? 'translateX(22px)' : 'translateX(2px)' }}
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" />
                </button>
              </div>

              {pairError && <p className="text-red-600 text-sm">{pairError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowAdd(false); setPairError('') }} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={() => addScreen.mutate()}
                  disabled={pairCode.length < 6 || !newName.trim() || addScreen.isPending}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50">
                  {addScreen.isPending ? 'Pareando...' : 'Parear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal rodapé */}
      {footerScreen && (
        <FooterModal
          screen={footerScreen}
          feeds={feeds}
          onClose={() => setFooterScreen(null)}
          onSave={(cfg, logoFile, removeLogo) => saveFooter(footerScreen, cfg, logoFile, removeLogo)}
        />
      )}

      {/* Modal edição */}
      {editScreen && (
        <EditScreenModal
          screen={editScreen}
          playlists={playlists}
          onClose={() => setEditScreen(null)}
          onSave={patch => { updateScreen.mutate({ id: editScreen.id, ...patch }); setEditScreen(null) }}
        />
      )}

      {/* Grid de cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {screens.map(screen => {
          const online = isOnline(screen.last_seen)
          const hasFooter = !!screen.footer_config?.enabled
          return (
            <div key={screen.id} className="bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
              {/* Miniatura (print mais recente, ou placeholder) */}
              <Link to={`/screens/${screen.id}`} className="block relative aspect-video bg-slate-900 overflow-hidden group">
                {screen.last_screenshot ? (
                  <img src={screen.last_screenshot} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-slate-500">
                    <Monitor size={36} />
                  </div>
                )}
                <span className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${online ? 'bg-green-500 text-white' : 'bg-black/55 text-gray-100'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
                  {online ? 'Online' : 'Offline'}
                </span>
              </Link>

              {/* Corpo */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/screens/${screen.id}`} className="font-semibold text-slate-800 hover:text-brand-600 truncate block">
                      {screen.name}
                    </Link>
                    <span className="text-xs font-mono text-gray-400 tracking-wider">{screen.token.slice(0, 6).toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditScreen(screen)} title="Editar tela"
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => { if (confirm('Remover tela?')) deleteScreen.mutate(screen.id) }} title="Remover tela"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Playlist */}
                <select value={screen.playlist_id ?? ''} onChange={e => updateScreen.mutate({ id: screen.id, playlist_id: e.target.value || null })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors">
                  <option value="">— Sem playlist —</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Controles */}
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <button onClick={() => updateScreen.mutate({ id: screen.id, sound_enabled: !screen.sound_enabled })}
                    title={screen.sound_enabled ? 'Som ativo' : 'Sem som'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${screen.sound_enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {screen.sound_enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    Som
                  </button>
                  <button onClick={() => setFooterScreen(screen)} title="Configurar rodapé"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasFooter ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <PanelBottom size={14} />
                    Rodapé{hasFooter ? ' ✓' : ''}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {screens.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed py-16 text-center">
          <Monitor size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma tela cadastrada</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Adicionar Tela" e use o código que aparece no player.</p>
        </div>
      )}
    </div>
  )
}

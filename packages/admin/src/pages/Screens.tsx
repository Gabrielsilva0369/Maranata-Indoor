import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen, Playlist, RssFeed, FooterConfig } from '../lib/database.types'
import { Plus, Trash2, Volume2, VolumeX, Wifi, WifiOff, PanelBottom, Pencil } from 'lucide-react'
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Telas</h2>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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

      {/* Tabela */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Playlist</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Som</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Rodapé</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {screens.map(screen => {
              const online = isOnline(screen.last_seen)
              const hasFooter = !!screen.footer_config?.enabled
              return (
                <tr key={screen.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">
                    <Link to={`/screens/${screen.id}`} className="text-brand-600 hover:underline">
                      {screen.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-500">{screen.token.slice(0, 6).toUpperCase()}</td>
                  <td className="px-5 py-3">
                    <select value={screen.playlist_id ?? ''} onChange={e => updateScreen.mutate({ id: screen.id, playlist_id: e.target.value || null })}
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">— Sem playlist —</option>
                      {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => updateScreen.mutate({ id: screen.id, sound_enabled: !screen.sound_enabled })}
                      className={`p-1.5 rounded-lg transition-colors ${screen.sound_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      title={screen.sound_enabled ? 'Som ativo' : 'Sem som'}>
                      {screen.sound_enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => setFooterScreen(screen)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasFooter ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      title="Configurar rodapé">
                      <PanelBottom size={13} />
                      {hasFooter ? 'Ativo' : 'Configurar'}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
                      {online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setEditScreen(screen)}
                        className="text-gray-400 hover:text-brand-600 transition-colors" title="Editar tela">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => { if (confirm('Remover tela?')) deleteScreen.mutate(screen.id) }}
                        className="text-gray-400 hover:text-red-600 transition-colors" title="Remover tela">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {screens.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Nenhuma tela cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Playlist } from '../lib/database.types'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export default function Playlists() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ['playlists'],
    queryFn: async () => {
      const { data, error } = await supabase.from('playlists').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })

  const addPlaylist = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('playlists').insert({ name: newName.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlists'] })
      setShowAdd(false)
      setNewName('')
    },
  })

  const deletePlaylist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('playlists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  })

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold">Playlists</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
        >
          <Plus size={16} /> Nova
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Nova Playlist</h3>
            <input
              placeholder="Nome da playlist"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
              <button
                onClick={() => addPlaylist.mutate()}
                disabled={!newName.trim() || addPlaylist.isPending}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map(pl => (
          <div key={pl.id} className="bg-white border rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold">{pl.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(pl.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/playlists/${pl.id}`)}
                className="p-2 rounded-lg border hover:bg-gray-50 transition-colors"
                title="Editar itens"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => { if (confirm('Remover playlist?')) deletePlaylist.mutate(pl.id) }}
                className="p-2 rounded-lg border text-gray-400 hover:text-red-600 hover:border-red-200 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        {playlists.length === 0 && (
          <p className="col-span-3 text-center text-gray-400 py-12">Nenhuma playlist criada.</p>
        )}
      </div>
    </div>
  )
}

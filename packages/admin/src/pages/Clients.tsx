import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/spaces'
import type { Client } from '../lib/database.types'
import ClientModal from '../components/ClientModal'
import { Plus, Pencil, Trash2, Users, Building2, UserRound, Mail, Phone, MapPin } from 'lucide-react'

export default function Clients() {
  const qc = useQueryClient()
  const [modalClient, setModalClient] = useState<Client | null>(null)
  const [showModal, setShowModal] = useState(false)

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  // Contagem de mídias por cliente (uma query leve só com client_id).
  const { data: mediaCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['client-media-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('media').select('client_id')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const m of data as { client_id: string | null }[]) {
        if (m.client_id) counts[m.client_id] = (counts[m.client_id] ?? 0) + 1
      }
      return counts
    },
  })

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      // media.client_id vira null automaticamente (ON DELETE SET NULL).
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-media-counts'] })
    },
  })

  const openNew = () => { setModalClient(null); setShowModal(true) }
  const openEdit = (c: Client) => { setModalClient(c); setShowModal(true) }

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-3 sm:gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Clientes</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto">
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      {showModal && <ClientModal client={modalClient} onClose={() => setShowModal(false)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {clients.map(c => (
          <div key={c.id} className="bg-white rounded-xl sm:rounded-2xl border shadow-sm hover:shadow-lg transition-shadow flex flex-col">
            <Link to={`/clients/${c.id}`} className="flex items-start gap-3 p-4 sm:p-5 flex-1">
              <div className="w-14 h-14 shrink-0 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                {c.image_path
                  ? <img src={mediaUrl(c.image_path)} alt="" className="w-full h-full object-cover" />
                  : (c.type === 'juridica' ? <Building2 size={22} /> : <UserRound size={22} />)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 break-words">{c.name}</p>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mt-1 ${c.type === 'juridica' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                  {c.type === 'juridica' ? <Building2 size={11} /> : <UserRound size={11} />}
                  {c.type === 'juridica' ? 'Jurídica' : 'Física'}
                </span>
                <div className="mt-2 space-y-1 text-xs text-gray-500">
                  {c.email && <p className="flex items-center gap-1.5 break-all"><Mail size={12} className="shrink-0" /> {c.email}</p>}
                  {c.phone1 && <p className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {c.phone1}</p>}
                  {(c.city || c.state) && <p className="flex items-center gap-1.5"><MapPin size={12} className="shrink-0" /> {[c.city, c.state].filter(Boolean).join(' - ')}</p>}
                </div>
              </div>
            </Link>
            <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-t">
              <span className="text-xs text-gray-500">{mediaCounts[c.id] ?? 0} {(mediaCounts[c.id] ?? 0) === 1 ? 'mídia' : 'mídias'}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(c)} title="Editar"
                  className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><Pencil size={15} /></button>
                <button onClick={() => { if (confirm(`Remover cliente "${c.name}"? As mídias dele serão desvinculadas (não apagadas).`)) deleteClient.mutate(c.id) }}
                  title="Remover" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {clients.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed py-16 text-center">
          <Users size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Nenhum cliente cadastrado</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Novo Cliente" para começar.</p>
        </div>
      )}
    </div>
  )
}

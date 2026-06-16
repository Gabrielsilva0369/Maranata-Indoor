import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/spaces'
import type { Client } from '../lib/database.types'
import ClientModal from '../components/ClientModal'
import { Plus, Pencil, Trash2, Users, Building2, UserRound } from 'lucide-react'

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

      {clients.length > 0 && (
        <>
          {/* Tabela (desktop) */}
          <div className="hidden md:block bg-white rounded-2xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-3">Cliente</th>
                  <th className="text-left font-semibold px-4 py-3">Tipo</th>
                  <th className="text-left font-semibold px-4 py-3">Email</th>
                  <th className="text-left font-semibold px-4 py-3">Telefone</th>
                  <th className="text-left font-semibold px-4 py-3">Cidade</th>
                  <th className="text-center font-semibold px-4 py-3">Mídias</th>
                  <th className="text-right font-semibold px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/clients/${c.id}`} className="flex items-center gap-3 group">
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                          {c.image_path
                            ? <img src={mediaUrl(c.image_path)} alt="" className="w-full h-full object-cover" />
                            : (c.type === 'juridica' ? <Building2 size={18} /> : <UserRound size={18} />)}
                        </div>
                        <span className="font-semibold text-slate-800 group-hover:text-brand-600 transition-colors break-words">{c.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${c.type === 'juridica' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                        {c.type === 'juridica' ? <Building2 size={11} /> : <UserRound size={11} />}
                        {c.type === 'juridica' ? 'Jurídica' : 'Física'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 break-all">{c.email || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.phone1 || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{[c.city, c.state].filter(Boolean).join(' - ') || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{mediaCounts[c.id] ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(c)} title="Editar"
                          className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><Pencil size={15} /></button>
                        <button onClick={() => { if (confirm(`Remover cliente "${c.name}"? As mídias dele serão desvinculadas (não apagadas).`)) deleteClient.mutate(c.id) }}
                          title="Remover" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards (mobile) */}
          <div className="md:hidden space-y-3">
            {clients.map(c => (
              <div key={c.id} className="bg-white rounded-xl border shadow-sm">
                <Link to={`/clients/${c.id}`} className="flex items-center gap-3 p-4">
                  <div className="w-11 h-11 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                    {c.image_path
                      ? <img src={mediaUrl(c.image_path)} alt="" className="w-full h-full object-cover" />
                      : (c.type === 'juridica' ? <Building2 size={20} /> : <UserRound size={20} />)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 break-words">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span>{c.type === 'juridica' ? 'Jurídica' : 'Física'}</span>
                      <span>·</span>
                      <span>{mediaCounts[c.id] ?? 0} mídias</span>
                    </div>
                    {c.email && <p className="text-xs text-gray-500 break-all mt-0.5">{c.email}</p>}
                  </div>
                </Link>
                <div className="flex items-center justify-end gap-1 px-3 py-2 border-t">
                  <button onClick={() => openEdit(c)} title="Editar"
                    className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => { if (confirm(`Remover cliente "${c.name}"? As mídias dele serão desvinculadas (não apagadas).`)) deleteClient.mutate(c.id) }}
                    title="Remover" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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

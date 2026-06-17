import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/spaces'
import type { Client, ClientPayment } from '../lib/database.types'
import ClientModal from '../components/ClientModal'
import { Plus, Pencil, Trash2, Users, Building2, UserRound } from 'lucide-react'

const pad = (n: number) => String(n).padStart(2, '0')

const now = new Date()
const curYear = now.getFullYear()
const curMonth = now.getMonth()
const curPeriod = `${curYear}-${pad(curMonth + 1)}-01`

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ativo:     { label: 'Ativo',     cls: 'bg-emerald-50 text-emerald-600' },
  atraso:    { label: 'Em atraso', cls: 'bg-amber-50 text-amber-600' },
  pausado:   { label: 'Pausado',   cls: 'bg-sky-50 text-sky-600' },
  cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
}

const PAYMENT_META: Record<string, { label: string; cls: string }> = {
  pago:        { label: 'Pago',          cls: 'bg-emerald-50 text-emerald-600' },
  atraso:      { label: 'Em atraso',     cls: 'bg-red-50 text-red-500' },
  pendente:    { label: 'Pendente',      cls: 'bg-orange-50 text-orange-500' },
  pausado:     { label: 'Pausado',       cls: 'bg-sky-50 text-sky-500' },
  naoaderente: { label: 'Não aderente',  cls: 'bg-gray-50 text-gray-400' },
}

function monthPayState(c: Client, rec: ClientPayment | undefined): string {
  if (rec?.paid) return 'pago'
  if (c.start_date) {
    const s = new Date(c.start_date + 'T00:00')
    if (curYear < s.getFullYear() || (curYear === s.getFullYear() && curMonth < s.getMonth())) return 'naoaderente'
  }
  if (c.end_date) {
    const e = new Date(c.end_date + 'T00:00')
    if (curYear > e.getFullYear() || (curYear === e.getFullYear() && curMonth > e.getMonth())) return 'naoaderente'
  }
  if (c.status === 'pausado') return 'pausado'
  const dim = new Date(curYear, curMonth + 1, 0).getDate()
  const due = new Date(curYear, curMonth, Math.min(c.payment_day ?? 1, dim))
  if (due < new Date(new Date().toDateString())) return 'atraso'
  return 'pendente'
}

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

  const { data: curPayments = [] } = useQuery<ClientPayment[]>({
    queryKey: ['current-month-payments', curPeriod],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_payments').select('*').eq('period', curPeriod)
      if (error) throw error
      return data
    },
  })
  const payByClient = Object.fromEntries(curPayments.map(p => [p.client_id, p]))

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
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
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                  <th className="text-left font-semibold px-4 py-3">Cobrança do mês</th>
                  <th className="text-center font-semibold px-4 py-3">Mídias</th>
                  <th className="text-right font-semibold px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => {
                  const pState = monthPayState(c, payByClient[c.id])
                  const pm = PAYMENT_META[pState]
                  const sm = STATUS_META[c.status] ?? STATUS_META['ativo']
                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/clients/${c.id}`} className="flex items-center gap-3 group">
                          <div className="w-10 h-10 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                            {c.image_path
                              ? <img src={mediaUrl(c.image_path)} alt="" className="w-full h-full object-cover" />
                              : (c.type === 'juridica' ? <Building2 size={18} /> : <UserRound size={18} />)}
                          </div>
                          <span className="font-semibold text-slate-800 group-hover:text-brand-600 transition-colors">{c.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${sm.cls}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full ${pm.cls}`}>
                          {pm.label}
                        </span>
                      </td>
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
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards (mobile) */}
          <div className="md:hidden space-y-3">
            {clients.map(c => {
              const pState = monthPayState(c, payByClient[c.id])
              const pm = PAYMENT_META[pState]
              const sm = STATUS_META[c.status] ?? STATUS_META['ativo']
              return (
                <div key={c.id} className="bg-white rounded-xl border shadow-sm">
                  <Link to={`/clients/${c.id}`} className="flex items-center gap-3 p-4">
                    <div className="w-11 h-11 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
                      {c.image_path
                        ? <img src={mediaUrl(c.image_path)} alt="" className="w-full h-full object-cover" />
                        : (c.type === 'juridica' ? <Building2 size={20} /> : <UserRound size={20} />)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.cls}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />{sm.label}
                        </span>
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${pm.cls}`}>
                          {pm.label}
                        </span>
                        <span className="text-xs text-gray-400">{mediaCounts[c.id] ?? 0} mídias</span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center justify-end gap-1 px-3 py-2 border-t">
                    <button onClick={() => openEdit(c)} title="Editar"
                      className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><Pencil size={15} /></button>
                    <button onClick={() => { if (confirm(`Remover cliente "${c.name}"? As mídias dele serão desvinculadas (não apagadas).`)) deleteClient.mutate(c.id) }}
                      title="Remover" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </div>
                </div>
              )
            })}
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

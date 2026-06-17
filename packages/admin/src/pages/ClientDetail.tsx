import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/spaces'
import { releaseAsset } from '../lib/assets'
import type { Client, ClientPayment, Media } from '../lib/database.types'
import { youtubeId, MediaFormModal, removeMediaStorage } from './Media'
import ClientModal from '../components/ClientModal'
import {
  ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Building2, UserRound, Mail, Phone, MapPin, FileText,
  Image as ImageIcon, Film, Code, Clock, Cloud, Youtube, Radio, Quote, Images,
  DollarSign, Wallet, TrendingUp, CalendarDays, Check, StickyNote, X, Loader2,
} from 'lucide-react'

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : '—'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const STATUS_META: Record<string, { label: string; cls: string }> = {
  ativo:     { label: 'Ativo',     cls: 'bg-emerald-50 text-emerald-600' },
  atraso:    { label: 'Em atraso', cls: 'bg-amber-50 text-amber-600' },
  pausado:   { label: 'Pausado',   cls: 'bg-sky-50 text-sky-600' },
  cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
}
const pad = (n: number) => String(n).padStart(2, '0')

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  image: { label: 'Imagem', icon: <ImageIcon size={13} /> },
  video: { label: 'Vídeo', icon: <Film size={13} /> },
  html: { label: 'HTML', icon: <Code size={13} /> },
  clock: { label: 'Relógio', icon: <Clock size={13} /> },
  weather: { label: 'Clima', icon: <Cloud size={13} /> },
  youtube: { label: 'YouTube', icon: <Youtube size={13} /> },
  stream: { label: 'Stream', icon: <Radio size={13} /> },
  quotes: { label: 'Frases', icon: <Quote size={13} /> },
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [addMediaOpen, setAddMediaOpen] = useState(false)
  const [editMedia, setEditMedia] = useState<Media | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())

  const deleteMedia = useMutation({
    mutationFn: async (item: Media) => {
      await removeMediaStorage(item.storage_path)
      if (item.clock_config?.bg_image_path) await releaseAsset(item.clock_config.bg_image_path)
      if (item.quotes_config?.bg_image_path) await releaseAsset(item.quotes_config.bg_image_path)
      const { error } = await supabase.from('media').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-media', id] })
      qc.invalidateQueries({ queryKey: ['client-media-counts'] })
      qc.invalidateQueries({ queryKey: ['media'] })
    },
  })

  const { data: client } = useQuery<Client>({
    queryKey: ['client', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })

  const { data: medias = [] } = useQuery<Media[]>({
    queryKey: ['client-media', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('media').select('*')
        .eq('client_id', id!).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  // Cobranças do ano selecionado
  const { data: payments = [] } = useQuery<ClientPayment[]>({
    queryKey: ['client-payments', id, year],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_payments').select('*')
        .eq('client_id', id!)
        .gte('period', `${year}-01-01`).lte('period', `${year}-12-01`)
      if (error) throw error
      return data
    },
  })

  // Totais gerais (todos os anos)
  const { data: allPayments = [] } = useQuery<ClientPayment[]>({
    queryKey: ['client-payments-all', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_payments').select('*')
        .eq('client_id', id!).eq('paid', true)
      if (error) throw error
      return data
    },
  })

  const [payMonth, setPayMonth] = useState<number | null>(null)

  if (!client) {
    return <div className="p-8"><div className="animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent" /></div>
  }

  const thumb = (m: Media) => {
    if (m.storage_path && m.type === 'image') return mediaUrl(m.storage_path)
    if (m.type === 'youtube' && m.url && youtubeId(m.url)) return `https://img.youtube.com/vi/${youtubeId(m.url)}/hqdefault.jpg`
    return null
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-4">
        <ChevronLeft size={16} /> Voltar para Clientes
      </Link>

      {editing && <ClientModal client={client} onClose={() => setEditing(false)} />}
      {addMediaOpen && (
        <MediaFormModal defaultClientId={client.id} onClose={() => setAddMediaOpen(false)} />
      )}
      {editMedia && (
        <MediaFormModal editing={editMedia} onClose={() => setEditMedia(null)} />
      )}
      {payMonth !== null && (
        <PaymentModal
          clientId={client.id}
          year={year}
          month={payMonth}
          rec={payments.find(p => p.period === `${year}-${pad(payMonth + 1)}-01`) ?? null}
          defaultAmount={client.billing_monthly}
          paymentDay={client.payment_day}
          onClose={() => setPayMonth(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['client-payments', id, year] }); qc.invalidateQueries({ queryKey: ['client-payments-all', id] }); setPayMonth(null) }}
        />
      )}

      {/* Cabeçalho do cliente */}
      <section className="bg-white rounded-xl sm:rounded-2xl border shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 shrink-0 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400">
            {client.image_path
              ? <img src={mediaUrl(client.image_path)} alt="" className="w-full h-full object-cover" />
              : (client.type === 'juridica' ? <Building2 size={28} /> : <UserRound size={28} />)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 break-words">{client.name}</h2>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 shrink-0 border rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors">
                <Pencil size={14} /> Editar
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${client.type === 'juridica' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                {client.type === 'juridica' ? <Building2 size={11} /> : <UserRound size={11} />}
                {client.type === 'juridica' ? 'Jurídica' : 'Física'}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_META[client.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {STATUS_META[client.status]?.label ?? client.status}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-sm text-gray-600">
              {client.document && <p className="flex items-center gap-2"><FileText size={14} className="text-gray-400 shrink-0" /> {client.document}</p>}
              {client.email && <p className="flex items-center gap-2 break-all"><Mail size={14} className="text-gray-400 shrink-0" /> {client.email}</p>}
              {client.phone1 && <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400 shrink-0" /> {client.phone1}</p>}
              {client.phone2 && <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400 shrink-0" /> {client.phone2}</p>}
              {(client.address || client.city || client.state) && (
                <p className="flex items-start gap-2 sm:col-span-2"><MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  {[
                    [client.address, client.number].filter(Boolean).join(', '),
                    client.district, client.complement,
                    [client.city, client.state].filter(Boolean).join(' - '),
                    client.zip,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Financeiro */}
        {(client.billing_monthly != null || client.cost_monthly != null ||
          client.start_date || client.payment_day != null) && (
          <div className="mt-5 pt-4 border-t grid grid-cols-2 lg:grid-cols-4 gap-3">
            {client.billing_monthly != null && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><DollarSign size={12} /> Cobrança/mês</p>
                <p className="text-lg font-bold text-slate-700 mt-1">{brl(client.billing_monthly)}</p>
              </div>
            )}
            {client.cost_monthly != null && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Wallet size={12} /> Custo/mês</p>
                <p className="text-lg font-bold text-slate-700 mt-1">{brl(client.cost_monthly)}</p>
              </div>
            )}
            {(client.billing_monthly != null || client.cost_monthly != null) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><TrendingUp size={12} /> Resultado/mês</p>
                {(() => {
                  const net = (client.billing_monthly ?? 0) - (client.cost_monthly ?? 0)
                  return <p className={`text-lg font-bold mt-1 ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{brl(net)}</p>
                })()}
              </div>
            )}
            {(client.start_date || client.end_date || client.payment_day != null) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><CalendarDays size={12} /> Contrato</p>
                <p className="text-sm text-slate-700 mt-1">Início: {fmtDate(client.start_date)}</p>
                {client.end_date && <p className="text-sm text-slate-700">Término: {fmtDate(client.end_date)}</p>}
                <p className="text-sm text-slate-700">Pagamento: {client.payment_day != null ? `dia ${client.payment_day}` : '—'}</p>
              </div>
            )}
          </div>
        )}

        {/* Totais gerais */}
        {allPayments.length > 0 && (() => {
          const allPaidSum = allPayments.reduce((s, p) => s + (p.amount ?? 0), 0)
          const allCostSum = (client.cost_monthly ?? 0) * allPayments.length
          const allNet = allPaidSum - allCostSum
          return (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Total recebido</p>
                <p className="text-lg font-bold text-emerald-600 mt-1">{brl(allPaidSum)}</p>
                <p className="text-[11px] text-gray-400">{allPayments.length} meses pagos</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Total custo</p>
                <p className="text-lg font-bold text-slate-700 mt-1">{brl(allCostSum)}</p>
                <p className="text-[11px] text-gray-400">{allPayments.length} × {brl(client.cost_monthly)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Resultado total</p>
                <p className={`text-lg font-bold mt-1 ${allNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{brl(allNet)}</p>
                <p className="text-[11px] text-gray-400">recebido − custo</p>
              </div>
            </div>
          )
        })()}
      </section>

      {/* Cobranças mensais */}
      <section className="bg-white rounded-xl sm:rounded-2xl border shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="flex items-center gap-2 text-base sm:text-lg font-semibold text-slate-700">
            <CalendarDays size={18} className="text-brand-600" /> Cobranças
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-slate-700 tabular-nums w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {MONTHS.map((label, m) => {
            const period = `${year}-${pad(m + 1)}-01`
            const rec = payments.find(p => p.period === period)
            const dim = new Date(year, m + 1, 0).getDate()
            const due = new Date(year, m, Math.min(client.payment_day ?? 1, dim))

            // Antes do início ou depois do término do contrato → "não aderente".
            let beforeStart = false
            if (client.start_date) {
              const s = new Date(client.start_date + 'T00:00')
              beforeStart = year < s.getFullYear() || (year === s.getFullYear() && m < s.getMonth())
            }
            let afterEnd = false
            if (client.end_date) {
              const e = new Date(client.end_date + 'T00:00')
              afterEnd = year > e.getFullYear() || (year === e.getFullYear() && m > e.getMonth())
            }
            const today = new Date()
            const isFuture = year > today.getFullYear() || (year === today.getFullYear() && m > today.getMonth())
            const overdue = !rec?.paid && due < new Date(new Date().toDateString())

            const state =
              rec?.paid ? 'pago'
              : (beforeStart || afterEnd) ? 'naoaderente'
              : (client.status === 'cancelado' && isFuture) ? 'naoaderente'
              : client.status === 'pausado' ? 'pausado'
              : overdue ? 'atraso'
              : 'pendente'

            const styles: Record<string, string> = {
              pago: 'bg-emerald-50 border-emerald-200 text-emerald-700',
              atraso: 'bg-red-50 border-red-200 text-red-600',
              pendente: 'bg-orange-50 border-orange-200 text-orange-500',
              pausado: 'bg-sky-50 border-sky-200 text-sky-600',
              naoaderente: 'bg-gray-50 border-dashed border-gray-200 text-gray-300',
            }
            const labels: Record<string, string> = {
              pago: 'Pago', atraso: 'Em atraso', pendente: 'Pendente',
              pausado: 'Pausado', naoaderente: 'Não aderente',
            }
            const disabled = state === 'naoaderente'

            return (
              <button key={m} onClick={() => setPayMonth(m)} disabled={disabled}
                title={beforeStart ? 'Antes do início do contrato' : afterEnd ? 'Após o término do contrato' : (client.status === 'cancelado' && isFuture) ? 'Cliente cancelado' : 'Gerenciar cobrança do mês'}
                className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors ${styles[state]} ${disabled ? 'cursor-default' : 'hover:brightness-95'} disabled:opacity-100`}>
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-semibold">{label}</span>
                  {rec?.paid
                    ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white"><Check size={12} /></span>
                    : state !== 'naoaderente' && <span className="w-5 h-5 rounded-full border-2 border-current opacity-40" />}
                </div>
                <span className="text-[11px] font-medium">{labels[state]}</span>
                {state !== 'naoaderente' && <span className="text-[11px] opacity-70">{brl(rec?.amount ?? client.billing_monthly)}</span>}
                {rec?.note && <span className="text-[11px] opacity-60 flex items-center gap-1 truncate max-w-full"><StickyNote size={10} className="shrink-0" /> {rec.note}</span>}
              </button>
            )
          })}
        </div>

        {(() => {
          const paidCount = payments.filter(p => p.paid).length
          const paidSum = payments.filter(p => p.paid).reduce((s, p) => s + (p.amount ?? 0), 0)
          const costSum = (client.cost_monthly ?? 0) * paidCount
          const net = paidSum - costSum
          return (<>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Recebido em {year}</p>
                <p className="text-base font-bold text-emerald-600 mt-0.5">{brl(paidSum)}</p>
                <p className="text-[11px] text-gray-400">{paidCount} de 12 meses</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Custo em {year}</p>
                <p className="text-base font-bold text-slate-700 mt-0.5">{brl(costSum)}</p>
                <p className="text-[11px] text-gray-400">{paidCount} × {brl(client.cost_monthly)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Resultado em {year}</p>
                <p className={`text-base font-bold mt-0.5 ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{brl(net)}</p>
                <p className="text-[11px] text-gray-400">recebido − custo</p>
              </div>
            </div>
          </>)
        })()}
      </section>

      {/* Mídias do cliente */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="flex items-center gap-2 text-lg sm:text-xl font-semibold">
          <Images size={20} className="text-brand-600" /> Mídias deste cliente
          <span className="text-sm font-normal text-gray-400">({medias.length})</span>
        </h3>
        <button onClick={() => setAddMediaOpen(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shrink-0">
          <Plus size={16} /> Adicionar mídia
        </button>
      </div>

      {medias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed py-12 text-center">
          <Images size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">Nenhuma mídia vinculada a este cliente.</p>
          <button onClick={() => setAddMediaOpen(true)}
            className="inline-flex items-center gap-2 mt-3 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Adicionar mídia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {medias.map(m => {
            const src = thumb(m)
            const meta = TYPE_META[m.type] ?? { label: m.type, icon: null }
            return (
              <div key={m.id} className="bg-white border rounded-xl overflow-hidden group">
                <div className="aspect-video bg-gray-100 relative flex items-center justify-center overflow-hidden text-gray-400">
                  {src
                    ? <img src={src} alt={m.name} className="w-full h-full object-cover" loading="lazy" />
                    : (m.storage_path && m.type === 'video'
                      ? <video src={mediaUrl(m.storage_path)} className="w-full h-full object-cover" muted />
                      : meta.icon && <div className="scale-[2.2]">{meta.icon}</div>)}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditMedia(m)} title="Editar"
                      className="bg-white/95 text-gray-700 hover:bg-white p-2 sm:p-1.5 rounded-lg shadow-md sm:shadow">
                      <Pencil size={18} className="sm:hidden" /> <Pencil size={14} className="hidden sm:block" />
                    </button>
                    <button onClick={() => { if (confirm(`Remover a mídia "${m.name}"?`)) deleteMedia.mutate(m) }} title="Remover"
                      className="bg-red-600 text-white p-2 sm:p-1.5 rounded-lg shadow-md sm:shadow hover:bg-red-700">
                      <Trash2 size={18} className="sm:hidden" /> <Trash2 size={14} className="hidden sm:block" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium break-words">{m.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">{meta.icon} {meta.label}</span>
                    <span className="text-xs text-gray-400">{m.duration}s</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Modal de cobrança do mês (status pago, valor e observação) ───────────────
function PaymentModal({ clientId, year, month, rec, defaultAmount, paymentDay, onClose, onSaved }: {
  clientId: string
  year: number
  month: number
  rec: ClientPayment | null
  defaultAmount: number | null
  paymentDay: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [paid, setPaid] = useState(rec?.paid ?? false)
  const [amount, setAmount] = useState(rec?.amount != null ? String(rec.amount) : (defaultAmount != null ? String(defaultAmount) : ''))
  const [note, setNote] = useState(rec?.note ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const period = `${year}-${pad(month + 1)}-01`
      const dim = new Date(year, month + 1, 0).getDate()
      const day = Math.min(paymentDay ?? 1, dim)
      const amt = amount.trim() === '' ? null : parseFloat(amount.replace(',', '.'))
      const { error } = await supabase.from('client_payments').upsert({
        client_id: clientId,
        period,
        due_date: `${year}-${pad(month + 1)}-${pad(day)}`,
        amount: amt != null && isNaN(amt) ? null : amt,
        paid,
        paid_at: paid ? (rec?.paid_at ?? new Date().toISOString()) : null,
        note: note.trim() || null,
      }, { onConflict: 'client_id,period' })
      if (error) throw error
      onSaved()
    } catch (e) {
      alert('Erro ao salvar a cobrança: ' + (e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">Cobrança · {MONTHS[month]}/{year}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Pago toggle */}
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium">Pago</span>
            <button type="button" role="switch" aria-checked={paid} onClick={() => setPaid(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${paid ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${paid ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-sm font-medium mb-1">Valor pago</label>
            <div className="flex items-center w-full border rounded-lg px-3 text-sm bg-white focus-within:ring-2 focus-within:ring-brand-500">
              <span className="text-gray-400 mr-1 shrink-0">R$</span>
              <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0,00" className="flex-1 py-2 bg-transparent focus:outline-none min-w-0" />
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-sm font-medium mb-1">Observação</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Ex: pago via PIX, desconto combinado, etc."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-2xl justify-end">
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {saving && <Loader2 size={15} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

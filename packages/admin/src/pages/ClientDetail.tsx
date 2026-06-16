import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/spaces'
import { releaseAsset } from '../lib/assets'
import type { Client, Media } from '../lib/database.types'
import { youtubeId, MediaFormModal, removeMediaStorage } from './Media'
import ClientModal from '../components/ClientModal'
import {
  ChevronLeft, Pencil, Plus, Trash2, Building2, UserRound, Mail, Phone, MapPin, FileText,
  Image as ImageIcon, Film, Code, Clock, Cloud, Youtube, Radio, Quote, Images,
  DollarSign, Wallet, TrendingUp, CalendarDays,
} from 'lucide-react'

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : '—'

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
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mt-1 ${client.type === 'juridica' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
              {client.type === 'juridica' ? <Building2 size={11} /> : <UserRound size={11} />}
              {client.type === 'juridica' ? 'Jurídica' : 'Física'}
            </span>
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
        {(client.billing_monthly != null || client.billing_per_media != null ||
          client.cost_monthly != null || client.cost_per_media != null ||
          client.start_date || client.payment_day != null) && (
          <div className="mt-5 pt-4 border-t grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(client.billing_monthly != null || client.billing_per_media != null) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><DollarSign size={12} /> Cobrança</p>
                <p className="text-sm text-slate-700 mt-1">{brl(client.billing_monthly)} <span className="text-gray-400 text-xs">/mês</span></p>
                <p className="text-sm text-slate-700">{brl(client.billing_per_media)} <span className="text-gray-400 text-xs">/mídia</span></p>
              </div>
            )}
            {(client.cost_monthly != null || client.cost_per_media != null) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Wallet size={12} /> Custo operacional</p>
                <p className="text-sm text-slate-700 mt-1">{brl(client.cost_monthly)} <span className="text-gray-400 text-xs">/mês</span></p>
                <p className="text-sm text-slate-700">{brl(client.cost_per_media)} <span className="text-gray-400 text-xs">/mídia</span></p>
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
            {(client.start_date || client.payment_day != null) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><CalendarDays size={12} /> Contrato</p>
                <p className="text-sm text-slate-700 mt-1">Início: {fmtDate(client.start_date)}</p>
                <p className="text-sm text-slate-700">Pagamento: {client.payment_day != null ? `dia ${client.payment_day}` : '—'}</p>
              </div>
            )}
          </div>
        )}
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

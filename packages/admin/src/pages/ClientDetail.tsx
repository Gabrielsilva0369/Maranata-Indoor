import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mediaUrl } from '../lib/spaces'
import type { Client, Media } from '../lib/database.types'
import { youtubeId } from './Media'
import ClientModal from '../components/ClientModal'
import {
  ChevronLeft, Pencil, Building2, UserRound, Mail, Phone, MapPin, FileText,
  Image as ImageIcon, Film, Code, Clock, Cloud, Youtube, Radio, Quote, Images,
} from 'lucide-react'

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
  const [editing, setEditing] = useState(false)

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
      </section>

      {/* Mídias do cliente */}
      <h3 className="flex items-center gap-2 text-lg sm:text-xl font-semibold mb-4">
        <Images size={20} className="text-brand-600" /> Mídias deste cliente
        <span className="text-sm font-normal text-gray-400">({medias.length})</span>
      </h3>

      {medias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed py-12 text-center">
          <Images size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">Nenhuma mídia vinculada a este cliente.</p>
          <p className="text-xs text-gray-400 mt-1">Vincule na tela de Mídias, no campo "Cliente".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {medias.map(m => {
            const src = thumb(m)
            const meta = TYPE_META[m.type] ?? { label: m.type, icon: null }
            return (
              <div key={m.id} className="bg-white border rounded-xl overflow-hidden">
                <div className="aspect-video bg-gray-100 relative flex items-center justify-center overflow-hidden text-gray-400">
                  {src
                    ? <img src={src} alt={m.name} className="w-full h-full object-cover" loading="lazy" />
                    : (m.storage_path && m.type === 'video'
                      ? <video src={mediaUrl(m.storage_path)} className="w-full h-full object-cover" muted />
                      : meta.icon && <div className="scale-[2.2]">{meta.icon}</div>)}
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

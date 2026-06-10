import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, closestCorners, rectIntersection, pointerWithin,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import type { PlaylistItem, Media, RssFeed, PlaylistItemFooter, ItemSchedule, MediaFolder } from '../lib/database.types'
import { GripVertical, Copy, Trash2, ChevronLeft, Image, Film, Code, Rss, Clock, Newspaper, Volume2, VolumeX, Volume1, PanelBottom, PanelBottomClose, PanelBottomOpen, Folder, ChevronDown, ChevronRight, CalendarClock, X, Plus, Eye, Radio, Cloud } from 'lucide-react'
import { youtubeId } from './Media'

type RichItem = PlaylistItem & { media?: Media | null; rss_feed?: RssFeed | null }

// Duração efetiva de um item, em segundos. RSS = tempo por notícia × nº de notícias.
function itemSeconds(it: RichItem): number {
  const d = it.duration_override ?? it.media?.duration ?? 10
  return it.rss_feed ? d * (it.rss_article_count ?? 5) : d
}

// "4min 30s" / "1h 5min" / "45s"
function formatDuration(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.round(total % 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return s > 0 ? `${m}min ${s}s` : `${m}min`
  return `${s}s`
}

const MEDIA_ICONS: Record<string, React.ReactNode> = {
  image: <Image size={12} />, video: <Film size={12} />, html: <Code size={12} />,
}

// ── Toggle de rodapé por item ─────────────────────────────────────────────────
function FooterItemControl({ value, onChange }: {
  value: PlaylistItemFooter | null
  onChange: (v: PlaylistItemFooter | null) => void
}) {
  const state = value === null ? 'default' : value.enabled === false ? 'off' : 'custom'
  const cycle = () => {
    if (state === 'default') onChange({ enabled: false })
    else if (state === 'off') onChange({ enabled: true, text: '' })
    else onChange(null)
  }
  if (state === 'off') return (
    <button onClick={cycle} title="Rodapé desativado (clique para mudar)"
      className="p-1 rounded text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
      <PanelBottomClose size={13} />
    </button>
  )
  if (state === 'custom') return (
    <button onClick={cycle} title="Rodapé com texto personalizado (clique para mudar)"
      className="p-1 rounded text-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors">
      <PanelBottomOpen size={13} />
    </button>
  )
  return (
    <button onClick={cycle} title="Rodapé padrão da tela (clique para mudar)"
      className="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
      <PanelBottom size={13} />
    </button>
  )
}

// ── Campo numérico editável inline ────────────────────────────────────────────
function InlineNumber({ value, onSave, min = 1, max = 9999, suffix = '' }: {
  value: number; onSave: (v: number) => void; min?: number; max?: number; suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    setEditing(false)
    const clamped = Math.min(max, Math.max(min, draft))
    if (clamped !== value) onSave(clamped)
  }

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={e => setDraft(Number(e.target.value))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-14 border border-brand-400 rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-400"
        onClick={e => e.stopPropagation()}
      />
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
      title="Clique para editar"
      className="flex items-center gap-0.5 text-xs text-gray-500 hover:text-brand-600 hover:bg-brand-50 px-2 py-0.5 rounded transition-colors font-medium tabular-nums"
    >
      {value}{suffix}
    </button>
  )
}

// ── Cards arrastáveis da biblioteca ───────────────────────────────────────────
function AvailableMediaCard({ media, onAdd }: { media: Media; onAdd?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `avail::${media.id}`, data: { kind: 'media', media },
  })
  return (
    <div ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2.5 select-none hover:border-brand-400 hover:shadow-sm transition-all group/card"
    >
      <span {...attributes} {...listeners} className="text-gray-400 shrink-0 cursor-grab active:cursor-grabbing">{MEDIA_ICONS[media.type]}</span>
      <span {...attributes} {...listeners} className="text-sm font-medium truncate flex-1 cursor-grab active:cursor-grabbing">{media.name}</span>
      <span className="text-xs text-gray-400 shrink-0">{media.duration}s</span>
      {onAdd && (
        <button onClick={onAdd} title="Adicionar à playlist"
          className="p-1 rounded text-gray-300 hover:text-brand-600 hover:bg-brand-50 transition-colors opacity-0 group-hover/card:opacity-100 shrink-0"
        ><Plus size={14} /></button>
      )}
    </div>
  )
}

function AvailableRssCard({ feed, onAdd }: { feed: RssFeed; onAdd?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `rss::${feed.id}`, data: { kind: 'rss', feed },
  })
  return (
    <div ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2.5 select-none hover:border-orange-400 hover:shadow-sm transition-all group/card"
    >
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0"><Rss size={12} className="text-orange-400" /></span>
      <span {...attributes} {...listeners} className="text-sm font-medium truncate flex-1 cursor-grab active:cursor-grabbing">{feed.name}</span>
      <span className="text-xs text-gray-400 shrink-0">RSS</span>
      {onAdd && (
        <button onClick={onAdd} title="Adicionar à playlist"
          className="p-1 rounded text-gray-300 hover:text-orange-500 hover:bg-orange-50 transition-colors opacity-0 group-hover/card:opacity-100 shrink-0"
        ><Plus size={14} /></button>
      )}
    </div>
  )
}

// ── Toggle de áudio (3 estados: herdar / com som / mudo) ─────────────────────
function AudioToggle({ value, onChange }: {
  value: boolean | null
  onChange: (next: boolean | null) => void
}) {
  // null → true → false → null
  const cycle = () => {
    if (value === null) onChange(true)
    else if (value === true) onChange(false)
    else onChange(null)
  }

  if (value === true) return (
    <button onClick={cycle} title="Com som (clique para mudar)" className="p-1 rounded text-green-500 bg-green-50 hover:bg-green-100 transition-colors">
      <Volume2 size={13} />
    </button>
  )
  if (value === false) return (
    <button onClick={cycle} title="Sem som (clique para mudar)" className="p-1 rounded text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
      <VolumeX size={13} />
    </button>
  )
  return (
    <button onClick={cycle} title="Herdando configuração da tela (clique para definir)" className="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
      <Volume1 size={13} />
    </button>
  )
}

// ── Modal de agendamento ──────────────────────────────────────────────────────
const WEEKDAYS = [
  { v: 0, l: 'Dom' }, { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
  { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' },
]

function ScheduleModal({ item, onClose, onSave }: {
  item: RichItem
  onClose: () => void
  onSave: (s: ItemSchedule | null) => void
}) {
  const init = item.schedule ?? { enabled: true, start: '08:00', end: '18:00', days: [], date_start: null, date_end: null }
  const [enabled, setEnabled] = useState(init.enabled)
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)
  const [days, setDays] = useState<number[]>(init.days ?? [])
  const [dateStart, setDateStart] = useState(init.date_start ?? '')
  const [dateEnd, setDateEnd] = useState(init.date_end ?? '')

  const toggleDay = (d: number) =>
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())

  const label = item.rss_feed?.name ?? item.media?.name ?? 'Item'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-semibold">Agendamento</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{label}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium">Agendar exibição</p>
              <p className="text-xs text-gray-400">Só aparece no horário definido</p>
            </div>
            <button onClick={() => setEnabled(v => !v)}
              className={`relative w-14 h-8 rounded-full transition-colors ${enabled ? 'bg-brand-600' : 'bg-gray-300'}`}>
              <span style={{ transform: enabled ? 'translateX(28px)' : 'translateX(2px)' }}
                className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform" />
            </button>
          </div>

          <div className={enabled ? '' : 'opacity-40 pointer-events-none'}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Início</label>
                <input type="time" value={start} onChange={e => setStart(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fim</label>
                <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Dias da semana</label>
              <div className="flex gap-1.5">
                {WEEKDAYS.map(d => (
                  <button key={d.v} onClick={() => toggleDay(d.v)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${days.includes(d.v) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {days.length === 0 ? 'Nenhum selecionado = todos os dias' : `${days.length} dia(s) selecionado(s)`}
              </p>
            </div>

            {/* Intervalo de datas */}
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Período <span className="text-gray-400 font-normal">(opcional)</span></label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">De</label>
                  <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Até</label>
                  <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { const t = new Date().toISOString().slice(0,10); setDateStart(t); setDateEnd(t) }}
                  className="text-xs text-brand-600 hover:underline">Só hoje</button>
                {(dateStart || dateEnd) && (
                  <button onClick={() => { setDateStart(''); setDateEnd('') }}
                    className="text-xs text-gray-400 hover:underline">Limpar período</button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Vazio = sem limite de data (vale sempre).</p>
            </div>

            <p className="text-xs text-gray-500 mt-4 bg-blue-50 rounded-lg p-3">
              {start > end
                ? `Exibe das ${start} até ${end} do dia seguinte (cruza a meia-noite).`
                : `Exibe diariamente das ${start} às ${end}.`}
              {dateStart && dateEnd && dateStart === dateEnd && ` Apenas em ${new Date(dateStart + 'T00:00').toLocaleDateString('pt-BR')}.`}
              {dateStart && dateEnd && dateStart !== dateEnd && ` De ${new Date(dateStart + 'T00:00').toLocaleDateString('pt-BR')} a ${new Date(dateEnd + 'T00:00').toLocaleDateString('pt-BR')}.`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          {item.schedule && (
            <button onClick={() => onSave(null)}
              className="border border-red-200 text-red-600 hover:bg-red-50 rounded-lg px-4 py-2 text-sm transition-colors">
              Remover
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => onSave({ enabled, start, end, days, date_start: dateStart || null, date_end: dateEnd || null })}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de preview da mídia ─────────────────────────────────────────────────
function PreviewModal({ item, onClose }: { item: RichItem; onClose: () => void }) {
  const m = item.media
  const feed = item.rss_feed
  const pub = (p: string) => supabase.storage.from('media').getPublicUrl(p).data.publicUrl

  let body: React.ReactNode = <p className="text-gray-400 text-sm">Sem preview disponível.</p>

  if (feed) {
    body = (
      <div className="text-center text-gray-300 py-12">
        <Rss size={40} className="mx-auto mb-3 text-orange-400" />
        <p className="font-medium">{feed.name}</p>
        <p className="text-xs text-gray-500 mt-1">As notícias são montadas no player (texto + imagem).</p>
      </div>
    )
  } else if (m) {
    if (m.type === 'image' && m.storage_path) {
      body = <img src={pub(m.storage_path)} alt={m.name} className="max-h-[70vh] max-w-full object-contain mx-auto rounded" />
    } else if (m.type === 'video' && m.storage_path) {
      body = <video src={pub(m.storage_path)} controls autoPlay muted playsInline className="max-h-[70vh] max-w-full mx-auto rounded bg-black" />
    } else if (m.type === 'youtube' && m.url) {
      const id = youtubeId(m.url)
      body = id
        ? <iframe src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1`} className="w-full aspect-video rounded" allow="autoplay; encrypted-media" allowFullScreen />
        : <p className="text-red-400 text-sm">URL de YouTube inválida.</p>
    } else if (m.type === 'html') {
      body = m.url
        ? <iframe src={m.url} className="w-full h-[70vh] rounded bg-white" />
        : <iframe srcDoc={m.html_content ?? ''} className="w-full h-[70vh] rounded bg-white" />
    } else if (m.type === 'stream' && m.url) {
      body = (
        <div className="text-center text-gray-300 py-12">
          <Radio size={40} className="mx-auto mb-3 text-blue-400" />
          <p className="font-medium">Stream ao vivo</p>
          <p className="text-xs text-gray-500 mt-1 break-all px-6">{m.url}</p>
          <p className="text-xs text-gray-500 mt-2">O preview de stream HLS é feito direto no player.</p>
        </div>
      )
    } else if (m.type === 'clock') {
      body = <div className="text-center text-gray-300 py-12"><Clock size={40} className="mx-auto mb-3 text-brand-400" /><p className="font-medium">Relógio</p><p className="text-xs text-gray-500 mt-1">Gerado no player.</p></div>
    } else if (m.type === 'weather') {
      body = <div className="text-center text-gray-300 py-12"><Cloud size={40} className="mx-auto mb-3 text-sky-400" /><p className="font-medium">Clima</p><p className="text-xs text-gray-500 mt-1">Gerado no player.</p></div>
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h3 className="text-white font-semibold truncate">{feed?.name ?? m?.name ?? 'Preview'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 bg-black flex items-center justify-center min-h-[240px]">{body}</div>
      </div>
    </div>
  )
}

// ── Modal de seleção de notícias (RSS) ────────────────────────────────────────
function ArticleSelectionModal({ item, onClose, onSave }: {
  item: RichItem
  onClose: () => void
  onSave: (links: string[]) => void
}) {
  const feedId = item.rss_feed_id
  const feedName = item.rss_feed?.name ?? 'Feed'
  const currentLinks = item.rss_article_links ?? []

  const { data: articles = [] } = useQuery<{ id: string; link: string | null; title: string; pub_date: string | null }[]>({
    queryKey: ['rss-articles-select', feedId],
    queryFn: async () => {
      if (!feedId) return []
      const { data, error } = await supabase
        .from('rss_articles')
        .select('id, link, title, pub_date')
        .eq('feed_id', feedId)
        .eq('active', true)
        .order('pub_date', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
    enabled: !!feedId,
  })

  const [selected, setSelected] = useState<Set<string>>(new Set(currentLinks.filter(l => !!l)))

  const toggle = (link: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(link)) next.delete(link)
      else next.add(link)
      return next
    })
  }

  const selectAll = () => {
    const all = articles.filter(a => a.link).map(a => a.link as string)
    setSelected(new Set(all))
  }

  const clearAll = () => {
    setSelected(new Set())
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-semibold">Escolher notícias</h3>
            <p className="text-xs text-gray-400 mt-0.5">{feedName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {articles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma notícia disponível. Sincronize o feed primeiro.</p>
          ) : (
            articles.map(a => (
              <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={a.link ? selected.has(a.link) : false}
                  onChange={() => a.link && toggle(a.link)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 line-clamp-2">{a.title}</p>
                  {a.pub_date && (
                    <p className="text-xs text-gray-400">{new Date(a.pub_date).toLocaleString('pt-BR')}</p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <div className="flex gap-1.5">
            {articles.length > 0 && (
              <>
                <button onClick={selectAll}
                  className="text-xs text-brand-600 hover:underline">Marcar tudo</button>
                {selected.size > 0 && (
                  <>
                    <span className="text-xs text-gray-300">·</span>
                    <button onClick={clearAll}
                      className="text-xs text-gray-400 hover:underline">Limpar</button>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => onSave(Array.from(selected))}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item sortável da playlist ─────────────────────────────────────────────────
function PlaylistCard({ item, index, onDelete, onDuplicate, onUpdateDuration, onUpdateArticleCount, onUpdateAudio, onUpdateFooter, onOpenSchedule, onOpenArticleSelection, onPreview }: {
  item: RichItem
  index: number
  onDelete: () => void
  onDuplicate: () => void
  onUpdateDuration: (seconds: number) => void
  onUpdateArticleCount: (count: number) => void
  onUpdateAudio: (value: boolean | null) => void
  onUpdateFooter: (value: PlaylistItemFooter | null) => void
  onOpenSchedule: () => void
  onOpenArticleSelection: () => void
  onPreview: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const isRss   = !!item.rss_feed
  const isVideo = item.media?.type === 'video'
  const label   = isRss ? item.rss_feed!.name : (item.media?.name ?? '—')
  const icon    = isRss ? <Rss size={12} className="text-orange-400" /> : MEDIA_ICONS[item.media?.type ?? '']

  const duration     = item.duration_override ?? item.media?.duration ?? 10
  const articleCount = item.rss_article_count ?? 5

  return (
    <>
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2.5 group hover:border-gray-300"
    >
      {/* índice */}
      <span className="text-xs text-gray-300 w-5 shrink-0 text-right">{index + 1}</span>

      {/* handle */}
      <button {...attributes} {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
      ><GripVertical size={16} /></button>

      {/* ícone + nome */}
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="text-sm font-medium truncate flex-1 min-w-0">{label}</span>

      {/* toggle de áudio (só para vídeo) */}
      {isVideo && (
        <AudioToggle value={item.audio_enabled ?? null} onChange={onUpdateAudio} />
      )}

      {/* controles de tempo */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isRss && (
          <>
            <Newspaper size={11} className="text-gray-300" />
            <InlineNumber
              value={articleCount}
              onSave={onUpdateArticleCount}
              min={1}
              max={50}
              suffix=" notícias"
            />
            <button onClick={onOpenArticleSelection} title="Escolher quais notícias exibir"
              className="text-xs px-1.5 py-0.5 rounded border border-gray-200 hover:border-orange-400 text-gray-500 hover:text-orange-600 transition-colors">
              Escolher
            </button>
            <span className="text-gray-200 text-xs">·</span>
          </>
        )}
        <Clock size={11} className="text-gray-300" />
        <InlineNumber
          value={duration}
          onSave={onUpdateDuration}
          min={1}
          max={3600}
          suffix="s"
        />
      </div>

      {/* toggle rodapé */}
      <FooterItemControl value={item.footer_override ?? null} onChange={onUpdateFooter} />

      {/* agendamento */}
      <button onClick={onOpenSchedule}
        title={item.schedule?.enabled ? 'Agendado (clique para editar)' : 'Agendar exibição'}
        className={`p-1 rounded transition-colors shrink-0 ${item.schedule?.enabled ? 'text-purple-600 bg-purple-50 hover:bg-purple-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
        <CalendarClock size={13} />
      </button>

      {/* ações */}
      <button onClick={onPreview} title="Pré-visualizar"
        className="text-gray-300 hover:text-indigo-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
      ><Eye size={14} /></button>
      <button onClick={onDuplicate} title="Duplicar"
        className="text-gray-300 hover:text-brand-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
      ><Copy size={14} /></button>
      <button onClick={onDelete} title="Remover"
        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
      ><Trash2 size={14} /></button>
    </div>

    {/* Texto personalizado do rodapé (inline quando ativo) */}
    {item.footer_override?.enabled === true && (
      <div className="flex items-center gap-2 px-3 pb-2 -mt-1">
        <PanelBottomOpen size={11} className="text-blue-400 shrink-0 ml-12" />
        <input
          value={item.footer_override.text ?? ''}
          onChange={e => onUpdateFooter({ enabled: true, text: e.target.value })}
          placeholder="Texto personalizado do rodapé..."
          className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    )}

    {/* Indicador de agendamento */}
    {item.schedule?.enabled && (
      <div className="flex items-center gap-1.5 px-3 pb-2 -mt-1 ml-12 text-xs text-purple-600 flex-wrap">
        <CalendarClock size={11} />
        {item.schedule.start}–{item.schedule.end}
        {item.schedule.days && item.schedule.days.length > 0 && (
          <span className="text-gray-400">· {item.schedule.days.map(d => WEEKDAYS[d].l).join(', ')}</span>
        )}
        {(item.schedule.date_start || item.schedule.date_end) && (
          <span className="text-gray-400">
            · {item.schedule.date_start === item.schedule.date_end && item.schedule.date_start
              ? new Date(item.schedule.date_start + 'T00:00').toLocaleDateString('pt-BR')
              : `${item.schedule.date_start ? new Date(item.schedule.date_start + 'T00:00').toLocaleDateString('pt-BR') : '...'} → ${item.schedule.date_end ? new Date(item.schedule.date_end + 'T00:00').toLocaleDateString('pt-BR') : '...'}`}
          </span>
        )}
      </div>
    )}
    </>
  )
}

// ── Overlay de drag ───────────────────────────────────────────────────────────
function DragPreview({ label, type }: { label: string; type: 'media' | 'rss' }) {
  return (
    <div className={`flex items-center gap-2 bg-white border-2 rounded-lg px-3 py-2.5 shadow-xl opacity-95 pointer-events-none ${type === 'rss' ? 'border-orange-400' : 'border-brand-400'}`}>
      {type === 'rss' ? <Rss size={12} className="text-orange-400" /> : <Image size={12} />}
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

// ── Editor principal ──────────────────────────────────────────────────────────
export default function PlaylistEditor() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'media' | 'rss'>('media')
  const [activeInfo, setActiveInfo] = useState<{ label: string; type: 'media' | 'rss' } | null>(null)
  const [localItems, setLocalItems] = useState<RichItem[]>([])
  const [scheduleItem, setScheduleItem] = useState<RichItem | null>(null)
  const [previewItem, setPreviewItem] = useState<RichItem | null>(null)
  const [articleSelectionItem, setArticleSelectionItem] = useState<RichItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Estratégia de colisão customizada: usa pointerWithin para detectar
  // droppables de painel (playlist-drop, avail-drop) com prioridade,
  // e closestCorners para reordenar itens existentes.
  const customCollision: CollisionDetection = useCallback((args) => {
    // Primeiro tenta pointerWithin — funciona bem para áreas grandes
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      // Se o pointer está sobre um droppable de painel, prioriza
      const panelHit = pointerCollisions.find(
        c => c.id === 'playlist-drop' || c.id === 'avail-drop'
      )
      // Se o pointer está sobre um item da playlist, usa closestCorners para precisão
      const itemHit = pointerCollisions.find(
        c => localItems.some(i => i.id === c.id)
      )
      if (itemHit) return [itemHit]
      if (panelHit) return [panelHit]
      return pointerCollisions
    }
    // Fallback: rectIntersection para áreas que pointerWithin não pegou
    const rectCollisions = rectIntersection(args)
    if (rectCollisions.length > 0) return rectCollisions
    // Último fallback: closestCorners
    return closestCorners(args)
  }, [localItems])

  const { data: playlist } = useQuery({
    queryKey: ['playlist', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('playlists').select('*').eq('id', id!).single()
      if (error) throw error; return data
    },
  })

  const { data: serverItems = [] } = useQuery<RichItem[]>({
    queryKey: ['playlist-items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlist_items')
        .select('*, media(*), rss_feed:rss_feeds(*)')
        .eq('playlist_id', id!)
        .order('order_index')
      if (error) throw error
      return data as RichItem[]
    },
  })

  const { data: allMedia = [] } = useQuery<Media[]>({
    queryKey: ['media'],
    queryFn: async () => {
      const { data, error } = await supabase.from('media').select('*').order('name')
      if (error) throw error; return data
    },
  })

  const { data: allFeeds = [] } = useQuery<RssFeed[]>({
    queryKey: ['rss-feeds'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rss_feeds').select('*').order('name')
      if (error) throw error; return data
    },
  })

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ['media-folders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('media_folders').select('*').order('name')
      if (error) throw error; return data
    },
  })

  // Pastas abertas/fechadas no painel
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const toggleFolder = (id: string) => setOpenFolders(p => ({ ...p, [id]: !p[id] }))

  useEffect(() => { setLocalItems(serverItems) }, [serverItems])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addItem = useMutation({
    mutationFn: async ({ mediaId, feedId, insertAt }: { mediaId?: string; feedId?: string; insertAt: number }) => {
      const { error } = await supabase.from('playlist_items').insert({
        playlist_id: id!,
        media_id: mediaId ?? null,
        rss_feed_id: feedId ?? null,
        order_index: insertAt,
        rss_article_count: feedId ? 5 : null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlist-items', id] }),
  })

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('playlist_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlist-items', id] }),
  })

  const updateItem = useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: string; patch: Partial<PlaylistItem> }) => {
      const { error } = await supabase.from('playlist_items').update(patch).eq('id', itemId)
      if (error) throw error
    },
  })

  const syncOrder = useCallback(async (items: RichItem[]) => {
    await Promise.all(items.map((item, i) =>
      supabase.from('playlist_items').update({ order_index: i }).eq('id', item.id)
    ))
    qc.invalidateQueries({ queryKey: ['playlist-items', id] })
  }, [id, qc])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const optimisticAdd = (mediaId: string | undefined, feedId: string | undefined, insertAt: number) => {
    const media = mediaId ? allMedia.find(m => m.id === mediaId) : undefined
    const feed  = feedId  ? allFeeds.find(f => f.id === feedId)  : undefined
    const temp: RichItem = {
      id: `temp::${Date.now()}`,
      playlist_id: id!, media_id: mediaId ?? null, rss_feed_id: feedId ?? null,
      order_index: insertAt, duration_override: null,
      rss_article_count: feedId ? 5 : null,
      rss_article_links: null,
      audio_enabled: null,
      footer_override: null,
      schedule: null,
      media: media ?? null, rss_feed: feed ?? null,
    }
    setLocalItems(prev => {
      const next = [...prev]; next.splice(insertAt, 0, temp); return next
    })
    addItem.mutate({ mediaId, feedId, insertAt })
  }

  const handleRemove = (itemId: string) => {
    setLocalItems(prev => prev.filter(i => i.id !== itemId))
    if (!itemId.startsWith('temp::')) removeItem.mutate(itemId)
  }

  const handleDuplicate = (item: RichItem) => {
    const index = localItems.findIndex(i => i.id === item.id)
    optimisticAdd(item.media_id ?? undefined, item.rss_feed_id ?? undefined, index + 1)
  }

  const handleUpdateDuration = (item: RichItem, seconds: number) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, duration_override: seconds } : i))
    if (!item.id.startsWith('temp::')) {
      updateItem.mutate({ itemId: item.id, patch: { duration_override: seconds } })
    }
  }

  const handleUpdateArticleCount = (item: RichItem, count: number) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, rss_article_count: count } : i))
    if (!item.id.startsWith('temp::')) {
      updateItem.mutate({ itemId: item.id, patch: { rss_article_count: count } })
    }
  }

  const handleUpdateAudio = (item: RichItem, value: boolean | null) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, audio_enabled: value } : i))
    if (!item.id.startsWith('temp::')) {
      updateItem.mutate({ itemId: item.id, patch: { audio_enabled: value } })
    }
  }

  const handleUpdateFooter = (item: RichItem, value: PlaylistItemFooter | null) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, footer_override: value } : i))
    if (!item.id.startsWith('temp::')) {
      updateItem.mutate({ itemId: item.id, patch: { footer_override: value } })
    }
  }

  const handleUpdateSchedule = (item: RichItem, value: ItemSchedule | null) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, schedule: value } : i))
    if (!item.id.startsWith('temp::')) {
      updateItem.mutate({ itemId: item.id, patch: { schedule: value } })
    }
    setScheduleItem(null)
  }

  // ── DnD ───────────────────────────────────────────────────────────────────
  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeId = String(active.id)
    if (activeId.startsWith('avail::')) {
      const media = active.data.current?.media as Media
      setActiveInfo({ label: media.name, type: 'media' })
    } else if (activeId.startsWith('rss::')) {
      const feed = active.data.current?.feed as RssFeed
      setActiveInfo({ label: feed.name, type: 'rss' })
    } else {
      const item = localItems.find(i => i.id === activeId)
      if (item) setActiveInfo({ label: item.rss_feed?.name ?? item.media?.name ?? '', type: item.rss_feed ? 'rss' : 'media' })
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveInfo(null)
    if (!over) return
    const activeId = String(active.id)
    const overId   = String(over.id)

    if (activeId.startsWith('avail::') || activeId.startsWith('rss::')) {
      const onItem  = localItems.some(i => i.id === overId)
      const onPanel = overId === 'playlist-drop'
      if (!onItem && !onPanel) return
      const insertAt = onItem ? localItems.findIndex(i => i.id === overId) : localItems.length
      if (activeId.startsWith('avail::')) optimisticAdd(activeId.slice(7), undefined, insertAt)
      else optimisticAdd(undefined, activeId.slice(5), insertAt)
      return
    }

    if (overId === 'avail-drop') { handleRemove(activeId); return }

    if (localItems.some(i => i.id === overId) && activeId !== overId) {
      const oldIdx = localItems.findIndex(i => i.id === activeId)
      const newIdx = localItems.findIndex(i => i.id === overId)
      const reordered = arrayMove(localItems, oldIdx, newIdx)
      setLocalItems(reordered)
      syncOrder(reordered)
    }
  }

  const { setNodeRef: availRef, isOver: isOverAvail } = useDroppable({ id: 'avail-drop' })
  const { setNodeRef: plRef,   isOver: isOverPl    } = useDroppable({ id: 'playlist-drop' })

  return (
    <div className="p-6 flex flex-col h-full overflow-hidden">
      <button onClick={() => navigate('/playlists')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 w-fit"
      >
        <ChevronLeft size={16} /> Voltar
      </button>
      <h2 className="text-xl font-bold mb-4">{playlist?.name ?? 'Playlist'}</h2>

      <DndContext sensors={sensors} collisionDetection={customCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-5 flex-1 min-h-0">

          {/* Esquerda: Biblioteca */}
          <div className="flex flex-col w-72 shrink-0">
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-lg p-1">
              {(['media', 'rss'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${tab === t ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t === 'media' ? 'Mídias' : 'RSS'}
                </button>
              ))}
            </div>
            <div ref={availRef}
              className={`flex-1 overflow-y-auto rounded-xl border-2 border-dashed p-3 space-y-2 transition-colors ${isOverAvail ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50/80'}`}
            >
              {tab === 'media' && (
                <>
                  {/* Pastas colapsáveis */}
                  {folders.map(folder => {
                    const items = allMedia.filter(m => m.folder_id === folder.id)
                    if (items.length === 0) return null
                    const open = openFolders[folder.id] ?? false
                    return (
                      <div key={folder.id}>
                        <button onClick={() => toggleFolder(folder.id)}
                          className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <Folder size={13} className="text-amber-500" />
                          <span className="flex-1 text-left">{folder.name}</span>
                          <span className="text-gray-400 font-normal">{items.length}</span>
                        </button>
                        {open && (
                          <div className="pl-3 mt-1 space-y-2">
                            {items.map(m => <AvailableMediaCard key={m.id} media={m} onAdd={() => optimisticAdd(m.id, undefined, localItems.length)} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Sem pasta */}
                  {(() => {
                    const items = allMedia.filter(m => !m.folder_id)
                    if (items.length === 0) return null
                    const open = openFolders['__none__'] ?? true
                    return (
                      <div>
                        <button onClick={() => toggleFolder('__none__')}
                          className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span className="flex-1 text-left">Sem pasta</span>
                          <span className="text-gray-400 font-normal">{items.length}</span>
                        </button>
                        {open && (
                          <div className="pl-3 mt-1 space-y-2">
                            {items.map(m => <AvailableMediaCard key={m.id} media={m} onAdd={() => optimisticAdd(m.id, undefined, localItems.length)} />)}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {allMedia.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Sem mídias.</p>}
                </>
              )}
              {tab === 'rss' && (
                <>
                  {allFeeds.map(f => <AvailableRssCard key={f.id} feed={f} onAdd={() => optimisticAdd(undefined, f.id, localItems.length)} />)}
                  {allFeeds.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-8">Sem feeds RSS.<br/>Cadastre em <span className="text-brand-500">RSS</span>.</p>
                  )}
                </>
              )}
              {isOverAvail && <p className="text-xs text-red-400 text-center pt-2">Solte para remover</p>}
            </div>
          </div>

          {/* Direita: Playlist */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Playlist atual · {localItems.length} {localItems.length === 1 ? 'item' : 'itens'}
                </p>
                {localItems.length > 0 && (
                  <span title="Duração total de uma volta completa da playlist"
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                    <Clock size={11} /> {formatDuration(localItems.reduce((sum, it) => sum + itemSeconds(it), 0))}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">Clique no tempo para editar</p>
            </div>
            <div ref={plRef}
              className={`flex-1 overflow-y-auto rounded-xl border-2 border-dashed p-3 transition-colors ${isOverPl ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-gray-50/80'}`}
            >
              <SortableContext items={localItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {localItems.map((item, idx) => (
                    <PlaylistCard
                      key={item.id}
                      item={item}
                      index={idx}
                      onDelete={() => handleRemove(item.id)}
                      onDuplicate={() => handleDuplicate(item)}
                      onUpdateDuration={s => handleUpdateDuration(item, s)}
                      onUpdateArticleCount={c => handleUpdateArticleCount(item, c)}
                      onUpdateAudio={v => handleUpdateAudio(item, v)}
                      onUpdateFooter={v => handleUpdateFooter(item, v)}
                      onOpenSchedule={() => setScheduleItem(item)}
                      onOpenArticleSelection={() => setArticleSelectionItem(item)}
                      onPreview={() => setPreviewItem(item)}
                    />
                  ))}
                </div>
              </SortableContext>
              {localItems.length === 0 && (
                <div className="flex items-center justify-center h-40">
                  <p className="text-sm text-gray-400">Arraste mídias ou RSS feeds aqui</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeInfo && <DragPreview label={activeInfo.label} type={activeInfo.type} />}
        </DragOverlay>
      </DndContext>

      {scheduleItem && (
        <ScheduleModal
          item={scheduleItem}
          onClose={() => setScheduleItem(null)}
          onSave={s => handleUpdateSchedule(scheduleItem, s)}
        />
      )}

      {previewItem && (
        <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {articleSelectionItem && (
        <ArticleSelectionModal
          item={articleSelectionItem}
          onClose={() => setArticleSelectionItem(null)}
          onSave={links => {
            setLocalItems(prev => prev.map(i => i.id === articleSelectionItem.id ? { ...i, rss_article_links: links } : i))
            updateItem.mutate({ itemId: articleSelectionItem.id, patch: { rss_article_links: links } })
            setArticleSelectionItem(null)
          }}
        />
      )}
    </div>
  )
}

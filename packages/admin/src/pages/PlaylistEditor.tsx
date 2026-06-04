import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import type { PlaylistItem, Media, RssFeed, PlaylistItemFooter } from '../lib/database.types'
import { GripVertical, Copy, Trash2, ChevronLeft, Image, Film, Code, Rss, Clock, Newspaper, Volume2, VolumeX, Volume1, PanelBottom, PanelBottomClose, PanelBottomOpen } from 'lucide-react'

type RichItem = PlaylistItem & { media?: Media | null; rss_feed?: RssFeed | null }

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
function AvailableMediaCard({ media }: { media: Media }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `avail::${media.id}`, data: { kind: 'media', media },
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none hover:border-brand-400 hover:shadow-sm transition-all"
    >
      <span className="text-gray-400 shrink-0">{MEDIA_ICONS[media.type]}</span>
      <span className="text-sm font-medium truncate flex-1">{media.name}</span>
      <span className="text-xs text-gray-400 shrink-0">{media.duration}s</span>
    </div>
  )
}

function AvailableRssCard({ feed }: { feed: RssFeed }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `rss::${feed.id}`, data: { kind: 'rss', feed },
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none hover:border-orange-400 hover:shadow-sm transition-all"
    >
      <Rss size={12} className="text-orange-400 shrink-0" />
      <span className="text-sm font-medium truncate flex-1">{feed.name}</span>
      <span className="text-xs text-gray-400 shrink-0">RSS</span>
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

// ── Item sortável da playlist ─────────────────────────────────────────────────
function PlaylistCard({ item, index, onDelete, onDuplicate, onUpdateDuration, onUpdateArticleCount, onUpdateAudio, onUpdateFooter }: {
  item: RichItem
  index: number
  onDelete: () => void
  onDuplicate: () => void
  onUpdateDuration: (seconds: number) => void
  onUpdateArticleCount: (count: number) => void
  onUpdateAudio: (value: boolean | null) => void
  onUpdateFooter: (value: PlaylistItemFooter | null) => void
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
      <div className="flex items-center gap-1 shrink-0">
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

      {/* ações */}
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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
      audio_enabled: null,
      footer_override: null,
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                  {allMedia.map(m => <AvailableMediaCard key={m.id} media={m} />)}
                  {allMedia.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Sem mídias.</p>}
                </>
              )}
              {tab === 'rss' && (
                <>
                  {allFeeds.map(f => <AvailableRssCard key={f.id} feed={f} />)}
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Playlist atual · {localItems.length} {localItems.length === 1 ? 'item' : 'itens'}
              </p>
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
    </div>
  )
}

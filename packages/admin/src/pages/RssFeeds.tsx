import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { RssFeed, RssArticle } from '../lib/database.types'
import { Plus, Trash2, RefreshCw, Rss, ChevronDown, ChevronUp } from 'lucide-react'

const RSS_SYNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rss-sync`

export default function RssFeedsPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: feeds = [] } = useQuery<RssFeed[]>({
    queryKey: ['rss-feeds'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rss_feeds').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })

  const addFeed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('rss_feeds').insert({ name: name.trim(), url: url.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rss-feeds'] })
      setShowAdd(false); setName(''); setUrl('')
    },
  })

  const deleteFeed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rss_feeds').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rss-feeds'] }),
  })

  const syncNow = async () => {
    setSyncing(true)
    try {
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      // A Edge Function exige Authorization (verify_jwt). Só 'apikey' dá 401 e o
      // sync falhava em silêncio. Mandamos os dois headers.
      const res = await fetch(RSS_SYNC_URL, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        // flag manual: só assim a função sincroniza (chamadas automáticas são ignoradas)
        body: JSON.stringify({ manual: true }),
      })
      if (!res.ok) throw new Error(`Falha no sync RSS: HTTP ${res.status}`)
      qc.invalidateQueries({ queryKey: ['rss-feeds'] })
      qc.invalidateQueries({ queryKey: ['rss-articles'] })
    } catch (e) {
      console.error(e)
      alert('Não foi possível sincronizar as notícias agora. Tente novamente.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">RSS</h2>
          <p className="text-sm text-gray-500 mt-0.5">Feeds de notícias — atualizados automaticamente a cada 10 min pelo player</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            Sincronizar agora
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Adicionar Feed
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Novo Feed RSS</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: G1 Notícias"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL do feed XML</label>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
              <button
                onClick={() => addFeed.mutate()}
                disabled={!name.trim() || !url.trim() || addFeed.isPending}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {feeds.map(feed => (
          <FeedRow
            key={feed.id}
            feed={feed}
            expanded={expanded === feed.id}
            onToggle={() => setExpanded(expanded === feed.id ? null : feed.id)}
            onDelete={() => { if (confirm('Remover feed e todos os artigos?')) deleteFeed.mutate(feed.id) }}
          />
        ))}
        {feeds.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Rss size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum feed cadastrado.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ArticleToggle({ article }: { article: RssArticle }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('rss_articles')
        .update({ active: !article.active })
        .eq('id', article.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rss-articles', article.feed_id] }),
  })

  const active = article.active !== false  // default true

  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      title={active ? 'Ativo — clique para desativar' : 'Desativado — clique para ativar'}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        minWidth: 36,
        flexShrink: 0,
        borderRadius: 9999,
        backgroundColor: active ? '#22c55e' : '#e5e7eb',
        transition: 'background-color 0.2s',
        padding: 0,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s',
          transform: active ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}

function FeedRow({ feed, expanded, onToggle, onDelete }: {
  feed: RssFeed; expanded: boolean; onToggle: () => void; onDelete: () => void
}) {
  const { data: articles = [] } = useQuery<RssArticle[]>({
    queryKey: ['rss-articles', feed.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rss_articles')
        .select('*')
        .eq('feed_id', feed.id)
        .order('pub_date', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: expanded,
  })

  const activeCount = articles.filter(a => a.active !== false).length

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="p-2 bg-orange-50 rounded-lg text-orange-500">
          <Rss size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{feed.name}</p>
          <p className="text-xs text-gray-400 truncate">{feed.url}</p>
        </div>
        <div className="text-right shrink-0">
          {feed.last_synced_at ? (
            <p className="text-xs text-gray-400">
              Sincronizado: {new Date(feed.last_synced_at).toLocaleString('pt-BR')}
            </p>
          ) : (
            <p className="text-xs text-yellow-500">Nunca sincronizado</p>
          )}
          {expanded && articles.length > 0 && (
            <p className="text-xs text-green-600 mt-0.5">{activeCount} de {articles.length} ativas</p>
          )}
        </div>
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 p-1">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      {expanded && (
        <div className="border-t bg-gray-50 px-5 py-3 space-y-2">
          {articles.length === 0 && (
            <p className="text-xs text-gray-400 py-2">Nenhum artigo. Clique em "Sincronizar agora".</p>
          )}
          {articles.map(article => {
            const active = article.active !== false
            return (
            <div key={article.id} className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${active ? 'bg-white' : 'bg-gray-100 opacity-60'}`}>
              {/* Toggle */}
              <ArticleToggle article={article} />

              {/* Thumbnail */}
              {article.image_url && (
                <img src={article.image_url} alt="" className="w-12 h-9 object-cover rounded shrink-0 bg-gray-200" onError={e => (e.currentTarget.style.display = 'none')} />
              )}

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug line-clamp-1">{article.title}</p>
                {article.pub_date && (
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(article.pub_date).toLocaleString('pt-BR')}</p>
                )}
              </div>
            </div>
          )
          })}
        </div>
      )}
    </div>
  )
}

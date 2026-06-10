import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen, Playlist, RssFeed, ScreenActionLog } from '../lib/database.types'
import {
  ChevronLeft, Settings, BarChart3, Wifi, WifiOff,
  RotateCw, RefreshCw, Trash2, Monitor, Cpu, MonitorPlay, HardDrive, Clock,
  MemoryStick, Database, Server, Camera, DownloadCloud,
  Pencil, Volume2, VolumeX, PanelBottom,
} from 'lucide-react'
import { FooterModal, EditScreenModal, uploadFooterLogo } from '../components/screenSettings'

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 90_000
}

function fmtBytes(b: number): string {
  if (!b) return '0 MB'
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
  return `${Math.round(b / 1024 / 1024)} MB`
}

function uptime(since: string | null, online: boolean) {
  if (!since || !online) return '—'
  const ms = Date.now() - new Date(since).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const remMin = min % 60
  if (h < 24) return `${h}h ${remMin}min`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

// URL do player hospedado (Vercel). Usada no preview ao vivo via ?preview=CODIGO.
const PLAYER_URL =
  (import.meta.env.VITE_PLAYER_URL as string | undefined) ||
  'https://maranata-indoor-player.vercel.app'

const ORIENTATION_LABEL: Record<string, string> = {
  'landscape': 'Horizontal',
  'landscape-reverse': 'Horizontal (180°)',
  'portrait': 'Vertical ↻',
  'portrait-reverse': 'Vertical ↺',
}

export default function ScreenDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [previewKey, setPreviewKey] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [footerOpen, setFooterOpen] = useState(false)

  const { data: screen } = useQuery<Screen>({
    queryKey: ['screen', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('screens').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
    refetchInterval: 10_000,  // atualiza status a cada 10s
  })

  const { data: actionLogs = [] } = useQuery<ScreenActionLog[]>({
    queryKey: ['screen-action-logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('screen_action_logs')
        .select('*')
        .eq('screen_id', id!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 10_000,
  })

  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ['playlists'],
    queryFn: async () => {
      const { data, error } = await supabase.from('playlists').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const { data: feeds = [] } = useQuery<RssFeed[]>({
    queryKey: ['rss-feeds'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rss_feeds').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  // Itens da playlist desta tela — pra estimar quanto TUDO ocupa no box
  // (mídias, fundos de frase/relógio e notícias).
  const { data: playlistRows = [] } = useQuery<{
    rss_feed_id: string | null
    rss_article_count: number | null
    media: { type: string; storage_path: string | null; size_bytes: number | null; rendition_sizes: Record<string, number> | null;
             clock_config: { bg_image_path: string | null } | null;
             quotes_config: { bg_image_path: string | null } | null } | null
  }[]>({
    queryKey: ['playlist-capacity', screen?.playlist_id],
    queryFn: async () => {
      if (!screen?.playlist_id) return []
      const { data, error } = await supabase
        .from('playlist_items')
        .select('rss_feed_id, rss_article_count, media(type, storage_path, size_bytes, rendition_sizes, clock_config, quotes_config)')
        .eq('playlist_id', screen.playlist_id)
      if (error) throw error
      return (data ?? []).map((it: any) => ({
        rss_feed_id: it.rss_feed_id, rss_article_count: it.rss_article_count,
        media: Array.isArray(it.media) ? (it.media[0] ?? null) : it.media,
      }))
    },
    enabled: !!screen?.playlist_id,
  })

  // Caminhos dos fundos (frase/relógio) usados — pra somar o tamanho deles (estão na tabela assets).
  const bgPaths = Array.from(new Set(
    playlistRows.flatMap(r => {
      const p = r.media?.clock_config?.bg_image_path ?? r.media?.quotes_config?.bg_image_path
      return p ? [p] : []
    })
  ))
  const { data: bgAssets = [] } = useQuery<{ path: string; rendition_sizes: Record<string, number> | null }[]>({
    queryKey: ['bg-assets', bgPaths],
    queryFn: async () => {
      if (!bgPaths.length) return []
      const { data, error } = await supabase.from('assets').select('path, rendition_sizes').in('path', bgPaths)
      if (error) throw error
      return data ?? []
    },
    enabled: bgPaths.length > 0,
  })
  const bgSizeByPath = new Map(bgAssets.map(a => [a.path, a.rendition_sizes]))

  // Atualiza qualquer campo da tela (playlist, som, rodapé, etc.).
  const updateScreen = useMutation({
    mutationFn: async (patch: Partial<Screen>) => {
      const { error } = await supabase.from('screens').update(patch).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screen', id] }),
  })

  const saveFooter = async (s: Screen, cfg: Parameters<typeof uploadFooterLogo>[1], logoFile: File | null, removeLogo: boolean) => {
    const finalCfg = await uploadFooterLogo(s, cfg, logoFile, removeLogo)
    updateScreen.mutate({ footer_config: finalCfg })
    setFooterOpen(false)
  }

  const sendCommand = useMutation({
    mutationFn: async (cmd: string) => {
      // Registra o comando no log
      const { data: { user } } = await supabase.auth.getUser()
      const { error: logError } = await supabase.from('screen_action_logs').insert({
        screen_id: id!,
        action: cmd,
        executed_by: user?.email ?? null,
        status: 'pending',
      })
      if (logError) console.error('Erro ao registrar log:', logError)

      // Envia o comando
      const { error } = await supabase.from('screens').update({ pending_command: cmd }).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['screen', id] })
      qc.invalidateQueries({ queryKey: ['screen-action-logs', id] })
    },
  })

  if (!screen) {
    return (
      <div className="p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  const online = isOnline(screen.last_seen)
  const t = screen.telemetry

  // Estima quanto a playlist INTEIRA ocupa no box, na qualidade da tela.
  // DEDUPLICA por caminho: a mesma mídia/fundo repetido na playlist é baixado 1×.
  //  • vídeo/imagem  → rendition da qualidade (ou size_bytes legado)
  //  • frase/relógio → tamanho do fundo (imagem em cache; 0 se for cor sólida)
  //  • notícias (RSS) → o player pré-baixa ~20 notícias POR FEED (capa+logo); estima por feed
  //  • clima/HTML/YouTube/Stream → 0 (não baixam arquivo; renderizam/transmitem ao vivo)
  const quality = screen.video_quality ?? 'hd'
  const NEWS_BYTES_PER_FEED = 20 * 110 * 1024   // ~20 notícias × ~110 KB (capa + logo) redimensionadas
  let contentBytes = 0
  let unknownCount = 0
  let hasEstimate = false
  const countedPaths = new Set<string>()
  const countedFeeds = new Set<string>()
  for (const r of playlistRows) {
    if (r.rss_feed_id) {
      if (!countedFeeds.has(r.rss_feed_id)) {
        countedFeeds.add(r.rss_feed_id)
        contentBytes += NEWS_BYTES_PER_FEED
        hasEstimate = true
      }
      continue
    }
    const m = r.media
    if (!m) continue
    if (m.type === 'video' || m.type === 'image') {
      if (!m.storage_path || countedPaths.has(m.storage_path)) continue
      countedPaths.add(m.storage_path)
      const s = m.rendition_sizes?.[quality] ?? m.rendition_sizes?.fhd ?? m.size_bytes
      if (s) contentBytes += s
      else unknownCount++
    } else if (m.type === 'clock' || m.type === 'quotes') {
      const bg = m.clock_config?.bg_image_path ?? m.quotes_config?.bg_image_path
      if (!bg || countedPaths.has(bg)) continue
      countedPaths.add(bg)
      const rs = bgSizeByPath.get(bg)
      const s = rs?.[quality] ?? rs?.fhd
      if (s) contentBytes += s
      else unknownCount++
    }
    // weather/html/youtube/stream = ~0 (não cacheiam arquivo)
  }
  const quotaBytes = t?.storage_quota_bytes ?? 0
  const usagePct = quotaBytes ? Math.min(100, Math.round((contentBytes / quotaBytes) * 100)) : 0
  // Margem de segurança de 15% (notícias, app, etc. também ocupam).
  const fits = quotaBytes ? contentBytes < quotaBytes * 0.85 : null
  const QUALITY_LABEL: Record<string, string> = { sd: 'SD', qhd: '540p', hd: 'HD', fhd: 'Full HD' }

  return (
    <div className="p-8 max-w-5xl">
      <button onClick={() => navigate('/screens')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft size={16} /> Voltar
      </button>

      {/* Cabeçalho da tela */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">{screen.name}</h1>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
        <button onClick={() => setEditOpen(true)}
          className="flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl font-medium transition-colors shadow-sm">
          <Pencil size={14} /> Editar tela
        </button>
      </div>

      {/* Configurações básicas */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
          <Settings size={18} className="text-brand-600" /> Configurações básicas
        </h2>
        <dl className="space-y-3 text-sm">
          <Row label="Nome"><span className="text-brand-600 font-medium">{screen.name}</span></Row>

          {/* Playlist — troca inline */}
          <Row label="Lista de Reprodução">
            <div className="flex items-center gap-2">
              <select value={screen.playlist_id ?? ''}
                onChange={e => updateScreen.mutate({ playlist_id: e.target.value || null })}
                className="border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[180px]">
                <option value="">— Nenhuma —</option>
                {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {screen.playlist_id && (
                <Link to={`/playlists/${screen.playlist_id}`} className="text-brand-600 hover:underline text-xs">editar</Link>
              )}
            </div>
          </Row>

          {/* Som — toggle inline */}
          <Row label="Som">
            <button onClick={() => updateScreen.mutate({ sound_enabled: !screen.sound_enabled })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${screen.sound_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {screen.sound_enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {screen.sound_enabled ? 'Ativado' : 'Sem som'}
            </button>
          </Row>

          {/* Rodapé — abre o modal */}
          <Row label="Rodapé">
            <button onClick={() => setFooterOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm border px-3 py-1 rounded-lg hover:bg-gray-50 transition-colors">
              <PanelBottom size={14} /> Configurar
              {screen.footer_config?.enabled && <span className="text-green-600 text-xs">• ativo</span>}
            </button>
          </Row>

          <Row label="Orientação"><span className="text-brand-600">{ORIENTATION_LABEL[screen.orientation] ?? 'Horizontal'}</span></Row>
          <Row label="Código"><span className="font-mono text-gray-500">{screen.token.slice(0, 6).toUpperCase()}</span></Row>
        </dl>
      </section>

      {/* Status e Informações */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
          <BarChart3 size={18} className="text-green-600" /> Status e Informações
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Status */}
          <div>
            <h3 className="text-lg font-semibold text-slate-600 mb-3 border-b pb-2">Status</h3>
            <div className={`border-l-4 pl-4 space-y-3 ${online ? 'border-green-500' : 'border-gray-300'}`}>
              <Info label="App">
                <span className={`inline-flex items-center gap-1.5 font-medium ${online ? 'text-green-600' : 'text-gray-500'}`}>
                  {online ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {online ? 'Online - Funcionando' : 'Offline'}
                </span>
              </Info>
              <Info label="Internet">
                {!online ? <span className="text-gray-400">—</span>
                  : t?.internet === 'sem'
                    ? <span className="text-amber-600 font-medium">Sem internet</span>
                    : <span className="text-green-600 font-medium">OK</span>}
              </Info>
              <Info label="Online a">{uptime(screen.session_started_at, online)}</Info>
              <Info label="Online esse mês">{uptime(screen.online_since, online)}</Info>
              <Info label="Última Atualização">
                {screen.last_seen ? new Date(screen.last_seen).toLocaleString('pt-BR') : '—'}
              </Info>
              <Info label="Exibindo agora">
                <span className="inline-flex items-center gap-1.5">
                  <MonitorPlay size={14} className="text-gray-400" />
                  {t?.current_media || '—'}
                </span>
              </Info>
            </div>
          </div>

          {/* Informações */}
          <div>
            <h3 className="text-lg font-semibold text-slate-600 mb-3 border-b pb-2">Informações</h3>
            <div className="border-l-4 border-blue-400 pl-4 space-y-3">
              <Info label="Versão do Aplicativo">{t?.app_version || '—'}</Info>
              <Info label="Sistema Operacional">
                <span className="inline-flex items-center gap-1.5"><Cpu size={14} className="text-gray-400" />{t?.user_agent || '—'}</span>
              </Info>
              {t?.device_model && (
                <Info label="Modelo do aparelho">
                  <span className="inline-flex items-center gap-1.5"><Server size={14} className="text-gray-400" />{t.device_model}</span>
                </Info>
              )}
              <Info label="Processador">
                <span className="inline-flex items-center gap-1.5"><Cpu size={14} className="text-gray-400" />{t?.cpu || '—'}</span>
              </Info>
              <Info label="Memória RAM">
                <span className="inline-flex items-center gap-1.5"><MemoryStick size={14} className="text-gray-400" />{t?.ram || '—'}</span>
              </Info>
              <Info label="Resolução">
                <span className="inline-flex items-center gap-1.5"><Monitor size={14} className="text-gray-400" />{t?.resolution || '—'}</span>
              </Info>
              <Info label="Armazenamento disponível">
                <span className="inline-flex items-center gap-1.5">
                  <HardDrive size={14} className="text-gray-400" />
                  {t?.storage_free
                    ? `${t.storage_free}${t.storage_total ? ` livres de ${t.storage_total}` : ''}`
                    : (t?.storage_total || '—')}
                </span>
              </Info>
              <Info label="Espaço usado (cache)">
                <span className="inline-flex items-center gap-1.5"><Database size={14} className="text-gray-400" />{t?.storage_estimate || '—'}</span>
              </Info>
            </div>
          </div>
        </div>

        {/* Capacidade: quanto a playlist desta tela ocupa vs. o que cabe no box */}
        {quotaBytes > 0 && (
          <div className="mt-7 border-t pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-1.5">
                <HardDrive size={15} className="text-gray-400" />
                Capacidade desta tela <span className="text-gray-400 font-normal">(qualidade {QUALITY_LABEL[quality] ?? quality})</span>
              </h3>
              <span className="text-sm text-gray-600">
                {hasEstimate ? '≈ ' : ''}{fmtBytes(contentBytes)} de {fmtBytes(quotaBytes)}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fits ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <p className={`mt-2 text-sm font-medium ${fits ? 'text-emerald-600' : 'text-red-600'}`}>
              {fits
                ? `✓ Cabe no armazenamento (${usagePct}% usado)`
                : `⚠ Conteúdo muito grande para este box (${usagePct}%) — reduza a qualidade ou remova mídias`}
            </p>
            {hasEstimate && (
              <p className="mt-1 text-xs text-gray-400">
                Inclui estimativa das notícias (~2 MB por feed RSS — o player guarda ~20 notícias de cada). Clima, HTML, YouTube e Stream não ocupam cache.
              </p>
            )}
            {unknownCount > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {unknownCount} mídia(s) sem tamanho registrado (envie novamente para contabilizar).
              </p>
            )}
          </div>
        )}
      </section>

      {/* Preview ao vivo */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-700">
            <MonitorPlay size={18} className="text-emerald-600" /> Preview ao vivo
          </h2>
          <button onClick={() => setPreviewKey(k => k + 1)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <RefreshCw size={14} /> Recarregar
          </button>
        </div>
        {(() => {
          // A orientação (incl. "invertido") é só pra compensar a montagem FÍSICA
          // da TV. No painel a gente DESFAZ essa rotação pra mostrar sempre em pé.
          // O player roda numa viewport 16:9; aqui giramos o iframe pelo inverso.
          const o = screen.orientation
          const portrait = o === 'portrait' || o === 'portrait-reverse'
          const rotateDeg = o === 'landscape-reverse' ? 180 : o === 'portrait' ? -90 : o === 'portrait-reverse' ? 90 : 0
          return (
            <div className="rounded-xl overflow-hidden border bg-black mx-auto" style={{ maxWidth: portrait ? 380 : 720 }}>
              <div style={{ position: 'relative', width: '100%', paddingTop: portrait ? '177.78%' : '56.25%', overflow: 'hidden' }}>
                <iframe
                  key={previewKey}
                  src={`${PLAYER_URL}/?preview=${screen.token}`}
                  title="Preview da tela"
                  allow="autoplay; encrypted-media"
                  style={portrait
                    ? {
                        position: 'absolute', top: '50%', left: '50%',
                        width: '177.78%', height: '56.25%',
                        transform: `translate(-50%, -50%) rotate(${rotateDeg}deg)`,
                        transformOrigin: 'center', border: 'none',
                      }
                    : {
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        transform: rotateDeg ? `rotate(${rotateDeg}deg)` : undefined,
                        border: 'none',
                      }}
                />
              </div>
            </div>
          )
        })()}
        <p className="text-xs text-gray-400 mt-2 max-w-2xl">
          <b>Segue</b> o item que está no ar nesta tela (lê a telemetria do box) e troca junto com ele — não reinicia a playlist do começo. Toca aqui no admin <b>mudo</b> e sem afetar o status da tela. Dentro de um vídeo o tempo pode não bater exatamente; para o quadro exato use <b>Tirar Print</b>.
        </p>
      </section>

      {/* Comandos */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
          <Clock size={18} className="text-purple-600" /> Comandos
        </h2>
        {!online && (
          <p className="text-xs text-amber-600 mb-3">A tela está offline — os comandos serão executados quando ela voltar.</p>
        )}
        {screen.pending_command && (
          <p className="text-xs text-blue-600 mb-3">Comando pendente: <b>{screen.pending_command}</b> (aguardando a tela executar...)</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => sendCommand.mutate('refresh')}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <RefreshCw size={16} /> Atualizar Tela
          </button>
          <button onClick={() => sendCommand.mutate('reload')}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <RotateCw size={16} /> Reiniciar Navegador
          </button>
          <button onClick={() => sendCommand.mutate('clear_cache')}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Trash2 size={16} /> Limpar Cache
          </button>
          <button onClick={() => sendCommand.mutate('screenshot')}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Camera size={16} /> Tirar Print
          </button>
          <button onClick={() => { if (confirm('Atualizar o app desta tela para a versão publicada?')) sendCommand.mutate('update') }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <DownloadCloud size={16} /> Atualizar App
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3 max-w-2xl leading-relaxed">
          <b>Atualizar Tela</b>: recarrega a playlist e as mídias e reinicia a reprodução,
          <b> sem recarregar o navegador</b> (rápido, ideal pro kiosk). ·
          <b> Reiniciar Navegador</b>: recarrega a página inteira (use para forçar nova versão do app). ·
          <b> Limpar Cache</b>: apaga TODO o cache local (vídeos inclusive) e baixa do zero. ·
          <b> Tirar Print</b>: captura a tela atual (YouTube/live podem sair pretos). ·
          <b> Atualizar App</b>: busca a versão publicada do player e recarrega (mostra "Atualizando app" na tela).
        </p>
      </section>

      {/* Print da tela */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
          <Camera size={18} className="text-indigo-600" /> Print da Tela
        </h2>
        {screen.last_screenshot ? (
          <div>
            <img
              src={screen.last_screenshot}
              alt="Print da tela"
              className="rounded-xl border shadow-sm max-w-2xl w-full bg-black"
            />
            <p className="text-xs text-gray-400 mt-2">
              Capturado em {screen.last_screenshot_at ? new Date(screen.last_screenshot_at).toLocaleString('pt-BR') : '—'}.
              {' '}Clique em <b>Tirar Print</b> para atualizar (a tela precisa estar online).
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Nenhum print ainda. Clique em <b>Tirar Print</b> acima — a imagem aparece aqui em alguns segundos.
          </p>
        )}
      </section>

      {/* Ajuste de Margens (Overscan) */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <h2 className="text-base font-bold text-slate-700 mb-4">Ajuste de Overscan</h2>
        <p className="text-xs text-gray-400 mb-4">Se a imagem está cortada nas bordas, ajuste as margens (em pixels). As mudanças são aplicadas em tempo real no preview.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Topo (px)</label>
            <input type="number" min="0" max="100" value={screen.margin_top ?? 0}
              onChange={e => updateScreen.mutate({ id: screen.id, margin_top: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Direita (px)</label>
            <input type="number" min="0" max="100" value={screen.margin_right ?? 0}
              onChange={e => updateScreen.mutate({ id: screen.id, margin_right: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fundo (px)</label>
            <input type="number" min="0" max="100" value={screen.margin_bottom ?? 0}
              onChange={e => updateScreen.mutate({ id: screen.id, margin_bottom: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Esquerda (px)</label>
            <input type="number" min="0" max="100" value={screen.margin_left ?? 0}
              onChange={e => updateScreen.mutate({ id: screen.id, margin_left: Number(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
      </section>

      {/* Log de ações */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 mb-6">
        <h2 className="text-base font-bold text-slate-700 mb-4">Log de Ações</h2>
        {actionLogs.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma ação registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 font-medium">
                  <th className="text-left py-2 px-3">Ação</th>
                  <th className="text-left py-2 px-3">Executado por</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {actionLogs.map(log => (
                  <tr key={log.id} className="border-b text-gray-700 hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-medium">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold">
                        {log.action === 'refresh' && '🔄 Atualizar Tela'}
                        {log.action === 'reload' && '🔃 Reiniciar Navegador'}
                        {log.action === 'clear_cache' && '🗑️ Limpar Cache'}
                        {log.action === 'screenshot' && '📸 Tirar Print'}
                        {log.action === 'update' && '⬆️ Atualizar App'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{log.executed_by ?? '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        log.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        log.status === 'completed' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {log.status === 'pending' && '⏳ Pendente'}
                        {log.status === 'completed' && '✓ Concluído'}
                        {log.status === 'failed' && '✗ Falhou'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modais */}
      {editOpen && (
        <EditScreenModal
          screen={screen}
          playlists={playlists}
          onClose={() => setEditOpen(false)}
          onSave={patch => { updateScreen.mutate(patch); setEditOpen(false) }}
        />
      )}
      {footerOpen && (
        <FooterModal
          screen={screen}
          feeds={feeds}
          onClose={() => setFooterOpen(false)}
          onSave={(cfg, logoFile, removeLogo) => saveFooter(screen, cfg, logoFile, removeLogo)}
        />
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-44 text-right text-gray-500 shrink-0">{label}:</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-800 text-right">{children}</span>
    </div>
  )
}

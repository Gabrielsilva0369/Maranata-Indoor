import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen, Playlist } from '../lib/database.types'
import {
  ChevronLeft, Settings, BarChart3, Wifi, WifiOff,
  RotateCw, RefreshCw, Trash2, Monitor, Cpu, MonitorPlay, HardDrive, Clock,
  MemoryStick, Database, Server, Camera,
} from 'lucide-react'

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 90_000
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

  const { data: screen } = useQuery<Screen>({
    queryKey: ['screen', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('screens').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
    refetchInterval: 10_000,  // atualiza status a cada 10s
  })

  const { data: playlist } = useQuery<Playlist | null>({
    queryKey: ['playlist', screen?.playlist_id],
    queryFn: async () => {
      if (!screen?.playlist_id) return null
      const { data } = await supabase.from('playlists').select('*').eq('id', screen.playlist_id).maybeSingle()
      return data
    },
    enabled: !!screen,
  })

  const sendCommand = useMutation({
    mutationFn: async (cmd: string) => {
      const { error } = await supabase.from('screens').update({ pending_command: cmd }).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screen', id] }),
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

  return (
    <div className="p-8 max-w-5xl">
      <button onClick={() => navigate('/screens')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-5">
        <ChevronLeft size={16} /> Voltar
      </button>

      {/* Configurações básicas */}
      <section className="mb-8">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-700 mb-1">
          <Settings size={20} className="text-brand-600" /> Configurações básicas
        </h2>
        <hr className="mb-5" />
        <dl className="space-y-3 text-sm">
          <Row label="Nome"><span className="text-brand-600 font-medium">{screen.name}</span></Row>
          <Row label="Lista de Reprodução">
            {screen.playlist_id ? (
              <Link to={`/playlists/${screen.playlist_id}`} className="text-brand-600 hover:underline">
                {playlist?.name ?? '...'}
              </Link>
            ) : <span className="text-gray-400">— Nenhuma —</span>}
          </Row>
          <Row label="Orientação"><span className="text-brand-600">{ORIENTATION_LABEL[screen.orientation] ?? 'Horizontal'}</span></Row>
          <Row label="Código"><span className="font-mono text-gray-500">{screen.token.slice(0, 6).toUpperCase()}</span></Row>
        </dl>
      </section>

      {/* Status e Informações */}
      <section className="mb-8">
        <h2 className="flex items-center gap-2 text-xl font-bold text-green-700 mb-1">
          <BarChart3 size={20} /> Status e Informações
        </h2>
        <hr className="mb-5" />

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
              <Info label="Online a">{uptime(screen.online_since, online)}</Info>
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
      </section>

      {/* Comandos */}
      <section>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-700 mb-1">
          <Clock size={20} className="text-purple-600" /> Comandos
        </h2>
        <hr className="mb-5" />
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
        </div>
        <p className="text-xs text-gray-400 mt-3 max-w-2xl leading-relaxed">
          <b>Atualizar Tela</b>: recarrega a playlist e as mídias e reinicia a reprodução,
          <b> sem recarregar o navegador</b> (rápido, ideal pro kiosk). ·
          <b> Reiniciar Navegador</b>: recarrega a página inteira (use para forçar nova versão do app). ·
          <b> Limpar Cache</b>: apaga TODO o cache local (vídeos inclusive) e baixa do zero. ·
          <b> Tirar Print</b>: captura a tela atual (YouTube/live podem sair pretos).
        </p>
      </section>

      {/* Print da tela */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-700 mb-1">
          <Camera size={20} className="text-indigo-600" /> Print da Tela
        </h2>
        <hr className="mb-5" />
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

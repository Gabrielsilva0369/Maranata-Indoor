import { useEffect, useRef, useState } from 'react'
import { useScreenToken } from './hooks/useScreenToken'
import { usePlaylist } from './hooks/usePlaylist'
import { useScreenSync } from './hooks/useScreenSync'
import { initAudioUnlock } from './lib/audioUnlock'
import PairingScreen from './components/PairingScreen'
import PlaylistPlayer from './components/PlaylistPlayer'
import OrientationWrapper from './components/OrientationWrapper'
import AudioUnlock from './components/AudioUnlock'
import LoadingScreen from './components/LoadingScreen'

const RSS_SYNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rss-sync`
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function triggerRssSync() {
  fetch(RSS_SYNC_URL, {
    method: 'POST',
    headers: { apikey: ANON_KEY },
  }).catch(() => {})
}

export default function App() {
  const { token, pairCode } = useScreenToken()
  const { screen, items, paired, loading, refetch, syncStatus } = usePlaylist(token)
  const [currentMedia, setCurrentMedia] = useState('')
  // Pré-carregamento: na tela inicial baixa TODO o conteúdo da playlist (imagens
  // e vídeos) pro cache local antes de começar a tocar — assim reproduz liso e
  // funciona offline. YouTube/streaming não são baixados (tocam direto da rede).
  const [preloaded, setPreloaded] = useState(false)
  // Marca o instante do último avanço de download, p/ detectar travamento.
  const lastProgressRef = useRef(Date.now())
  useScreenSync({
    screenId: screen?.id,
    currentMedia,
    orientation: screen?.orientation ?? 'landscape',
    onRefresh: refetch,   // comando "Atualizar Tela": re-busca conteúdo sem recarregar o navegador
  })

  // Sincroniza feeds RSS a cada 10 minutos
  useEffect(() => {
    triggerRssSync()
    const id = setInterval(triggerRssSync, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Desbloqueia áudio na primeira interação (política de autoplay do navegador)
  useEffect(() => { initAudioUnlock() }, [])

  // Libera a reprodução quando o download das mídias termina (ou dá erro).
  useEffect(() => {
    if (syncStatus && (syncStatus.status === 'done' || syncStatus.status === 'error')) {
      setPreloaded(true)
    }
  }, [syncStatus])

  // Registra cada avanço do download (muda completed/status) para o watchdog.
  useEffect(() => {
    lastProgressRef.current = Date.now()
  }, [syncStatus?.completed, syncStatus?.status])

  // Sem internet no boot: não fica esperando download — toca direto do cache local.
  useEffect(() => {
    if (!navigator.onLine) setPreloaded(true)
  }, [])

  // Watchdog: nunca trava na tela de carregamento. Playlist grande baixa por
  // inteiro DESDE QUE o progresso continue avançando; só libera no "estouro" se
  // o download EMPACAR (sem avançar) por 60s — aí o item sem cache toca por
  // streaming enquanto termina de baixar em background.
  useEffect(() => {
    if (preloaded) return
    const id = setInterval(() => {
      if (Date.now() - lastProgressRef.current > 60000) setPreloaded(true)
    }, 5000)
    return () => clearInterval(id)
  }, [preloaded])

  // Request fullscreen on first interaction (required by browsers)
  // Na WebView do Capacitor (Android TV), essa API pode não existir
  useEffect(() => {
    const requestFullscreen = () => {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {})
        }
      } catch { /* ignore */ }
      document.removeEventListener('click', requestFullscreen)
      document.removeEventListener('keydown', requestFullscreen)
    }
    document.addEventListener('click', requestFullscreen)
    document.addEventListener('keydown', requestFullscreen)
    return () => {
      document.removeEventListener('click', requestFullscreen)
      document.removeEventListener('keydown', requestFullscreen)
    }
  }, [])

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#111827',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '4px solid #374151', borderTopColor: '#60a5fa',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!paired) {
    return <PairingScreen pairCode={pairCode} onRetry={refetch} />
  }

  // Tela inicial de carregamento: emparelhada mas ainda baixando o conteúdo.
  // Segura a reprodução até o download terminar (ou o watchdog liberar), pra
  // tocar do cache sem travamento. Aparece no boot e quando a playlist muda.
  if (!preloaded) {
    return <LoadingScreen sync={syncStatus} />
  }

  return (
    <>
      {/* Overlay "tap to start" que libera o áudio do autoplay (auto-clique no load) */}
      <AudioUnlock />
      <OrientationWrapper orientation={screen!.orientation ?? 'landscape'}>
      <PlaylistPlayer items={items} screen={screen!} onMediaChange={setCurrentMedia} />

      {/* Indicador de sincronização local de mídias em background */}
      {syncStatus && syncStatus.status === 'syncing' && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16,
          background: 'rgba(0, 0, 0, 0.85)', color: '#fff',
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
          fontFamily: 'system-ui, -apple-system, sans-serif', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none', // Não intercepta cliques do player
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.2)',
            borderTopColor: '#3b82f6',
            animation: 'spin 1s linear infinite',
          }} />
          <span>Sincronizando mídias localmente ({syncStatus.completed}/{syncStatus.total})</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      </OrientationWrapper>
    </>
  )
}

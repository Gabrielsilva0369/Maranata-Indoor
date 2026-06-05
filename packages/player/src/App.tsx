import { useEffect, useState } from 'react'
import { useScreenToken } from './hooks/useScreenToken'
import { usePlaylist } from './hooks/usePlaylist'
import { useScreenSync } from './hooks/useScreenSync'
import { initAudioUnlock } from './lib/audioUnlock'
import PairingScreen from './components/PairingScreen'
import PlaylistPlayer from './components/PlaylistPlayer'
import OrientationWrapper from './components/OrientationWrapper'
import AudioUnlock from './components/AudioUnlock'

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
  // Pré-carregamento: baixa as mídias antes de começar a tocar (toca do cache,
  // liso). Não trava pra sempre — após 45s segue mesmo sem terminar.
  const [preloaded, setPreloaded] = useState(false)
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
  // Segurança: nunca fica preso no "Preparando" — após 45s segue de qualquer jeito.
  useEffect(() => {
    const t = setTimeout(() => setPreloaded(true), 45000)
    return () => clearTimeout(t)
  }, [])

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

  // Tela "Preparando mídias": baixa tudo antes de tocar, pra reproduzir do cache
  // sem travamento. Aparece só no início (e quando você muda muita coisa no admin).
  if (!preloaded && syncStatus?.status === 'syncing') {
    const pct = syncStatus.total ? Math.round((syncStatus.completed / syncStatus.total) * 100) : 0
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#111827', color: '#e5e7eb',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18, fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '4px solid #374151', borderTopColor: '#60a5fa',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Preparando mídias…</div>
        <div style={{ fontSize: 14, color: '#9ca3af' }}>
          {syncStatus.completed} / {syncStatus.total} ({pct}%)
        </div>
        <div style={{ width: 260, height: 6, background: '#374151', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#60a5fa', transition: 'width 200ms linear' }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
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

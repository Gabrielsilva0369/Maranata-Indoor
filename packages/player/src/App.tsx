import { useEffect } from 'react'
import { useScreenToken } from './hooks/useScreenToken'
import { usePlaylist } from './hooks/usePlaylist'
import { useHeartbeat } from './hooks/useHeartbeat'
import PairingScreen from './components/PairingScreen'
import PlaylistPlayer from './components/PlaylistPlayer'

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
  const { screen, items, paired, loading, refetch } = usePlaylist(token)
  useHeartbeat(screen?.id)

  // Sincroniza feeds RSS a cada 10 minutos
  useEffect(() => {
    triggerRssSync()
    const id = setInterval(triggerRssSync, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Request fullscreen on first interaction (required by browsers)
  useEffect(() => {
    const requestFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
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

  return <PlaylistPlayer items={items} screen={screen!} />
}

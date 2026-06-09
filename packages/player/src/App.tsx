import { useEffect, useRef, useState } from 'react'
import { useScreenToken } from './hooks/useScreenToken'
import { usePlaylist } from './hooks/usePlaylist'
import { useScreenSync } from './hooks/useScreenSync'
import { supabase } from './lib/supabase'
import { initAudioUnlock } from './lib/audioUnlock'
import PairingScreen from './components/PairingScreen'
import PlaylistPlayer from './components/PlaylistPlayer'
import OrientationWrapper from './components/OrientationWrapper'
import AudioUnlock from './components/AudioUnlock'
import LoadingScreen from './components/LoadingScreen'
import UpdatingScreen from './components/UpdatingScreen'
import { applyUpdate } from './lib/appUpdate'

const RSS_SYNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rss-sync`
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function triggerRssSync() {
  // A Edge Function exige Authorization (verify_jwt). Só 'apikey' retorna 401.
  fetch(RSS_SYNC_URL, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  }).catch(() => {})
}

export default function App() {
  const { token, pairCode, preview } = useScreenToken()
  const { screen, items, paired, loading, refetch, syncStatus } = usePlaylist(token)
  const [currentMedia, setCurrentMedia] = useState('')
  const [currentItemId, setCurrentItemId] = useState('')
  const [updating, setUpdating] = useState(false)

  // Registra cada exibição (para os relatórios). No preview, NÃO grava.
  const handleMediaChange = (name: string, type?: string, durationSec?: number, itemId?: string) => {
    setCurrentMedia(name)
    setCurrentItemId(itemId ?? '')
    if (preview || !screen?.id || !name || name === '—') return
    supabase.from('exhibition_logs').insert({
      screen_id: screen.id, name, type: type ?? null,
      duration: durationSec ? Math.round(durationSec) : null,
    }).then(undefined, () => { /* falha de log não pode quebrar a reprodução */ })
  }
  useScreenSync({
    screenId: screen?.id,
    currentMedia,
    currentItemId,
    orientation: screen?.orientation ?? 'landscape',
    onRefresh: refetch,            // comando "Atualizar Tela": re-busca conteúdo sem recarregar o navegador
    onUpdate: () => setUpdating(true),  // comando "Atualizar App": mostra a tela e busca versão nova
    disabled: preview,             // preview no admin não escreve telemetria nem executa comandos
  })

  // Quando entra em modo "atualizando", mostra a tela e aplica a atualização.
  useEffect(() => {
    if (updating) applyUpdate()
  }, [updating])

  // O download terminou (ou deu erro) → conteúdo pronto pra tocar do cache.
  // O preload é dirigido DIRETO por isto: enquanto não está 'done'/'error', a
  // tela de carregamento fica. Como o usePlaylist redispara o download quando a
  // playlist muda, a tela de carregamento reaparece sozinha nesse caso.
  const ready = syncStatus?.status === 'done' || syncStatus?.status === 'error'

  // Tempo mínimo de exibição: se tudo já está em cache o download termina em
  // milissegundos; sem isto a tela "piscaria" e pareceria que nem apareceu.
  const [minElapsed, setMinElapsed] = useState(false)
  const gateStartRef = useRef(Date.now())
  useEffect(() => {
    if (!ready) {
      // Novo ciclo de carregamento (boot ou playlist mudou): reinicia o mínimo.
      gateStartRef.current = Date.now()
      setMinElapsed(false)
      return
    }
    const remaining = Math.max(0, 1500 - (Date.now() - gateStartRef.current))
    const t = setTimeout(() => setMinElapsed(true), remaining)
    return () => clearTimeout(t)
  }, [ready])

  // Sincroniza feeds RSS a cada 10 minutos
  useEffect(() => {
    triggerRssSync()
    const id = setInterval(triggerRssSync, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Desbloqueia áudio na primeira interação (política de autoplay do navegador)
  useEffect(() => { initAudioUnlock() }, [])

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

  // Telas de "gate" (atualizando / carregando / pareamento) também seguem a
  // orientação da tela — senão ficam de lado quando a TV está em retrato.
  const orient = screen?.orientation ?? 'landscape'

  // Atualizando o app (comando do admin): tem prioridade sobre tudo.
  if (updating) {
    return <OrientationWrapper orientation={orient}><UpdatingScreen /></OrientationWrapper>
  }

  // Ainda descobrindo se a tela está emparelhada (primeira busca, sem cache).
  if (loading && !paired) {
    return <OrientationWrapper orientation={orient}><LoadingScreen sync={null} /></OrientationWrapper>
  }

  if (!paired) {
    return <OrientationWrapper orientation={orient}><PairingScreen pairCode={pairCode} onRetry={refetch} /></OrientationWrapper>
  }

  // Tela de carregamento: PERSISTE até TODAS as mídias terminarem de baixar
  // (status 'done'/'error') e o tempo mínimo de exibição passar. Reaparece
  // sozinha quando a playlist muda, pois aí o usePlaylist redispara o download.
  if (!ready || !minElapsed) {
    return <OrientationWrapper orientation={orient}><LoadingScreen sync={syncStatus} /></OrientationWrapper>
  }

  return (
    <>
      {/* Overlay "tap to start" que libera o áudio do autoplay (auto-clique no load) */}
      <AudioUnlock />
      <OrientationWrapper orientation={screen!.orientation ?? 'landscape'}>
      <PlaylistPlayer items={items} screen={screen!} onMediaChange={handleMediaChange} forceMuted={preview} preview={preview} />

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

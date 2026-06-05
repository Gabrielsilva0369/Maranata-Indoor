import { useEffect, useRef, useState } from 'react'
import { onAudioUnlock } from '../../lib/audioUnlock'
import { hasInternet } from '../../lib/network'

interface Props {
  url: string
  duration: number   // usado para live (quando não há fim) ou fallback
  muted: boolean
  onEnd: () => void
}

function extractId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([\w-]{11})/)
  if (m) return m[1]
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim()
  return null
}

let apiPromise: Promise<void> | null = null
function loadYTApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise(resolve => {
    if ((window as any).YT?.Player) { resolve(); return }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
    ;(window as any).onYouTubeIframeAPIReady = () => resolve()
  })
  return apiPromise
}

export default function YouTubePlayer({ url, duration, muted, onEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const endedRef = useRef(false)
  // null = checando internet; true = pode tocar; false não chega a renderizar (pulou)
  const [online, setOnline] = useState<boolean | null>(null)

  const id = extractId(url)
  const wantSound = !muted

  // YouTube precisa de internet. Verifica ANTES de tocar (toda vez que o item
  // aparece): se não tiver, pula para o próximo em vez de ficar carregando.
  useEffect(() => {
    let cancelled = false
    let skipTimer: ReturnType<typeof setTimeout> | undefined
    hasInternet().then(ok => {
      if (cancelled) return
      if (ok) setOnline(true)
      // sem internet → pula, com um respiro p/ não virar loop apertado se a
      // playlist inteira for YouTube/stream offline.
      else skipTimer = setTimeout(onEnd, 1500)
    })
    return () => { cancelled = true; if (skipTimer) clearTimeout(skipTimer) }
  }, [url, onEnd])

  useEffect(() => {
    if (online !== true) return // só carrega o player após confirmar internet
    if (!id) { onEnd(); return }
    endedRef.current = false
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    let startGuard: ReturnType<typeof setTimeout> | undefined
    let gaveUpSound = false   // contexto bloqueou o som → toca mudo (sem loop)

    // Cai para mudo (uma vez) e mantém tocando.
    const fallbackToMuted = (t: any) => {
      if (gaveUpSound) return
      gaveUpSound = true
      try { t.mute(); t.playVideo() } catch { /* ignore */ }
    }

    // Pulse de desbloqueio (overlay a cada 2s) / interação real → re-tenta o som.
    // SÓ desmuta se a tela quer som; com "Som" desativado, nunca tira do mudo.
    const offUnlock = onAudioUnlock(() => {
      if (!wantSound) return
      gaveUpSound = false
      try { playerRef.current?.unMute(); playerRef.current?.setVolume(100); playerRef.current?.playVideo() } catch { /* ignore */ }
    })

    loadYTApi().then(() => {
      if (!containerRef.current) return
      try { playerRef.current?.destroy() } catch {}

      playerRef.current = new (window as any).YT.Player(containerRef.current, {
        videoId: id,
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          // Inicia JÁ com som quando a tela quer som (o kiosk permite autoplay
          // com áudio). Se algum contexto bloquear, cai pra mudo automaticamente.
          mute: wantSound ? 0 : 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (e: any) => {
            const t = e.target
            try {
              if (wantSound) { t.unMute(); t.setVolume(100) } else { t.mute() }
              t.playVideo()
            } catch { /* ignore */ }
            // Rede de segurança: se em ~3s não estiver tocando (contexto que bloqueia
            // som), cai pra mudo e toca.
            startGuard = setTimeout(() => {
              try { if (playerRef.current?.getPlayerState?.() !== 1) fallbackToMuted(playerRef.current) } catch { /* ignore */ }
            }, 3000)
          },
          onStateChange: (e: any) => {
            const t = e.target
            if (e.data === 1) {
              // PLAYING: o YouTube AUTO-MUTA o autoplay mesmo com mute:0. Forçamos
              // o som aqui (uma vez). No kiosk com autoplay liberado, sai som; em
              // contexto que bloqueia, o evento PAUSED abaixo cai pra mudo sem loop.
              if (wantSound && !gaveUpSound) {
                try { t.unMute(); t.setVolume(100) } catch { /* ignore */ }
              }
            } else if (e.data === 2) {
              // PAUSED inesperado: se está com som, o navegador pode ter bloqueado
              // → cai pra mudo (uma vez); senão só retoma. Nunca fica em loop.
              if (endedRef.current) return
              if (wantSound && !gaveUpSound) {
                fallbackToMuted(t)
              } else {
                try { t.playVideo() } catch { /* ignore */ }
              }
            } else if (e.data === 0) {
              // ENDED (vídeo normal) → avança
              if (!endedRef.current) { endedRef.current = true; onEnd() }
            }
          },
        },
      })
    })

    if (duration && duration > 0) {
      fallbackTimer = setTimeout(() => {
        if (!endedRef.current) { endedRef.current = true; onEnd() }
      }, duration * 1000)
    }

    return () => {
      offUnlock()
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if (startGuard) clearTimeout(startGuard)
      try { playerRef.current?.destroy() } catch { /* ignore */ }
    }
  }, [online, url, id, duration, muted, onEnd])

  if (!id) return null

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', border: 'none' }} />
    </div>
  )
}

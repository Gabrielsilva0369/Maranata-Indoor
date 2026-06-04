import { useEffect, useRef } from 'react'
import { onAudioUnlock } from '../../lib/audioUnlock'

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

  const id = extractId(url)
  const wantSound = !muted

  useEffect(() => {
    if (!id) { onEnd(); return }
    endedRef.current = false
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    let unmuteTimer: ReturnType<typeof setTimeout> | undefined
    let triedUnmute = false   // só tenta desmutar UMA vez
    let gaveUpSound = false    // desmutar pausou → desiste do som, toca mudo
    let unmutedAt = 0

    // Interação real do usuário → libera o som de vez.
    const offUnlock = onAudioUnlock(() => {
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
          mute: 1,            // SEMPRE inicia mudo → autoplay garantido
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
            try { e.target.mute(); e.target.playVideo() } catch { /* ignore */ }
          },
          onStateChange: (e: any) => {
            const t = e.target
            if (e.data === 1) {
              // PLAYING: tenta ligar o som UMA vez, já tocando.
              if (wantSound && !gaveUpSound && !triedUnmute) {
                triedUnmute = true
                unmuteTimer = setTimeout(() => {
                  if (gaveUpSound) return
                  unmutedAt = Date.now()
                  try { t.unMute(); t.setVolume(100) } catch { /* ignore */ }
                }, 700)
              }
            } else if (e.data === 2) {
              // PAUSED inesperado. Se foi logo após desmutar, o navegador bloqueou
              // o som → desiste do som e segue tocando MUDO (sem loop liga/pausa).
              if (endedRef.current) return
              if (!gaveUpSound && unmutedAt && Date.now() - unmutedAt < 2500) {
                gaveUpSound = true
                try { t.mute() } catch { /* ignore */ }
              }
              try { t.playVideo() } catch { /* ignore */ }
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
      if (unmuteTimer) clearTimeout(unmuteTimer)
      try { playerRef.current?.destroy() } catch { /* ignore */ }
    }
  }, [url, id, duration, muted, onEnd])

  if (!id) return null

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', border: 'none' }} />
    </div>
  )
}

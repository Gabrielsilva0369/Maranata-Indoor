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

    const simulateClick = (iframe: any) => {
      try {
        if (iframe) {
          iframe.focus()
          const rect = iframe.getBoundingClientRect()
          const x = rect.left + rect.width / 2
          const y = rect.top + rect.height / 2
          
          const events = ['mouseover', 'mousedown', 'pointerdown', 'mouseup', 'pointerup', 'click']
          events.forEach(name => {
            const ev = new MouseEvent(name, {
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true,
              view: window
            })
            iframe.dispatchEvent(ev)
          })
        }
      } catch { /* ignore */ }
    }

    const enableSound = (target: any) => {
      try {
        if (!wantSound) return
        target.unMute()
        target.setVolume(100)
      } catch { /* ignore */ }
    }

    const offUnlock = onAudioUnlock(() => {
      if (playerRef.current) {
        enableSound(playerRef.current)
      }
    })

    loadYTApi().then(() => {
      if (!containerRef.current) return

      try {
        playerRef.current?.destroy()
      } catch {}

      playerRef.current = new (window as any).YT.Player(containerRef.current, {
        videoId: id,
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          mute: wantSound ? 0 : 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1
        },
        events: {
          onReady: (e: any) => {
            if (wantSound) {
              e.target.unMute()
              e.target.setVolume(100)
            } else {
              e.target.mute()
            }
            e.target.playVideo()

            // Simula clique no centro do iframe para forçar o áudio
            if (wantSound) {
              try {
                const iframe = e.target.getIframe()
                if (iframe) {
                  iframe.setAttribute('allow', 'autoplay; encrypted-media')
                  simulateClick(iframe)
                  setTimeout(() => simulateClick(iframe), 100)
                  setTimeout(() => simulateClick(iframe), 300)
                  setTimeout(() => simulateClick(iframe), 500)
                }
              } catch { /* ignore */ }
            }
          },
          onStateChange: (e: any) => {
            if (e.data === 1) { // PLAYING
              if (wantSound) {
                enableSound(e.target)
                setTimeout(() => enableSound(e.target), 100)
                setTimeout(() => enableSound(e.target), 300)
                try {
                  const iframe = e.target.getIframe()
                  if (iframe) simulateClick(iframe)
                } catch {}
              }
            }
            // 0 = ended (vídeo normal) → avança
            if (e.data === 0 && !endedRef.current) {
              endedRef.current = true
              onEnd()
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

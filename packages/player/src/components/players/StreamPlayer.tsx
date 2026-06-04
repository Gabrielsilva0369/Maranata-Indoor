import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { onAudioUnlock } from '../../lib/audioUnlock'

interface Props {
  url: string
  duration: number   // 0 = toca até o fim; >0 avança após N segundos (live)
  muted: boolean
  onEnd: () => void
}

export default function StreamPlayer({ url, duration, muted, onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const wantSound = !muted
    let hls: Hls | null = null
    let durTimer: ReturnType<typeof setTimeout> | undefined
    let unmuteTimer: ReturnType<typeof setTimeout> | undefined
    let gaveUpSound = false

    // Recuperação de pausa: se pausar sozinho (não terminou), retoma. Se a pausa
    // veio de desmutar (o navegador bloqueia som sem gesto), desiste do som e segue
    // tocando MUDO — assim nunca fica naquele liga/pausa em loop.
    const onPause = () => {
      if (video.ended) return
      if (wantSound && !video.muted && !gaveUpSound) {
        gaveUpSound = true
        video.muted = true
      }
      video.play().catch(() => { /* ignore */ })
    }
    video.addEventListener('pause', onPause)

    // Interação real do usuário → libera o som de vez.
    const offUnlock = onAudioUnlock(() => {
      gaveUpSound = false
      if (wantSound) video.muted = false
      video.play().catch(() => { /* ignore */ })
    })

    // SEMPRE inicia MUDO (autoplay garantido). Depois tenta o som UMA vez.
    const safePlay = () => {
      video.muted = true
      video.play()
        .then(() => {
          if (wantSound) {
            unmuteTimer = setTimeout(() => { if (!gaveUpSound) video.muted = false }, 700)
          }
        })
        .catch(() => { /* nem mudo tocou: onError/onEnded cuidam */ })
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / Android com suporte nativo a HLS
      video.src = url
      safePlay()
    } else if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, safePlay)
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) onEnd()  // erro fatal → pula para o próximo
      })
    } else {
      video.removeEventListener('pause', onPause)
      onEnd()
      return
    }

    // Live: avança após a duração configurada
    if (duration && duration > 0) {
      durTimer = setTimeout(onEnd, duration * 1000)
    }

    return () => {
      video.removeEventListener('pause', onPause)
      offUnlock()
      if (durTimer) clearTimeout(durTimer)
      if (unmuteTimer) clearTimeout(unmuteTimer)
      if (hls) hls.destroy()
      video.removeAttribute('src')
    }
  }, [url, duration, muted, onEnd])

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        onEnded={onEnd}
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  )
}

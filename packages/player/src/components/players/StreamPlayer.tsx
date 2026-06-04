import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { audioUnlocked, onAudioUnlock } from '../../lib/audioUnlock'

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
    // Sempre começa mudo para garantir o autoplay
    // Inicializa com o estado desejado
    video.muted = muted
    let hls: Hls | null = null
    let durTimer: ReturnType<typeof setTimeout> | undefined
    let unmuteTimer: ReturnType<typeof setTimeout> | undefined

    // Liga o som logo após começar a tocar (se a tela quer som)
    const enableSound = () => { if (wantSound) video.muted = false }

    // Também liga o som se o usuário interagir
    const offUnlock = onAudioUnlock(enableSound)
    if (wantSound && audioUnlocked()) {
      enableSound()
    }

    // Autoplay inteligente: tenta tocar com som, se falhar, toca mudo.
    const safePlay = () => {
      video.muted = muted
      video.play()
        .then(() => {
          if (wantSound) enableSound()
        })
        .catch(() => {
          video.muted = true
          video.play()
            .then(() => {
              if (wantSound) unmuteTimer = setTimeout(enableSound, 500)
            })
            .catch(() => {})
        })
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
      onEnd()
      return
    }

    // Live: avança após a duração configurada
    if (duration && duration > 0) {
      durTimer = setTimeout(onEnd, duration * 1000)
    }

    return () => {
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

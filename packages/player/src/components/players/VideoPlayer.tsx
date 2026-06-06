import { useEffect, useRef, useState } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'
import { onAudioUnlock } from '../../lib/audioUnlock'

interface Props {
  storagePath: string
  muted: boolean
  quality?: 'sd' | 'qhd' | 'hd' | 'fhd'
  onEnd: () => void
}

export default function VideoPlayer({ storagePath, muted, quality = 'fhd', onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [poster, setPoster] = useState<string | null>(null)
  // Esconde o <video> até ele REALMENTE começar a tocar. Antes disso a WebView
  // mostra o botão de play nativo (círculo com triângulo) — que o público não
  // pode ver. Enquanto escondido, fica o fundo preto/borrado por baixo.
  const [started, setStarted] = useState(false)
  // Vídeos novos têm 3 versões (storage_path = ..._fhd.mp4); a tela escolhe SD/HD/FHD.
  // Trocamos o sufixo para a qualidade da tela. Vídeo antigo (sem _fhd) fica como está.
  const path = quality !== 'fhd' ? storagePath.replace(/_fhd\.mp4$/, `_${quality}.mp4`) : storagePath
  // Cache-first: se o vídeo já foi baixado localmente, toca do IndexedDB
  // (sem internet e sem travar). Senão, faz streaming da rede.
  const { url } = useCachedUrl(path)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !url) return
    setPoster(null)
    setStarted(false)
    let captured = false
    const wantSound = !muted
    let gaveUpSound = false

    // Recuperação: se o vídeo pausar sozinho (provável bloqueio de som), volta
    // pro mudo e retoma — pra NUNCA ficar parado mostrando o botão de play.
    const onPause = () => {
      if (v.ended) return
      if (wantSound && !v.muted && !gaveUpSound) { gaveUpSound = true; v.muted = true }
      v.play().catch(() => { /* ignore */ })
    }
    v.addEventListener('pause', onPause)

    // Overlay de desbloqueio / gesto real → tenta o som de novo.
    const offUnlock = onAudioUnlock(() => {
      if (!wantSound) return
      gaveUpSound = false
      v.muted = false
      v.play().catch(() => { /* ignore */ })
    })

    // Começa SEMPRE mudo → autoplay é garantido em qualquer WebView/TV (autoplay
    // mudo nunca é bloqueado), então o botão de play nativo não aparece. Depois,
    // se a tela quer som, desmuta (no kiosk com a flag, sai som).
    v.muted = true
    v.play().then(() => { if (wantSound) v.muted = false }).catch(() => onEnd())

    // Captura UM quadro (após começar) pra usar de fundo borrado; e revela o vídeo
    // só DEPOIS do 1º segundo (esconde o comecinho, conforme pedido).
    const grabFrame = () => {
      if (v.currentTime >= 1) setStarted(true)
      if (!captured && v.videoWidth && v.currentTime >= 0.3) {
        captured = true
        try {
          const c = document.createElement('canvas')
          c.width = 320
          c.height = Math.max(1, Math.round(320 * (v.videoHeight / v.videoWidth)))
          const ctx = c.getContext('2d')
          if (ctx) {
            // Blur ASSADO no canvas (uma vez só). Assim o fundo é uma imagem
            // estática barata — sem filtro CSS recalculado a cada frame pela GPU,
            // que era o que causava as micro-travadas no box fraco.
            try { ctx.filter = 'blur(7px) brightness(0.5)' } catch { /* WebView sem canvas filter */ }
            ctx.drawImage(v, 0, 0, c.width, c.height)
            setPoster(c.toDataURL('image/jpeg', 0.6))
          }
        } catch { /* canvas tainted (vídeo de rede) → sem poster */ }
      }
      // Já capturou e passou do 1º segundo → não precisa mais ouvir.
      if (captured && v.currentTime >= 1) v.removeEventListener('timeupdate', grabFrame)
    }
    v.addEventListener('timeupdate', grabFrame)

    return () => {
      v.removeEventListener('timeupdate', grabFrame)
      v.removeEventListener('pause', onPause)
      offUnlock()
    }
  }, [url, muted, onEnd])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>

      {/* Fundo borrado (quadro estático do vídeo) — preenche o letterbox sem segundo decode */}
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            // Sem filtro CSS aqui: o blur já está assado na imagem (grabFrame).
            // Imagem estática = composição barata, não trava o vídeo por cima.
            transform: 'scale(1.1)',
          }}
          draggable={false}
        />
      )}

      {/* Vídeo principal — completo, sem corte (único elemento que decodifica) */}
      <video
        ref={videoRef}
        src={url || undefined}
        onEnded={onEnd}
        onError={() => onEnd()}   // formato não suportado / falha → pula para o próximo
        onPlaying={() => setStarted(true)}  // só revela quando está tocando de fato
        playsInline
        autoPlay
        muted={muted}
        controls={false}
        disablePictureInPicture
        preload="auto"
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', height: '100%',
          objectFit: 'contain',
          display: 'block',
          // Invisível até começar a tocar → esconde o botão de play da WebView.
          opacity: started ? 1 : 0,
          transition: 'opacity 150ms ease-in',
        }}
      />

      {/* Cobertura preta por cima ENQUANTO o vídeo não começou — garante esconder
          o botão de play nativo mesmo em WebView que o desenha numa camada própria. */}
      {!started && (
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
            background: '#000', zIndex: 2,
          }}
        />
      )}
    </div>
  )
}

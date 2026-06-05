import { useEffect, useRef, useState } from 'react'
import { useCachedUrl } from '../../hooks/useCachedUrl'

interface Props {
  storagePath: string
  muted: boolean
  quality?: 'sd' | 'hd' | 'fhd'
  onEnd: () => void
}

export default function VideoPlayer({ storagePath, muted, quality = 'fhd', onEnd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [poster, setPoster] = useState<string | null>(null)
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
    let captured = false

    // NÃO forçar currentTime=0: o elemento recém-criado (src novo) já começa do 0,
    // e reposicionar durante o decode causa o "frame verde quebrado" em box fraco.
    v.muted = muted
    v.play().catch(() => {
      v.muted = true
      v.play().catch(() => onEnd())
    })

    // Captura UM quadro (após começar a tocar) pra usar de fundo borrado — assim
    // preenchemos as laterais SEM um segundo vídeo decodificando (que travava a TV
    // e mostrava o símbolo de play). Só funciona com vídeo do cache local (blob);
    // se for de rede (canvas "tainted"), fica fundo escuro.
    const grabFrame = () => {
      if (captured || !v.videoWidth || v.currentTime < 0.3) return
      captured = true
      try {
        const c = document.createElement('canvas')
        c.width = 320
        c.height = Math.max(1, Math.round(320 * (v.videoHeight / v.videoWidth)))
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height)
          setPoster(c.toDataURL('image/jpeg', 0.5))
        }
      } catch { /* canvas tainted (vídeo de rede) → sem poster */ }
      v.removeEventListener('timeupdate', grabFrame)
    }
    v.addEventListener('timeupdate', grabFrame)

    return () => v.removeEventListener('timeupdate', grabFrame)
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
            filter: 'blur(24px) brightness(0.5)',
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
        }}
      />
    </div>
  )
}

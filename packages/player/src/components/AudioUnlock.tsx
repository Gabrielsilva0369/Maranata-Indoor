import { useEffect, useRef } from 'react'
import { forceAudioUnlock } from '../lib/audioUnlock'

/**
 * Overlay invisível "tap to start" que cobre a tela. Ele se **auto-clica** no
 * carregamento (clique sintético) para liberar o áudio do autoplay — no kiosk
 * com a flag "media requires user gesture: OFF", isso faz o som sair.
 *
 * Também aceita um **toque real** (em qualquer ponto): um gesto confiável é a
 * garantia final de desbloqueio do som. O overlay é transparente e não atrapalha
 * a exibição (signage não precisa de outras interações).
 */
export default function AudioUnlock() {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const tap = () => { try { el.click() } catch { /* ignore */ } }
    // Auto-clica no load e repete por alguns segundos (os players podem montar
    // depois — cada notify tenta desmutar de novo).
    tap()
    const id = setInterval(tap, 1500)
    const stop = setTimeout(() => clearInterval(id), 15000)
    return () => { clearInterval(id); clearTimeout(stop) }
  }, [])

  return (
    <button
      ref={ref}
      id="overlay"
      aria-label="tap to start"
      onClick={() => forceAudioUnlock()}
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
        width: '100%', height: '100%',
        opacity: 0,
        background: 'transparent',
        border: 'none',
        padding: 0,
        zIndex: 2147483647,   // por cima de tudo, mas invisível
        cursor: 'default',
      }}
    >
      tap to start
    </button>
  )
}

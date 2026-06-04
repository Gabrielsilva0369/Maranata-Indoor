// Gerencia o "desbloqueio" de áudio do navegador.
// O Chrome só permite autoplay COM som após uma interação do usuário.
// Aqui rastreamos a primeira interação e avisamos os players para desmutar.

let unlocked = false
const listeners = new Set<() => void>()

export function audioUnlocked() {
  return unlocked
}

export function onAudioUnlock(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function initAudioUnlock() {
  if (typeof window === 'undefined' || unlocked) return
  const handler = () => {
    if (unlocked) return
    unlocked = true
    listeners.forEach(cb => { try { cb() } catch { /* ignore */ } })
  }
  ;['pointerdown', 'touchstart', 'keydown', 'click'].forEach(ev =>
    window.addEventListener(ev, handler, { passive: true })
  )
}

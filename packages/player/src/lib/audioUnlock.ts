// Gerencia o "desbloqueio" de áudio do navegador.
// O navegador só permite som no autoplay após uma interação (ou com a flag de
// kiosk que dispensa o gesto). Aqui qualquer gesto — real OU o clique sintético
// do overlay "tap to start" — re-notifica os players para desmutarem.

let unlocked = false
const listeners = new Set<() => void>()

export function audioUnlocked() {
  return unlocked
}

export function onAudioUnlock(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

// Notifica TODOS os players a tentar desmutar. Idempotente: pode ser chamado
// várias vezes (a cada gesto). Num gesto REAL, o desmute roda dentro do stack
// confiável → o navegador libera o som (é a garantia final).
function notify() {
  unlocked = true
  listeners.forEach(cb => { try { cb() } catch { /* ignore */ } })
}

// Desbloqueio "forçado" (ex.: clique sintético do overlay no load).
export function forceAudioUnlock() {
  notify()
}

export function initAudioUnlock() {
  if (typeof window === 'undefined') return
  const handler = () => notify()
  ;['pointerdown', 'touchstart', 'keydown', 'click'].forEach(ev =>
    window.addEventListener(ev, handler, { passive: true })
  )
}

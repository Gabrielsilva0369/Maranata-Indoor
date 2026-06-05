/**
 * Checagem REAL de internet (não só navigator.onLine, que mente). Faz um toque
 * leve num endpoint de conectividade do Google (mesma infra do YouTube) com
 * tempo-limite. Usado antes de tocar YouTube/streaming: sem internet, o player
 * pula para o próximo item em vez de ficar numa tela preta/carregando.
 */
export async function hasInternet(timeoutMs = 5000): Promise<boolean> {
  // Sinal rápido: se o próprio SO já diz que está offline, nem tenta.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  if (typeof fetch === 'undefined') return true // sem como checar → assume online

  const url = 'https://www.gstatic.com/generate_204'
  const opts: RequestInit = { mode: 'no-cors', cache: 'no-store' }

  try {
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        await fetch(url, { ...opts, signal: ctrl.signal })
        return true
      } finally {
        clearTimeout(t)
      }
    }
    await fetch(url, opts)
    return true
  } catch {
    // Falha de rede (offline / DNS / timeout) → considera sem internet.
    return false
  }
}

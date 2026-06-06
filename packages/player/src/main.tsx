import React from 'react'
import ReactDOM from 'react-dom/client'
import ResizeObserverPolyfill from 'resize-observer-polyfill'
import { registerSW } from 'virtual:pwa-register'
import App from './App'

// Polyfill de ResizeObserver: a WebView de muitos sticks/boxes Android antigos
// (Chrome < 64) não tem ResizeObserver. Sem isto, o PlaylistPlayer quebra logo
// após o pareamento e a tela fica preta. core-js/legacy NÃO cobre esta API de DOM.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  ;(window as any).ResizeObserver = ResizeObserverPolyfill
}

// Armazenamento persistente: pede ao navegador/WebView para NÃO despejar o cache
// (IndexedDB/localStorage/Cache Storage). Sem isto, o sistema pode limpar os dados
// sob pressão de espaço — e o player abriria sem nada offline. Assim o cache
// sobrevive a fechar o app e a desligar/ligar o box (validade controlada nós: 24h).
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persisted?.().then(already => {
    if (!already) navigator.storage.persist().catch(() => {})
  }).catch(() => {})
}

// ============================================================
// Auto-update do PWA (atualizar = só redeployar o player)
// ============================================================
// O service worker dá o offline (cacheia app + mídias) e, com registerType
// 'autoUpdate', aplica versões novas sozinho (recarrega) quando o site é
// redeployado. Como o kiosk (Fully Kiosk) fica aberto por dias sem navegar,
// checamos atualização periodicamente.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => { registration.update().catch(() => {}) }, 15 * 60 * 1000)
    }
  },
})

// ============================================================
// Diagnóstico visível: qualquer erro grave aparece na tela
// em vez de ficar tudo preto sem informação
// ============================================================
function showFatalError(msg: string) {
  try {
    const el = document.getElementById('root')
    if (el) {
      el.innerHTML = `
        <div style="background:#1e1e2e;color:#f38ba8;padding:32px;font-family:monospace;font-size:14px;white-space:pre-wrap;width:100vw;height:100vh;overflow:auto;">
          <h2 style="color:#cdd6f4;margin-bottom:16px;">⚠ Maranata Indoor — Erro</h2>
          <p style="color:#a6adc8;margin-bottom:8px;">O player encontrou um erro. Reiniciando em 15 segundos...</p>
          <pre style="color:#f38ba8;">${msg}</pre>
        </div>
      `
    }
    // Auto-reload after 15 seconds so the device recovers
    setTimeout(() => location.reload(), 15_000)
  } catch { /* nada a fazer */ }
}

window.onerror = (_msg, _src, _line, _col, err) => {
  showFatalError(`window.onerror: ${err?.message ?? _msg}\n${err?.stack ?? ''}`)
}

window.onunhandledrejection = (ev: PromiseRejectionEvent) => {
  const reason = ev.reason
  showFatalError(`Unhandled Promise: ${reason?.message ?? reason}\n${reason?.stack ?? ''}`)
}

// ============================================================
// React Error Boundary
// ============================================================
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      const msg = `${this.state.error.message}\n\n${this.state.error.stack ?? ''}`
      // Auto-reload after 15 seconds
      setTimeout(() => location.reload(), 15_000)
      return (
        <div style={{
          background: '#1e1e2e', color: '#f38ba8', padding: 32,
          fontFamily: 'monospace', fontSize: 14, whiteSpace: 'pre-wrap',
          width: '100vw', height: '100vh', overflow: 'auto'
        }}>
          <h2 style={{ color: '#cdd6f4', marginBottom: 16 }}>⚠ Maranata Indoor — Erro</h2>
          <p style={{ color: '#a6adc8', marginBottom: 8 }}>
            O player encontrou um erro. Reiniciando em 15 segundos...
          </p>
          <pre style={{ color: '#f38ba8' }}>{msg}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================
// Render
// ============================================================
const rootEl = document.getElementById('root')

if (rootEl) {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    )
    // Sinaliza que o React montou — remove overlay de diagnóstico
    ;(window as any).__maranata_mounted = true
    const diag = document.getElementById('_diag')
    if (diag) diag.style.display = 'none'
  } catch (e: any) {
    showFatalError(`Render crash: ${e?.message ?? e}\n${e?.stack ?? ''}`)
  }
} else {
  showFatalError('Elemento #root não encontrado no DOM')
}

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export const APP_VERSION = '1.0.0'

interface Args {
  screenId: string | undefined
  currentMedia: string
  orientation: string
  /** Refresh suave: re-busca playlist/config e reinicia a reprodução SEM recarregar o navegador. */
  onRefresh?: () => void
}

function detectOS(ua: string): string {
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s([\d.]+)/)
    return m ? `Android ${m[1]}` : 'Android'
  }
  if (/Windows/i.test(ua)) return 'Windows'
  if (/iPhone|iPad|iOS/i.test(ua)) return 'iOS'
  if (/Mac OS/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Desconhecido'
}

async function buildTelemetry(currentMedia: string, orientation: string) {
  const ua = navigator.userAgent
  const res = `${window.screen.width} x ${window.screen.height} (${orientation === 'landscape' || orientation === 'landscape-reverse' ? 'Horizontal' : 'Vertical'})`

  let storageStr = ''
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      const usedMB = ((est.usage ?? 0) / 1024 / 1024).toFixed(1)
      storageStr = `${usedMB} MB`
    }
  } catch { /* ignore */ }

  // Diagnóstico de renderização: ajuda a entender "app roda mas tela preta".
  // Mostra UA completo (versão do Chrome/WebView), viewport e tamanho do #root.
  let diag = ''
  try {
    const root = document.getElementById('root')
    const sw = ('serviceWorker' in navigator) && navigator.serviceWorker.controller ? 'SW-on' : 'SW-off'
    diag = `vp ${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio} `
      + `root ${root?.clientWidth ?? -1}x${root?.clientHeight ?? -1} kids ${root?.childElementCount ?? -1} ${sw}`
  } catch { /* ignore */ }

  return {
    current_media: currentMedia,
    resolution: res,
    user_agent: detectOS(ua),
    app_version: APP_VERSION,
    storage_estimate: storageStr,
    ua_full: ua,
    diag,
    build: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '',
  }
}

export function useScreenSync({ screenId, currentMedia, orientation, onRefresh }: Args) {
  const mediaRef = useRef(currentMedia)
  mediaRef.current = currentMedia
  const orientationRef = useRef(orientation)
  orientationRef.current = orientation
  // Ref para sempre chamar o callback mais recente sem re-assinar o polling.
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  // Heartbeat + telemetria (online_since uma vez, last_seen + telemetria a cada 60s)
  useEffect(() => {
    if (!screenId) return
    let onlineSet = false

    const beat = async () => {
      const telemetry = await buildTelemetry(mediaRef.current, orientationRef.current)
      const patch: Record<string, unknown> = {
        last_seen: new Date().toISOString(),
        telemetry,
      }
      if (!onlineSet) {
        // Define online_since só se ainda estiver nulo
        const { data } = await supabase.from('screens').select('online_since').eq('id', screenId).maybeSingle()
        if (data && !data.online_since) patch.online_since = new Date().toISOString()
        onlineSet = true
      }
      await supabase.from('screens').update(patch).eq('id', screenId)
    }

    beat()
    const id = setInterval(beat, 60_000)
    return () => clearInterval(id)
  }, [screenId])

  // Atualiza a telemetria imediatamente sempre que a mídia atual muda
  useEffect(() => {
    if (!screenId || !currentMedia) return
    let cancelled = false
    ;(async () => {
      const telemetry = await buildTelemetry(currentMedia, orientationRef.current)
      if (cancelled) return
      await supabase
        .from('screens')
        .update({ telemetry, last_seen: new Date().toISOString() })
        .eq('id', screenId)
    })()
    return () => { cancelled = true }
  }, [screenId, currentMedia])

  // Polling de comandos remotos (a cada 15s)
  useEffect(() => {
    if (!screenId) return

    const checkCommand = async () => {
      const { data } = await supabase.from('screens').select('pending_command').eq('id', screenId).maybeSingle()
      const cmd = data?.pending_command
      if (!cmd) return

      // Limpa o comando antes de executar
      await supabase.from('screens').update({ pending_command: null }).eq('id', screenId)

      if (cmd === 'refresh') {
        // Refresh SUAVE: re-busca playlist/config e reinicia a reprodução,
        // atualizando a tela SEM recarregar o navegador (ideal pro kiosk).
        onRefreshRef.current?.()
      } else if (cmd === 'reload') {
        // Reload "duro": recarrega o navegador (força nova versão do app, etc.).
        location.reload()
      } else if (cmd === 'clear_cache') {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
        location.reload()
      }
    }

    const id = setInterval(checkCommand, 15_000)
    return () => clearInterval(id)
  }, [screenId])
}

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { clearAllCache } from '../lib/mediaCache'
import { captureAndUpload } from '../lib/screenshot'

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

function formatBytes(b: number): string {
  if (!b || b < 0) return ''
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

async function buildTelemetry(currentMedia: string, orientation: string) {
  const ua = navigator.userAgent
  const res = `${window.screen.width} x ${window.screen.height} (${orientation === 'landscape' || orientation === 'landscape-reverse' ? 'Horizontal' : 'Vertical'})`

  // ── Armazenamento: cache usado + total/livre disponível para o app ──
  let storageStr = ''   // cache usado (uso da origem: IndexedDB + Cache Storage + localStorage)
  let storageTotal = '' // total disponível para o app
  let storageFree = ''  // livre estimado
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      const usage = est.usage ?? 0
      const quota = est.quota ?? 0
      storageStr = formatBytes(usage)
      storageTotal = formatBytes(quota)
      storageFree = formatBytes(Math.max(0, quota - usage))
    }
  } catch { /* ignore */ }

  // ── Processador e memória RAM ──
  const cores = navigator.hardwareConcurrency
  const ramGb = (navigator as any).deviceMemory as number | undefined
  let cpuStr = cores ? `${cores} núcleos` : ''
  let deviceModel = ''
  try {
    const uaData = (navigator as any).userAgentData
    if (uaData?.getHighEntropyValues) {
      const hv = await uaData.getHighEntropyValues(['architecture', 'bitness', 'model'])
      const arch = hv.architecture ? `${hv.architecture}${hv.bitness ? '-' + hv.bitness : ''}` : ''
      deviceModel = hv.model || ''
      if (arch) cpuStr = cpuStr ? `${cpuStr} · ${arch}` : arch
    }
  } catch { /* WebView antiga sem userAgentData */ }
  const ramStr = ramGb ? `~${ramGb} GB` : ''

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
    storage_estimate: storageStr,   // cache salvo
    storage_total: storageTotal,    // disponível para o app
    storage_free: storageFree,      // livre estimado
    cpu: cpuStr,                    // processador (núcleos · arquitetura)
    ram: ramStr,                   // memória RAM aproximada
    device_model: deviceModel,     // modelo do aparelho (quando disponível)
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
        // Limpeza TOTAL: apaga os vídeos/imagens (IndexedDB), os caches do SW e
        // as notícias; também o precache do app. Depois recarrega e baixa do zero.
        await clearAllCache()
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
        location.reload()
      } else if (cmd === 'screenshot') {
        // Tira um print da tela atual e sobe pro admin.
        await captureAndUpload(screenId)
      }
    }

    const id = setInterval(checkCommand, 15_000)
    return () => clearInterval(id)
  }, [screenId])
}

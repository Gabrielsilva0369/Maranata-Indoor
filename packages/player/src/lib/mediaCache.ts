import { getPublicUrl } from './supabase'
import { refreshFeedArticles } from './newsCache'

const DB_NAME = 'MaranataMediaCache'
const DB_VERSION = 1
const STORE_NAME = 'media'

// Validade do cache do player: 24h. Passado isso, apaga TUDO e baixa de novo.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const BUILT_AT_KEY = 'maranata_cache_built_at'
// Caches do Service Worker que guardam conteúdo (NÃO inclui o precache do app).
const RUNTIME_CACHES = ['external-images', 'supabase-media', 'rss-feeds']

/** Verdadeiro se o cache nunca foi construído ou já passou de 24h. */
export function isCacheExpired(): boolean {
  try {
    const v = localStorage.getItem(BUILT_AT_KEY)
    if (!v) return true
    return Date.now() - Number(v) > CACHE_TTL_MS
  } catch {
    return false
  }
}

/** Marca o momento em que o cache foi (re)construído por completo. */
function markCacheBuilt(): void {
  try {
    localStorage.setItem(BUILT_AT_KEY, String(Date.now()))
  } catch {
    /* cota — ignora */
  }
}

/**
 * Apaga TODO o cache de conteúdo: mídias (IndexedDB), imagens/feeds do Service
 * Worker e notícias (localStorage). Não toca no precache do app (a casca offline).
 */
export async function clearAllCache(): Promise<void> {
  // IndexedDB (imagens/vídeos)
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error('[Cache] erro ao limpar IndexedDB:', e)
  }

  // Caches do Service Worker (imagens de notícia, mídia do Storage, feeds)
  try {
    if (typeof caches !== 'undefined') {
      await Promise.all(RUNTIME_CACHES.map(n => caches.delete(n)))
    }
  } catch (e) {
    console.error('[Cache] erro ao limpar Cache Storage:', e)
  }

  // Notícias em localStorage
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('maranata_news_')) localStorage.removeItem(k)
    }
  } catch {
    /* ignora */
  }
}

/**
 * Abre a conexão com o banco de dados IndexedDB.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

/**
 * Recupera um Blob do cache local pelo caminho de armazenamento do Supabase.
 */
export async function getCache(key: string): Promise<Blob | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  } catch (e) {
    console.error('[Cache] Erro ao ler cache do IndexedDB:', e)
    return null
  }
}

/**
 * Salva um Blob no cache local.
 */
export async function setCache(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(blob, key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (e) {
    console.error('[Cache] Erro ao escrever no IndexedDB:', e)
  }
}

/**
 * Remove um item do cache local.
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (e) {
    console.error('[Cache] Erro ao deletar do IndexedDB:', e)
  }
}

/**
 * Deleta arquivos do banco que não estão na lista de mídias ativas.
 */
export async function clearUnusedCache(keepKeys: string[]): Promise<void> {
  try {
    const db = await openDB()
    const allKeys: string[] = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAllKeys()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as string[])
    })

    const keepSet = new Set(keepKeys)
    for (const key of allKeys) {
      if (!keepSet.has(key)) {
        console.log('[Cache] Limpando arquivo não utilizado do cache local:', key)
        await deleteCache(key)
      }
    }
  } catch (e) {
    console.error('[Cache] Erro ao limpar cache obsoleto:', e)
  }
}

export interface SyncProgress {
  completed: number
  total: number
  status: 'syncing' | 'done' | 'error'
  currentFile?: string
}

/**
 * fetch com tempo-limite por arquivo: se um download EMPACAR (conexão aberta mas
 * sem terminar), abortamos e seguimos — assim a sincronização nunca trava pra
 * sempre e a tela de carregamento sempre chega ao fim.
 */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  // AbortController pode não existir em WebView muito antiga → fallback p/ fetch normal.
  if (typeof AbortController === 'undefined') return fetch(url)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/**
 * "Aquece" o cache do navegador/Service Worker para uma URL externa (capa de
 * notícia, logo de fonte, logo do rodapé). Cross-origin não vai pro IndexedDB
 * (resposta opaca), então quem guarda e serve depois é o Service Worker
 * (regra CacheFirst de imagens). Em mode:'no-cors' a resposta opaca já basta
 * pra ser cacheada e exibida via <img>.
 */
async function warmCache(url: string): Promise<void> {
  // Se já está no cache do Service Worker, não baixa de novo.
  try {
    if (typeof caches !== 'undefined') {
      const hit = await caches.match(url)
      if (hit) return
    }
  } catch {
    /* Cache Storage indisponível — segue e tenta baixar */
  }
  try {
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30000)
      try {
        await fetch(url, { mode: 'no-cors', signal: ctrl.signal })
      } finally {
        clearTimeout(t)
      }
    } else {
      await fetch(url, { mode: 'no-cors' })
    }
  } catch {
    /* sem rede / bloqueio: ignora — o <img> tenta a rede na hora de exibir */
  }
}

export interface FooterCacheInfo {
  logo_path?: string | null
  rss_feed_id?: string | null
  type?: string
}

/**
 * Pré-carrega TODO o conteúdo da playlist antes de tocar:
 *  • Imagens e vídeos (Storage) → IndexedDB (offline real, toca do blob)
 *  • Notícias (RSS): baixa os artigos por feed (localStorage) e aquece as
 *    imagens externas (capa + logo da fonte) no cache do Service Worker
 *  • Logo do rodapé (Storage) → aquecida para aparecer na hora
 * YouTube e lives (streaming) NÃO são baixados — tocam direto da rede.
 */
export async function syncMediaCache(
  items: any[],
  quality: 'sd' | 'hd' | 'fhd',
  footer: FooterCacheInfo | null,
  onProgress?: (progress: SyncProgress) => void
): Promise<void> {
  // ── 0. Validade de 24h: se o cache venceu (ou nunca existiu), apaga tudo e
  //       remarca — assim o loop abaixo rebaixa todo o conteúdo do zero. ──
  if (isCacheExpired()) {
    await clearAllCache()
    markCacheBuilt()
  }

  // ── 1. Mídias do Storage (imagens, vídeos, fundo do relógio) → IndexedDB ──
  const activePaths: string[] = []
  for (const item of items) {
    if (item.media) {
      const sp = item.media.storage_path
      // Imagens E vídeos são cacheados localmente para funcionar OFFLINE
      // (queda de internet / boot sem rede). O download é SEQUENCIAL (um de
      // cada vez, abaixo) — nunca em paralelo — para não saturar a banda.
      if (sp && item.media.type === 'image') {
        activePaths.push(sp)
      }
      if (sp && item.media.type === 'video') {
        // Cacheia a rendition da qualidade da tela (a mesma que o player toca).
        activePaths.push(quality !== 'fhd' ? sp.replace(/_fhd\.mp4$/, `_${quality}.mp4`) : sp)
      }
      if (item.media.type === 'clock' && item.media.clock_config?.bg_image_path) {
        activePaths.push(item.media.clock_config.bg_image_path)
      }
    }
  }

  // ── 2. Notícias (RSS): baixa os artigos por feed e coleta imagens externas ──
  // Feeds usados nos itens da playlist + o feed do rodapé (se for do tipo RSS).
  const feedIds = new Set<string>()
  for (const item of items) {
    const fid = item.rss_feed_id || item.rss_feed?.id
    if (fid) feedIds.add(fid)
  }
  if (footer?.type === 'rss' && footer.rss_feed_id) feedIds.add(footer.rss_feed_id)

  // URLs externas para "aquecer" no Service Worker (imagens de notícia + logo do rodapé).
  const warmUrls: string[] = []
  if (footer?.logo_path) warmUrls.push(getPublicUrl(footer.logo_path))
  for (const fid of feedIds) {
    try {
      const imgs = await refreshFeedArticles(fid)
      warmUrls.push(...imgs)
    } catch {
      /* offline: usa o cache de artigos anterior */
    }
  }

  const total = activePaths.length + warmUrls.length
  if (total === 0) {
    onProgress?.({ completed: 0, total: 0, status: 'done' })
    await clearUnusedCache([])
    return
  }

  onProgress?.({ completed: 0, total, status: 'syncing' })
  let completed = 0

  // ── Mídias → IndexedDB ──
  for (const path of activePaths) {
    onProgress?.({
      completed, total, status: 'syncing',
      currentFile: path.split('/').pop() || path,
    })
    try {
      // Só baixa se ainda não estiver no cache local (evita re-download)
      const cachedBlob = await getCache(path)
      if (!cachedBlob) {
        const res = await fetchWithTimeout(getPublicUrl(path), 90000)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        await setCache(path, blob)
      }
    } catch {
      // Falha de um arquivo não interrompe os demais; o player faz streaming
      // desse item enquanto não estiver cacheado.
      console.warn('[Cache] Não foi possível cachear (vai por streaming):', path)
    }
    completed++
  }

  // ── Imagens de notícias + logo do rodapé → aquece o cache do Service Worker ──
  for (const url of warmUrls) {
    onProgress?.({ completed, total, status: 'syncing', currentFile: 'notícias' })
    await warmCache(url)
    completed++
  }

  onProgress?.({ completed, total, status: 'done' })

  // Limpa do IndexedDB os arquivos que não estão mais na playlist ativa
  await clearUnusedCache(activePaths)
}

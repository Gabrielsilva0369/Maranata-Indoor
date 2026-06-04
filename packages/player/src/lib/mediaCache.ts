import { getPublicUrl } from './supabase'

const DB_NAME = 'MaranataMediaCache'
const DB_VERSION = 1
const STORE_NAME = 'media'

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
 * Varre a playlist, baixa todas as mídias em background e limpa as antigas.
 */
export async function syncMediaCache(
  items: any[],
  onProgress?: (progress: SyncProgress) => void
): Promise<void> {
  // Extrai todos os caminhos de arquivos que devem ser mantidos
  const activePaths: string[] = []
  for (const item of items) {
    if (item.media) {
      // Imagens E vídeos são cacheados localmente para funcionar OFFLINE
      // (queda de internet / boot sem rede). O download é SEQUENCIAL (um de
      // cada vez, abaixo) — nunca em paralelo — para não saturar a banda.
      if (item.media.storage_path && (item.media.type === 'image' || item.media.type === 'video')) {
        activePaths.push(item.media.storage_path)
      }
      if (item.media.type === 'clock' && item.media.clock_config?.bg_image_path) {
        activePaths.push(item.media.clock_config.bg_image_path)
      }
    }
  }

  if (activePaths.length === 0) {
    onProgress?.({ completed: 0, total: 0, status: 'done' })
    await clearUnusedCache([])
    return
  }

  // Avisa que a sincronização começou
  onProgress?.({ completed: 0, total: activePaths.length, status: 'syncing' })

  let completedCount = 0
  for (const path of activePaths) {
    onProgress?.({
      completed: completedCount,
      total: activePaths.length,
      status: 'syncing',
      currentFile: path.split('/').pop() || path,
    })

    try {
      // Só baixa se ainda não estiver no cache local (evita re-download)
      const cachedBlob = await getCache(path)
      if (!cachedBlob) {
        const res = await fetch(getPublicUrl(path))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        await setCache(path, blob)
      }
    } catch {
      // Falha de um arquivo não interrompe os demais; o player faz streaming
      // desse item enquanto não estiver cacheado.
      console.warn('[Cache] Não foi possível cachear (vai por streaming):', path)
    }

    completedCount++
  }

  onProgress?.({ completed: completedCount, total: activePaths.length, status: 'done' })

  // Limpa arquivos do cache que não estão mais na playlist ativa
  await clearUnusedCache(activePaths)
}

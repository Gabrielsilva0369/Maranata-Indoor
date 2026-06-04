import { useState, useEffect } from 'react'
import { getCache } from '../lib/mediaCache'
import { getPublicUrl } from '../lib/supabase'

/**
 * Hook para carregar uma mídia do cache local (IndexedDB) e criar uma URL local Object URL.
 * Em caso de falha ou arquivo não baixado ainda, faz fallback para a URL de rede do Supabase.
 */
export function useCachedUrl(storagePath: string | null) {
  const [url, setUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!storagePath) {
      setUrl('')
      setLoading(false)
      return
    }

    const path = storagePath
    let active = true
    let objectUrl: string | null = null

    async function resolveUrl() {
      // 1. Tenta recuperar do cache IndexedDB
      const blob = await getCache(path)
      if (!active) return

      if (blob) {
        // Cria uma Object URL local baseada no Blob
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setLoading(false)
      } else {
        // 2. Se não estiver cacheado ainda, usa a URL pública da rede como fallback
        console.warn(`[Cache] Arquivo não encontrado no cache local, usando rede: ${path}`)
        setUrl(getPublicUrl(path))
        setLoading(false)
      }
    }

    resolveUrl()

    // Cleanup: revoga a URL do Blob para evitar vazamento de memória
    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [storagePath])

  return { url, loading }
}

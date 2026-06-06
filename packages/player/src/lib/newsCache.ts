import { supabase } from './supabase'
import { timeoutSignal } from './network'

export interface CachedArticle {
  id: string
  title: string
  description: string | null
  image_url: string | null
  source_logo: string | null
  source_name: string | null
  pub_date: string | null
}

const KEY = (feedId: string) => `maranata_news_${feedId}`

/**
 * Lê os artigos já baixados do feed (localStorage). Permite que o player e o
 * rodapé mostrem as notícias na hora — inclusive offline — sem esperar a rede.
 */
export function getCachedArticles(feedId: string): CachedArticle[] {
  try {
    const raw = localStorage.getItem(KEY(feedId))
    return raw ? (JSON.parse(raw) as CachedArticle[]) : []
  } catch {
    return []
  }
}

/**
 * Baixa os artigos do feed e grava no cache local. Devolve as URLs de imagem
 * (capa + logo da fonte) para serem aquecidas no cache do Service Worker.
 * Offline / erro: mantém o cache anterior e devolve [].
 */
export async function refreshFeedArticles(feedId: string, cap = 20): Promise<string[]> {
  // Timeout para não pendurar o boot offline.
  let query = supabase
    .from('rss_articles')
    .select('id, title, description, image_url, source_logo, source_name, pub_date')
    .eq('feed_id', feedId)
    .eq('active', true)
    .order('pub_date', { ascending: false })
    .limit(cap)
  const sig = timeoutSignal(8000)
  if (sig) query = query.abortSignal(sig)

  let data: CachedArticle[] | null = null
  try {
    const res = await query
    if (res.error) return []
    data = res.data as CachedArticle[]
  } catch {
    return [] // offline / abortado → mantém o cache anterior
  }
  if (!data) return []

  try {
    localStorage.setItem(KEY(feedId), JSON.stringify(data))
  } catch {
    /* cota de localStorage estourada — segue sem persistir */
  }

  const urls: string[] = []
  for (const a of data) {
    if (a.image_url) urls.push(a.image_url)
    if (a.source_logo) urls.push(a.source_logo)
  }
  return urls
}

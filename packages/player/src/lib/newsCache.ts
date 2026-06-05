import { supabase } from './supabase'

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
export async function refreshFeedArticles(feedId: string, cap = 40): Promise<string[]> {
  const { data, error } = await supabase
    .from('rss_articles')
    .select('id, title, description, image_url, source_logo, source_name, pub_date')
    .eq('feed_id', feedId)
    .eq('active', true)
    .order('pub_date', { ascending: false })
    .limit(cap)

  if (error || !data) return []

  try {
    localStorage.setItem(KEY(feedId), JSON.stringify(data))
  } catch {
    /* cota de localStorage estourada — segue sem persistir */
  }

  const urls: string[] = []
  for (const a of data as CachedArticle[]) {
    if (a.image_url) urls.push(a.image_url)
    if (a.source_logo) urls.push(a.source_logo)
  }
  return urls
}

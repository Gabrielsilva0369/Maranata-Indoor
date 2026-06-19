import { supabase } from './supabase'
import { timeoutSignal } from './network'
import { newsImageUrl } from './newsImage'
import type { VideoQuality } from './quality'

export interface CachedArticle {
  id: string
  title: string
  description: string | null
  image_url: string | null
  source_logo: string | null
  source_name: string | null
  pub_date: string | null
  link: string | null
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

interface RefreshOpts {
  offset?: number       // posição inicial (para aquecer imagens do intervalo certo)
  cap?: number          // qtd de notícias a aquecer partindo do offset
  links?: string[]      // modo legado: aquece só as notícias com esses links
  quality?: VideoQuality
  warmImages?: boolean  // false p/ feed só de rodapé (texto) — não baixa imagens
}

/**
 * Baixa todos os artigos ativos do feed (até 20) e grava TODOS no cache local.
 * O player seleciona o intervalo certo via offset+count em tempo real, sem nova
 * chamada à rede. Devolve as URLs de imagem do intervalo exibido para aquecer no
 * Service Worker. Offline/erro: mantém o cache anterior.
 */
export async function refreshFeedArticles(feedId: string, opts: RefreshOpts = {}): Promise<string[]> {
  const { offset = 0, cap = 5, links = [], quality = 'fhd', warmImages = true } = opts
  let query = supabase
    .from('rss_articles')
    .select('id, title, description, image_url, source_logo, source_name, pub_date, link')
    .eq('feed_id', feedId)
    .eq('active', true)
    .order('pub_date', { ascending: false })
    .limit(20)
  const sig = timeoutSignal(8000)
  if (sig) query = query.abortSignal(sig)

  let all: CachedArticle[] | null = null
  try {
    const res = await query
    if (res.error) return []
    all = res.data as CachedArticle[]
  } catch {
    return [] // offline / abortado → mantém o cache anterior
  }
  if (!all) return []

  // Guarda TODOS os artigos do feed — o player fatia pelo offset em tempo real.
  try {
    localStorage.setItem(KEY(feedId), JSON.stringify(all))
  } catch {
    /* cota de localStorage estourada — segue sem persistir */
  }

  if (!warmImages) return []

  // Aquece as imagens do intervalo que realmente será exibido.
  const toWarm = links.length
    ? all.filter(a => a.link && links.includes(a.link))
    : all.slice(offset, offset + cap)

  const urls: string[] = []
  for (const a of toWarm) {
    const cover = newsImageUrl(a.image_url, quality)
    const logo  = newsImageUrl(a.source_logo, quality, 0.2)
    if (cover) urls.push(cover)
    if (logo)  urls.push(logo)
  }
  return urls
}

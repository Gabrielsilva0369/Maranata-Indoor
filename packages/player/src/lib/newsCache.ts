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
  cap?: number              // qtd de notícias recentes a guardar (itens automáticos)
  links?: string[]          // notícias escolhidas (por link) a guardar SEMPRE
  quality?: VideoQuality
  warmImages?: boolean      // false p/ feed só de rodapé (texto) — não baixa imagens
}

/**
 * Baixa os artigos do feed e grava no cache local APENAS os que vão ser exibidos
 * (as `cap` mais recentes ∪ as escolhidas por `links`). Devolve as URLs de imagem
 * (capa + logo) para aquecer no Service Worker. Offline/erro: mantém o anterior.
 */
export async function refreshFeedArticles(feedId: string, opts: RefreshOpts = {}): Promise<string[]> {
  const { cap = 5, links = [], quality = 'fhd', warmImages = true } = opts
  // Busca um conjunto maior (até 20) e filtra localmente o que será guardado.
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

  // Guarda só o necessário: escolhidas (por link) + as `cap` mais recentes.
  const chosen = links.length ? all.filter(a => a.link && links.includes(a.link)) : []
  const recent = cap > 0 ? all.slice(0, cap) : []
  const seen = new Set<string>()
  const needed: CachedArticle[] = []
  for (const a of [...chosen, ...recent]) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    needed.push(a)
  }

  try {
    localStorage.setItem(KEY(feedId), JSON.stringify(needed))
  } catch {
    /* cota de localStorage estourada — segue sem persistir */
  }

  if (!warmImages) return []

  // Aquece as MESMAS URLs que o player vai pedir (redimensionadas pela qualidade).
  const urls: string[] = []
  for (const a of needed) {
    const cover = newsImageUrl(a.image_url, quality)
    const logo = newsImageUrl(a.source_logo, quality, 0.2)
    if (cover) urls.push(cover)
    if (logo) urls.push(logo)
  }
  return urls
}

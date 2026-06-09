import type { VideoQuality } from './quality'

// Largura alvo das imagens de notícia por qualidade da tela. A imagem ocupa a
// tela inteira no RssNewsPlayer, então usamos a largura cheia de cada qualidade.
const WIDTHS: Record<VideoQuality, number> = {
  sd: 854, qhd: 960, hd: 1280, fhd: 1920,
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/news-img`

/**
 * URL da imagem de notícia redimensionada para a qualidade da tela, via a Edge
 * Function `news-img`. Se a função/proxy falhar, ela mesma redireciona (302)
 * para a original — então o `<img>` continua funcionando.
 *
 * `scale` (0–1) reduz a largura alvo p/ imagens menores (ex.: logo da fonte).
 */
export function newsImageUrl(origUrl: string | null | undefined, quality: VideoQuality, scale = 1): string | null {
  if (!origUrl) return null
  if (!/^https?:\/\//i.test(origUrl)) return origUrl
  const w = Math.max(64, Math.round(WIDTHS[quality] * scale))
  return `${FN_BASE}?url=${encodeURIComponent(origUrl)}&w=${w}`
}

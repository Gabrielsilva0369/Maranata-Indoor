export type VideoQuality = 'sd' | 'qhd' | 'hd' | 'fhd'

// Mídias novas têm 4 renderizações (..._fhd.mp4 / ..._fhd.jpg); a tela escolhe a
// versão da sua qualidade trocando o sufixo. Mídia antiga (sem _fhd) fica como
// está — por isso o fallback devolve o caminho original.
const RENDITION_RE = /_fhd\.(mp4|jpg|jpeg|png|webp)$/i

/** Caminho da rendition da qualidade da tela, com fallback ao caminho original. */
export function qualityPath(path: string, quality: VideoQuality): string {
  if (quality === 'fhd') return path
  return path.replace(RENDITION_RE, (_m, ext) => `_${quality}.${ext}`)
}

/** Verdadeiro se o caminho é uma mídia com renderizações por qualidade. */
export function hasRenditions(path: string): boolean {
  return RENDITION_RE.test(path)
}

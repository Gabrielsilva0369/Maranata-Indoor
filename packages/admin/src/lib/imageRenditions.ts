import type { Quality } from './videoTranscode'

// Caixa máxima de cada qualidade (mesmas do vídeo). A imagem é reduzida para
// caber DENTRO da caixa (contain), preservando proporção e NUNCA ampliando.
const BOXES: Record<Quality, { w: number; h: number }> = {
  sd:  { w: 854,  h: 480 },
  qhd: { w: 960,  h: 540 },
  hd:  { w: 1280, h: 720 },
  fhd: { w: 1920, h: 1080 },
}

const QUALITIES: Quality[] = ['sd', 'qhd', 'hd', 'fhd']

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob falhou'))),
      'image/jpeg',
      q,
    )
  })
}

/**
 * Gera 4 renderizações JPEG da imagem (SD/540p/HD/FullHD), reduzindo por
 * "contain" dentro da caixa de cada qualidade (sem ampliar). Mesma ideia das
 * renditions de vídeo: a tela baixa só a versão da sua qualidade → menos RAM e
 * banda no box fraco.
 */
export async function resizeImageRenditions(
  file: Blob,
): Promise<{ renditions: Record<Quality, Blob>; sizes: Record<string, number> }> {
  const img = await loadImage(file)
  const ow = img.naturalWidth || img.width
  const oh = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d indisponível')

  const renditions = {} as Record<Quality, Blob>
  const sizes: Record<string, number> = {}

  for (const q of QUALITIES) {
    const box = BOXES[q]
    // contain: cabe dentro da caixa, nunca amplia
    const scale = Math.min(box.w / ow, box.h / oh, 1)
    const w = Math.max(1, Math.round(ow * scale))
    const h = Math.max(1, Math.round(oh * scale))
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await canvasToJpeg(canvas, 0.82)
    renditions[q] = blob
    sizes[q] = blob.size
  }

  return { renditions, sizes }
}

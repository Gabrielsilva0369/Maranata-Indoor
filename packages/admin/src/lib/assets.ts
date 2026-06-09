import { supabase } from './supabase'
import { uploadToSpaces, deleteFromSpaces } from './spaces'
import { resizeImageRenditions } from './imageRenditions'
import type { Quality } from './videoTranscode'

// Store de imagens endereçado por conteúdo (dedup): a mesma imagem (mesmo
// SHA-256) é guardada UMA vez na DO, com contagem de referências. Assim subir
// 50 frases com o mesmo fundo gera 1 arquivo e o player baixa 1 vez só.

const QUALITIES: Quality[] = ['sd', 'qhd', 'hd', 'fhd']

async function sha256(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Deriva os 4 caminhos das renditions a partir do path base (..._fhd.jpg). */
function renditionPaths(basePath: string): string[] {
  return QUALITIES.map(q => basePath.replace(/_fhd\.jpg$/, `_${q}.jpg`))
}

/**
 * Sobe uma imagem (ou reaproveita se idêntica já existe) e devolve o caminho
 * base (..._fhd.jpg) + os tamanhos das renditions. Incrementa o contador de
 * referências do asset.
 *
 * `prefix` define a pasta no Storage (ex.: 'images', 'quotes-bg', 'clock-bg').
 */
export async function putAsset(
  file: Blob,
  prefix = 'images',
): Promise<{ path: string; rendition_sizes: Record<string, number> }> {
  const hash = await sha256(file)

  // Já existe esse conteúdo? Reaproveita sem subir nada.
  const { data: existing } = await supabase
    .from('assets')
    .select('path, rendition_sizes, refs')
    .eq('hash', hash)
    .maybeSingle()

  if (existing) {
    await supabase.from('assets').update({ refs: existing.refs + 1 }).eq('hash', hash)
    return { path: existing.path, rendition_sizes: existing.rendition_sizes ?? {} }
  }

  // Novo: gera as 4 renditions e sobe.
  const { renditions, sizes } = await resizeImageRenditions(file)
  const base = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}`
  for (const q of QUALITIES) {
    await uploadToSpaces(`${base}_${q}.jpg`, renditions[q], 'image/jpeg')
  }
  const path = `${base}_fhd.jpg`
  await supabase.from('assets').insert({ hash, path, rendition_sizes: sizes, refs: 1 })
  return { path, rendition_sizes: sizes }
}

/**
 * Marca mais uma referência a um asset já existente (reaproveitar uma imagem já
 * enviada, sem subir nada). Mantém o refcount correto p/ o releaseAsset.
 */
export async function retainAsset(path: string | null | undefined): Promise<void> {
  if (!path) return
  const { data } = await supabase.from('assets').select('hash, refs').eq('path', path).maybeSingle()
  if (data) await supabase.from('assets').update({ refs: data.refs + 1 }).eq('hash', data.hash)
}

/**
 * Libera uma referência de um asset. Quando chega a zero, apaga as renditions
 * da DO e remove o registro. Caminho que não é um asset gerenciado (legado, sem
 * linha na tabela) é apagado direto.
 */
export async function releaseAsset(path: string | null | undefined): Promise<void> {
  if (!path) return

  // Renditions novas terminam em _fhd.jpg e estão na tabela assets.
  if (/_fhd\.jpg$/.test(path)) {
    const { data: row } = await supabase
      .from('assets')
      .select('hash, refs')
      .eq('path', path)
      .maybeSingle()

    if (row) {
      if (row.refs > 1) {
        await supabase.from('assets').update({ refs: row.refs - 1 }).eq('hash', row.hash)
        return
      }
      // Última referência: apaga arquivos + registro.
      await Promise.all(renditionPaths(path).map(p => deleteFromSpaces(p)))
      await supabase.from('assets').delete().eq('hash', row.hash)
      return
    }
    // _fhd.jpg sem linha (caso raro) → apaga as 4 mesmo assim.
    await Promise.all(renditionPaths(path).map(p => deleteFromSpaces(p)))
    return
  }

  // Legado (imagem única sem renditions) → apaga direto.
  await deleteFromSpaces(path)
}

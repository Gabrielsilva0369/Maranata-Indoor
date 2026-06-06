import { supabase } from './supabase'

// Upload/exclusão de mídia na DigitalOcean Spaces, via URL assinada gerada por
// uma Edge Function (a chave secreta fica no servidor, nunca no navegador).
// Leitura é pela CDN.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/media-presign`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const MEDIA_CDN =
  (import.meta.env.VITE_MEDIA_CDN as string | undefined) ||
  'https://maranata-indoor.sfo3.cdn.digitaloceanspaces.com'

/** URL pública (CDN) de um arquivo no Spaces. */
export function mediaUrl(path: string): string {
  return `${MEDIA_CDN}/${path.replace(/^\/+/, '')}`
}

async function presign(path: string, method: 'PUT' | 'DELETE'): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? ANON
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path, method }),
  })
  if (!res.ok) throw new Error(`Falha ao assinar upload (${res.status})`)
  const { url, error } = await res.json()
  if (!url) throw new Error(error || 'presign sem url')
  return url as string
}

/** Sobe um arquivo para o Spaces (caminho = mesma estrutura de antes, ex: "videos/..."). */
export async function uploadToSpaces(path: string, file: Blob, contentType: string): Promise<void> {
  const url = await presign(path, 'PUT')
  const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
  if (!res.ok) throw new Error(`Upload para a DO falhou (${res.status})`)
}

/** Apaga um arquivo do Spaces (silencioso). */
export async function deleteFromSpaces(path: string | null | undefined): Promise<void> {
  if (!path) return
  try {
    const url = await presign(path, 'DELETE')
    await fetch(url, { method: 'DELETE' })
  } catch {
    /* não bloqueia o fluxo se a exclusão falhar */
  }
}

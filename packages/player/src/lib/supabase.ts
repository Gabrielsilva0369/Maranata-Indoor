import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

// As mídias (vídeos/imagens) são servidas pela CDN da DigitalOcean Spaces — não
// mais pelo Supabase Storage. Isso elimina o egress do Supabase (que estourava o
// limite do plano free). O caminho salvo no banco (ex: "videos/123_fhd.mp4") é o
// mesmo; só muda a base da URL.
const MEDIA_CDN = (import.meta.env.VITE_MEDIA_CDN as string | undefined)
  || 'https://maranata-indoor.sfo3.cdn.digitaloceanspaces.com'

export function getPublicUrl(storagePath: string) {
  const clean = storagePath.replace(/^\/+/, '')
  return `${MEDIA_CDN}/${clean}`
}

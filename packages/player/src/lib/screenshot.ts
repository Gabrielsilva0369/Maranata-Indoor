import html2canvas from 'html2canvas'
import { supabase } from './supabase'

/**
 * Captura a tela atual do player e sobe pro Storage (bucket 'screenshots'),
 * gravando a URL em screens.last_screenshot. Usado pelo comando "Tirar print"
 * do admin.
 *
 * Limitação: vídeo do YouTube (iframe) e lives saem PRETOS — renderizam numa
 * camada que o html2canvas não enxerga. Imagens, notícias, relógio, clima,
 * rodapé e vídeo em cache (blob) saem normalmente.
 */
export async function captureAndUpload(screenId: string): Promise<boolean> {
  try {
    const target = document.getElementById('root') || document.body
    const canvas = await html2canvas(target, {
      useCORS: true,
      backgroundColor: '#000',
      logging: false,
      // Limita a largura ~1280px pra imagem não ficar pesada.
      scale: Math.min(1, 1280 / Math.max(1, window.innerWidth)),
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    })

    const blob: Blob | null = await new Promise(res =>
      canvas.toBlob(b => res(b), 'image/jpeg', 0.7),
    )
    if (!blob) return false

    const file = `${screenId}.jpg`
    const { error } = await supabase.storage
      .from('screenshots')
      .upload(file, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) {
      console.error('[Print] Falha no upload:', error)
      return false
    }

    const { data } = supabase.storage.from('screenshots').getPublicUrl(file)
    // ?t= quebra o cache do <img> no admin pra mostrar o print novo.
    const url = `${data.publicUrl}?t=${Date.now()}`

    await supabase
      .from('screens')
      .update({ last_screenshot: url, last_screenshot_at: new Date().toISOString() })
      .eq('id', screenId)
    return true
  } catch (e) {
    console.error('[Print] Falha ao capturar a tela:', e)
    return false
  }
}

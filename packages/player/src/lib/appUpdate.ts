/**
 * Aplica a atualização do app: força o Service Worker a buscar a versão nova do
 * site e recarrega. Como o player é hospedado, "atualizar" = pegar o build novo
 * que foi publicado. Funciona em qualquer box (é só recarregar a página).
 */
export async function applyUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await new Promise<void>(resolve => {
          let done = false
          const finish = () => { if (!done) { done = true; resolve() } }

          // Quando o SW novo assume o controle (skipWaiting/clientsClaim), seguimos.
          navigator.serviceWorker.addEventListener('controllerchange', finish)

          reg.update().then(() => {
            // Se já tem um SW esperando, manda ativar; se não há nada novo, segue.
            if (reg.waiting) {
              try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }) } catch { /* ignore */ }
            } else if (!reg.installing) {
              finish()
            }
          }).catch(finish)

          // Rede de segurança: não trava na tela de atualização.
          setTimeout(finish, 8000)
        })
      }
    }
  } catch {
    /* ignore — recarrega de qualquer forma abaixo */
  }
  // Recarrega: o SW novo serve os arquivos da versão nova.
  location.reload()
}

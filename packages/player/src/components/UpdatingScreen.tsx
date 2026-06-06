// Tela mostrada quando o app está se atualizando (comando "Atualizar App" do
// admin). Fica visível enquanto busca a versão nova e recarrega.
export default function UpdatingScreen() {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
      background: '#0b1220', color: '#e5e7eb',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 26, fontFamily: 'system-ui, -apple-system, sans-serif', zIndex: 2147483647,
    }}>
      <img
        src="/icon-512.png"
        alt="Maranata"
        style={{ width: 130, height: 130, borderRadius: 24, objectFit: 'cover', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
      />
      <div style={{ fontSize: 20, fontWeight: 700 }}>Atualizando app…</div>
      <div style={{
        width: 46, height: 46, borderRadius: '50%',
        border: '4px solid #1f2937', borderTopColor: '#60a5fa',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 13, color: '#9ca3af' }}>Aguarde, não desligue a tela.</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

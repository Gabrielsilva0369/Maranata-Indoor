import type { SyncProgress } from '../lib/mediaCache'

interface Props {
  sync: SyncProgress | null
}

// Tela inicial de carregamento: aparece quando a tela liga / a playlist muda,
// enquanto o player baixa TODO o conteúdo (imagens e vídeos) para o cache local.
// YouTube e lives (streaming) não são baixados — tocam direto da rede.
export default function LoadingScreen({ sync }: Props) {
  const total = sync?.total ?? 0
  const completed = sync?.completed ?? 0
  const pct = total ? Math.round((completed / total) * 100) : 0
  const started = sync != null && total > 0

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
      background: '#0b1220', color: '#e5e7eb',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 26, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <img
        src="/icon-512.png"
        alt="Maranata"
        style={{
          width: 140, height: 140, borderRadius: 24, objectFit: 'cover',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      />

      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.3 }}>
        {started ? 'Baixando conteúdos…' : 'Preparando o player…'}
      </div>

      {/* Barra de progresso */}
      <div style={{ width: 320, maxWidth: '70vw' }}>
        <div style={{
          width: '100%', height: 8, background: '#1f2937',
          borderRadius: 999, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: started ? `${pct}%` : '30%',
            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
            borderRadius: 999,
            transition: 'width 250ms linear',
            animation: started ? undefined : 'indeterminate 1.2s ease-in-out infinite',
          }} />
        </div>

        <div style={{
          marginTop: 12, display: 'flex', justifyContent: 'space-between',
          fontSize: 13, color: '#9ca3af',
        }}>
          <span>{started ? `${completed} de ${total}` : 'Conectando…'}</span>
          {started && <span>{pct}%</span>}
        </div>
      </div>

      {sync?.currentFile && (
        <div style={{
          fontSize: 12, color: '#6b7280', maxWidth: '70vw',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sync.currentFile}
        </div>
      )}

      <style>{`
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
      `}</style>
    </div>
  )
}

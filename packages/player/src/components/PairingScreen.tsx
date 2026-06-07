import { useEffect, useState } from 'react'

interface Props {
  pairCode: string
  onRetry: () => void
}

export default function PairingScreen({ pairCode, onRetry }: Props) {
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 600)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(onRetry, 5_000)
    return () => clearInterval(id)
  }, [onRetry])

  return (
    <div
      style={{
        width: '100%', height: '100%', background: '#111827',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', color: '#fff',
      }}
    >
      <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 4 }}>
        Maranata Indoor
      </div>
      <div style={{ fontSize: 18, color: '#d1d5db', marginBottom: 32 }}>
        Aguardando pareamento{dots}
      </div>
      <div
        style={{
          background: '#1f2937', border: '2px solid #374151',
          borderRadius: 16, padding: '32px 48px', textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          No painel admin, clique em "Adicionar Tela" e insira o código:
        </p>
        <div
          style={{
            fontSize: 56, fontWeight: 700, letterSpacing: 12,
            fontFamily: 'monospace', color: '#60a5fa',
          }}
        >
          {pairCode}
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#4b5563', marginTop: 24 }}>
        Verificando a cada 5 segundos...
      </p>
    </div>
  )
}

import { useEffect, useState } from 'react'

interface Props {
  url: string | null
  htmlContent: string | null
  duration: number
  showProgress?: boolean
  onEnd: () => void
}

export default function HtmlPlayer({ url, htmlContent, duration, showProgress = true, onEnd }: Props) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    const total = duration * 1000

    const tick = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.min(elapsed / total, 1)
      setProgress(pct)
      if (pct >= 1) {
        clearInterval(tick)
        onEnd()
      }
    }, 50)

    return () => clearInterval(tick)
  }, [url, htmlContent, duration, onEnd])

  const iframeSrc = url || undefined
  const iframeSrcDoc = !url && htmlContent ? htmlContent : undefined

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
      <iframe
        src={iframeSrc}
        srcDoc={iframeSrcDoc}
        style={{ width: '100%', height: '100%', border: 'none' }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        title="html-content"
      />
      {showProgress && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 3, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: '#60a5fa', transition: 'width 50ms linear' }} />
        </div>
      )}
    </div>
  )
}

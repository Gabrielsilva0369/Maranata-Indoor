import { useEffect, useState, type ReactNode } from 'react'
import type { ScreenOrientation } from '../hooks/usePlaylist'

/**
 * Adapta o conteúdo à orientação configurada da tela.
 * - landscape: sem rotação (padrão).
 * - portrait: gira 90° horário (box emite paisagem, TV montada na vertical).
 * - portrait-reverse: gira 90° anti-horário.
 *
 * Em modo retrato, o container interno recebe dimensões trocadas
 * (largura = altura da tela, altura = largura da tela) e é rotacionado
 * para preencher a tela física corretamente.
 */
export default function OrientationWrapper({
  orientation,
  children,
}: {
  orientation: ScreenOrientation
  children: ReactNode
}) {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  if (orientation === 'landscape') {
    return (
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
        {children}
      </div>
    )
  }

  // Paisagem invertida: mesmas dimensões, girada 180°
  if (orientation === 'landscape-reverse') {
    return (
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', transform: 'rotate(180deg)' }}>
        {children}
      </div>
    )
  }

  // Retrato: dimensões trocadas + rotação.
  // Canvas lógico = (altura da tela) de largura × (largura da tela) de altura.
  // Translação posiciona o canvas rotacionado de volta para dentro da viewport.
  const portraitStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: vp.h,   // largura lógica = altura da tela física
    height: vp.w,  // altura lógica = largura da tela física
    overflow: 'hidden',
    transformOrigin: 'top left',
    transform:
      orientation === 'portrait'
        ? `translateX(${vp.w}px) rotate(90deg)`         // 90° horário
        : `translateY(${vp.h}px) rotate(-90deg)`,       // 90° anti-horário
  }

  return <div style={portraitStyle}>{children}</div>
}

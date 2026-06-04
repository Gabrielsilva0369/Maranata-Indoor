import { useMemo } from 'react'

const KEY = 'maranata_screen_token'

function generateToken() {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  // Fallback para WebViews antigas que não suportam crypto.randomUUID (RFC4122 v4 UUID)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function useScreenToken() {
  const token = useMemo(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) return stored
    const fresh = generateToken()
    localStorage.setItem(KEY, fresh)
    return fresh
  }, [])

  // Pairing code: first 6 chars of UUID, uppercase (no dashes)
  const pairCode = token.replace(/-/g, '').slice(0, 6).toUpperCase()

  return { token, pairCode }
}

import { useMemo } from 'react'

const KEY = 'maranata_screen_token'

function generateToken() {
  return crypto.randomUUID()
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

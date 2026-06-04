import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useHeartbeat(screenId: string | undefined) {
  useEffect(() => {
    if (!screenId) return

    const beat = async () => {
      await supabase
        .from('screens')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', screenId)
    }

    beat()
    const id = setInterval(beat, 60_000)
    return () => clearInterval(id)
  }, [screenId])
}

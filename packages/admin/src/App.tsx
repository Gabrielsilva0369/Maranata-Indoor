import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Screens from './pages/Screens'
import ScreenDetail from './pages/ScreenDetail'
import Media from './pages/Media'
import RssFeeds from './pages/RssFeeds'
import Playlists from './pages/Playlists'
import PlaylistEditor from './pages/PlaylistEditor'
import Reports from './pages/Reports'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        {session ? (
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="screens" element={<Screens />} />
            <Route path="screens/:id" element={<ScreenDetail />} />
            <Route path="media" element={<Media />} />
            <Route path="rss" element={<RssFeeds />} />
            <Route path="playlists" element={<Playlists />} />
            <Route path="playlists/:id" element={<PlaylistEditor />} />
            <Route path="reports" element={<Reports />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}

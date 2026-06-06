import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Monitor, Image, ListVideo, LayoutDashboard, LogOut, Rss, DownloadCloud, FileBarChart } from 'lucide-react'
import { supabase } from '../lib/supabase'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/screens', icon: Monitor, label: 'Telas' },
  { to: '/media', icon: Image, label: 'Mídias' },
  { to: '/rss', icon: Rss, label: 'RSS' },
  { to: '/playlists', icon: ListVideo, label: 'Playlists' },
  { to: '/reports', icon: FileBarChart, label: 'Relatórios' },
  { to: '/updates', icon: DownloadCloud, label: 'Atualizações' },
]

export default function Layout() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-lg font-bold tracking-tight">Maranata Indoor</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-6 py-4 text-sm text-gray-400 hover:text-white border-t border-gray-700 transition-colors"
        >
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}

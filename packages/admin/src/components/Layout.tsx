import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Monitor, Image, ListVideo, LayoutDashboard, LogOut, Rss, FileBarChart, Users, Menu, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/screens', icon: Monitor, label: 'Telas' },
  { to: '/media', icon: Image, label: 'Mídias' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/rss', icon: Rss, label: 'RSS' },
  { to: '/playlists', icon: ListVideo, label: 'Playlists' },
  { to: '/reports', icon: FileBarChart, label: 'Relatórios' },
]

export default function Layout() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleNavClick = (to: string) => {
    navigate(to)
    setMenuOpen(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar — Desktop */}
      <aside className="hidden md:flex w-56 bg-gray-900 text-white flex-col shrink-0">
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

      {/* Mobile Menu Button + Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b z-40 p-4 flex items-center justify-between">
        <span className="text-lg font-bold text-gray-900">Maranata Indoor</span>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu — Fullscreen */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-gray-900 text-white z-30 flex flex-col overflow-y-auto">
          <nav className="flex-1 px-3 py-4 space-y-2">
            {nav.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => handleNavClick(to)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-4 text-sm text-gray-400 hover:text-white border-t border-gray-700 transition-colors w-full"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-50 md:pt-0 pt-16">
        <Outlet />
      </main>
    </div>
  )
}

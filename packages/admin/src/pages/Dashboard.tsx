import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen } from '../lib/database.types'
import { Monitor, Wifi, WifiOff } from 'lucide-react'

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 90_000
}

export default function Dashboard() {
  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ['screens'],
    queryFn: async () => {
      const { data, error } = await supabase.from('screens').select('*').order('created_at')
      if (error) throw error
      return data
    },
    refetchInterval: 30_000,
  })

  const online = screens.filter(s => isOnline(s.last_seen)).length

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Telas cadastradas" value={screens.length} icon={<Monitor size={24} />} />
        <StatCard label="Online agora" value={online} icon={<Wifi size={24} />} color="green" />
        <StatCard label="Offline" value={screens.length - online} icon={<WifiOff size={24} />} color="red" />
      </div>

      <h3 className="text-lg font-semibold mb-4">Status das Telas</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {screens.map(screen => (
          <ScreenCard key={screen.id} screen={screen} />
        ))}
        {screens.length === 0 && (
          <p className="col-span-3 text-gray-400 text-sm">Nenhuma tela cadastrada ainda.</p>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, color = 'blue' }: {
  label: string; value: number; icon: React.ReactNode; color?: 'blue' | 'green' | 'red'
}) {
  const colors = { blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', red: 'bg-red-50 text-red-600' }
  return (
    <div className="bg-white rounded-xl border p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function ScreenCard({ screen }: { screen: Screen }) {
  const online = isOnline(screen.last_seen)
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{screen.name}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="text-xs text-gray-400 font-mono">{screen.token.slice(0, 6).toUpperCase()}</p>
      {screen.last_seen && (
        <p className="text-xs text-gray-400 mt-1">
          Visto: {new Date(screen.last_seen).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}

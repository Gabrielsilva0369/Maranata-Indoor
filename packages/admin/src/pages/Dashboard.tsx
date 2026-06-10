import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Screen } from '../lib/database.types'
import { Monitor, Wifi, WifiOff, DownloadCloud, Loader2, ChevronRight } from 'lucide-react'

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 90_000
}

export default function Dashboard() {
  const qc = useQueryClient()
  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ['screens'],
    queryFn: async () => {
      const { data, error } = await supabase.from('screens').select('*').order('created_at')
      if (error) throw error
      return data
    },
    refetchInterval: 30_000,
  })

  // Atualiza TODAS as telas para a nova versão do player (comando 'update').
  // Não desconecta nada — só recarrega buscando a versão nova ("Atualizando app").
  const updateAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('screens')
        .update({ pending_command: 'update' })
        .not('id', 'is', null) // todas as telas
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screens'] }),
  })

  const online = screens.filter(s => isOnline(s.last_seen)).length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <button
          onClick={() => { if (confirm('Atualizar TODAS as telas para a nova versão do player? Elas não serão desconectadas — só vão recarregar a versão nova.')) updateAll.mutate() }}
          disabled={updateAll.isPending || screens.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          {updateAll.isPending ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
          Atualizar todas as telas
        </button>
      </div>
      {updateAll.isSuccess && (
        <p className="text-sm text-emerald-600 mb-4 -mt-2">
          Comando enviado ✓ As telas vão atualizar assim que receberem (em até ~15s, se online).
        </p>
      )}

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
  const navigate = useNavigate()
  const online = isOnline(screen.last_seen)
  return (
    <button
      onClick={() => navigate(`/screens/${screen.id}`)}
      className="bg-white rounded-xl border p-5 hover:border-brand-400 hover:shadow-md transition-all text-left cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold group-hover:text-brand-600 transition-colors">{screen.name}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {online ? 'Online' : 'Offline'}
          </span>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-600 transition-colors" />
        </div>
      </div>
      <p className="text-xs text-gray-400 font-mono">{screen.token.slice(0, 6).toUpperCase()}</p>
      {screen.last_seen && (
        <p className="text-xs text-gray-400 mt-1">
          Visto: {new Date(screen.last_seen).toLocaleString('pt-BR')}
        </p>
      )}
    </button>
  )
}

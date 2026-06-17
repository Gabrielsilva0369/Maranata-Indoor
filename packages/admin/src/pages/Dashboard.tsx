import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen, Client, ClientPayment } from '../lib/database.types'
import { Monitor, Wifi, WifiOff, DownloadCloud, Loader2, Users, TrendingUp, Wallet, DollarSign } from 'lucide-react'
import DashboardCharts from '../components/DashboardCharts'

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 90_000
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id,status,cost_monthly')
      if (error) throw error
      return data as Client[]
    },
  })

  const { data: paidPayments = [] } = useQuery<ClientPayment[]>({
    queryKey: ['all-paid-payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_payments').select('client_id,amount').eq('paid', true)
      if (error) throw error
      return data as ClientPayment[]
    },
  })

  const updateAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('screens').update({ pending_command: 'update' }).not('id', 'is', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screens'] }),
  })

  const online = screens.filter(s => isOnline(s.last_seen)).length

  // Clientes por status
  const byStatus = (s: string) => clients.filter(c => c.status === s).length

  // Financeiro acumulado
  const costByClient = Object.fromEntries(clients.map(c => [c.id, c.cost_monthly ?? 0]))
  const paidCountByClient: Record<string, number> = {}
  for (const p of paidPayments) paidCountByClient[p.client_id] = (paidCountByClient[p.client_id] ?? 0) + 1
  const totalRecebido = paidPayments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const totalCusto = Object.entries(paidCountByClient).reduce((s, [cid, n]) => s + (costByClient[cid] ?? 0) * n, 0)
  const totalResultado = totalRecebido - totalCusto

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold">Dashboard</h2>
        <button
          onClick={() => { if (confirm('Atualizar TODAS as telas para a nova versão do player?')) updateAll.mutate() }}
          disabled={updateAll.isPending || screens.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 w-full sm:w-auto justify-center">
          {updateAll.isPending ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
          <span className="hidden sm:inline">Atualizar todas</span>
          <span className="sm:hidden">Atualizar</span>
        </button>
      </div>
      {updateAll.isSuccess && (
        <p className="text-xs sm:text-sm text-emerald-600 mb-4 -mt-2">Comando enviado ✓ As telas vão atualizar em até ~15s.</p>
      )}

      {/* Métricas de clientes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <StatCard label="Total clientes" value={clients.length} icon={<Users size={20} />} color="blue" />
        <StatCard label="Ativos" value={byStatus('ativo')} icon={<Users size={20} />} color="green" />
        <StatCard label="Pausados" value={byStatus('pausado')} icon={<Users size={20} />} color="sky" />
        <StatCard label="Cancelados" value={byStatus('cancelado')} icon={<Users size={20} />} color="gray" />
      </div>

      {/* Métricas financeiras */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <FinCard label="Total recebido" value={totalRecebido} icon={<DollarSign size={20} />} color="green" />
        <FinCard label="Total custo" value={totalCusto} icon={<Wallet size={20} />} color="blue" />
        <FinCard label="Resultado total" value={totalResultado} icon={<TrendingUp size={20} />} color={totalResultado >= 0 ? 'green' : 'red'} />
      </div>

      {/* Métricas de telas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <StatCard label="Telas cadastradas" value={screens.length} icon={<Monitor size={20} />} />
        <StatCard label="Online agora" value={online} icon={<Wifi size={20} />} color="green" />
        <StatCard label="Offline" value={screens.length - online} icon={<WifiOff size={20} />} color="red" />
      </div>

      <DashboardCharts screens={screens} />
    </div>
  )
}

function StatCard({ label, value, icon, color = 'blue' }: {
  label: string; value: number; icon: React.ReactNode; color?: 'blue' | 'green' | 'red' | 'sky' | 'gray'
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    sky: 'bg-sky-50 text-sky-600',
    gray: 'bg-gray-100 text-gray-500',
  }
  return (
    <div className="bg-white rounded-lg sm:rounded-xl border p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
      <div className={`p-2.5 sm:p-3 rounded-lg ${colors[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xl sm:text-2xl font-bold">{value}</p>
        <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )
}

function FinCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode; color: 'green' | 'blue' | 'red'
}) {
  const colors = {
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
  }
  const valueColors = { green: 'text-emerald-600', blue: 'text-slate-700', red: 'text-red-600' }
  return (
    <div className="bg-white rounded-lg sm:rounded-xl border p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
      <div className={`p-2.5 sm:p-3 rounded-lg shrink-0 ${colors[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-xl sm:text-2xl font-bold ${valueColors[color]}`}>{brl(value)}</p>
        <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )
}

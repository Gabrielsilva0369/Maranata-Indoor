import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen } from '../lib/database.types'
import { BarChart3, PieChart, Clock, Film, MonitorPlay } from 'lucide-react'

// ── Tipos de retorno das RPCs ───────────────────────────────────────────────
interface DailyRow { day: string; total: number; seconds: number }
interface TypeRow { type: string; total: number; seconds: number }
interface MediaRow { name: string; total: number; seconds: number }
interface HourRow { hour: number; total: number }
interface ScreenRow { screen_id: string; total: number; seconds: number }

// Rótulos/cores amigáveis por tipo de conteúdo.
const TYPE_META: Record<string, { label: string; color: string }> = {
  image:   { label: 'Imagens',   color: '#0ea5e9' },
  video:   { label: 'Vídeos',    color: '#6366f1' },
  rss:     { label: 'Notícias',  color: '#f59e0b' },
  clock:   { label: 'Relógio',   color: '#14b8a6' },
  weather: { label: 'Clima',     color: '#38bdf8' },
  quotes:  { label: 'Frases',    color: '#8b5cf6' },
  youtube: { label: 'YouTube',   color: '#ef4444' },
  stream:  { label: 'Streaming', color: '#ec4899' },
  html:    { label: 'HTML',      color: '#64748b' },
  outros:  { label: 'Outros',    color: '#94a3b8' },
}

// Soma de segundos → "2h 15min" / "15min" / "30s"
function fmtDur(totalSec: number): string {
  const s = Math.round(totalSec || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}min`
  if (m) return `${m}min`
  return `${s}s`
}

// Chama uma RPC; em erro (ex.: migração ainda não aplicada) degrada p/ vazio.
function useRpc<T>(fn: string, args: Record<string, unknown>, key: unknown[]) {
  return useQuery<T[]>({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(fn, args)
      if (error) { console.warn(`[dashboard] ${fn}:`, error.message); return [] }
      return (data ?? []) as T[]
    },
    refetchInterval: 60_000,
  })
}

// ── Primitivos de gráfico ───────────────────────────────────────────────────

function ChartCard({ title, icon, children, action }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-slate-700">
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ msg = 'Sem dados no período.' }: { msg?: string }) {
  return <p className="text-xs text-gray-400 py-8 text-center">{msg}</p>
}

// Barras verticais (exibições por dia, atividade por hora).
function VBars({ data, accent = 'brand' }: {
  data: { label: string; value: number; sub?: string }[]; accent?: 'brand' | 'amber'
}) {
  if (data.every(d => d.value === 0)) return <Empty />
  const max = Math.max(1, ...data.map(d => d.value))
  const from = accent === 'amber' ? 'from-amber-500' : 'from-brand-500'
  const to = accent === 'amber' ? 'to-amber-400' : 'to-brand-400'
  return (
    <div className="flex items-end gap-1 sm:gap-1.5 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 group">
          <span className="text-[10px] font-semibold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {d.value}
          </span>
          <div
            title={`${d.sub ?? d.label}: ${d.value}`}
            className={`w-full rounded-t bg-gradient-to-t ${from} ${to} transition-all hover:brightness-110`}
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
          />
          <span className="text-[9px] sm:text-[10px] text-slate-400 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// Rosca (distribuição por tipo).
function Donut({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  if (total === 0) return <Empty />
  const R = 42, C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex items-center gap-4 sm:gap-5 flex-col sm:flex-row">
      <div className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="w-28 h-28 sm:w-32 sm:h-32 -rotate-90">
          <circle cx={50} cy={50} r={R} fill="none" stroke="#f1f5f9" strokeWidth={14} />
          {data.map((d, i) => {
            const len = (d.value / total) * C
            const el = (
              <circle key={i} cx={50} cy={50} r={R} fill="none" stroke={d.color} strokeWidth={14}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
            )
            offset += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg sm:text-xl font-bold text-slate-800">{total}</span>
          <span className="text-[10px] text-slate-400">exibições</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 w-full">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="flex-1 text-slate-600 break-words">{d.label}</span>
            <span className="font-semibold text-slate-700 shrink-0">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Barras horizontais (top mídias, atividade por tela).
function HBars({ data, accent = 'brand' }: {
  data: { label: string; value: number; sub?: string }[]; accent?: 'brand' | 'teal'
}) {
  if (data.length === 0) return <Empty />
  const max = Math.max(1, ...data.map(d => d.value))
  const grad = accent === 'teal' ? 'from-teal-500 to-teal-400' : 'from-brand-500 to-brand-400'
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={i}>
          <div className="flex justify-between items-baseline text-xs mb-1 gap-2">
            <span className="text-slate-600 break-words min-w-0">{d.label}</span>
            <span className="font-semibold text-slate-700 shrink-0">
              {d.value}{d.sub && <span className="text-slate-400 font-normal"> · {d.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${grad}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Componente principal ────────────────────────────────────────────────────

export default function DashboardCharts({ screens }: { screens: Screen[] }) {
  const [days, setDays] = useState(7)

  const { data: daily = [] }   = useRpc<DailyRow>('dash_daily_exhibitions', { days }, ['dash-daily', days])
  const { data: types = [] }   = useRpc<TypeRow>('dash_type_breakdown', { days }, ['dash-types', days])
  const { data: topMedia = [] }= useRpc<MediaRow>('dash_top_media', { days, lim: 6 }, ['dash-top', days])
  const { data: hourly = [] }  = useRpc<HourRow>('dash_hourly_activity', { days }, ['dash-hourly', days])
  const { data: byScreen = [] }= useRpc<ScreenRow>('dash_screen_activity', { days }, ['dash-screens', days])

  // Exibições por dia: preenche dias faltantes com 0, ordena cronologicamente.
  const dailyMap = new Map(daily.map(d => [d.day, d]))
  const dayBars = Array.from({ length: days }, (_, i) => {
    const dt = new Date()
    dt.setDate(dt.getDate() - (days - 1 - i))
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const row = dailyMap.get(key)
    const showLabel = days <= 10 || i % Math.ceil(days / 8) === 0
    return {
      label: showLabel ? `${dt.getDate()}/${dt.getMonth() + 1}` : '',
      sub: dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      value: row?.total ?? 0,
    }
  })

  // Tipos: agrupa por rótulo amigável.
  const typeAgg = new Map<string, number>()
  for (const t of types) {
    const meta = TYPE_META[t.type] ?? TYPE_META.outros
    typeAgg.set(meta.label, (typeAgg.get(meta.label) ?? 0) + Number(t.total))
  }
  const colorByLabel = new Map(Object.values(TYPE_META).map(m => [m.label, m.color]))
  const typeData = Array.from(typeAgg.entries())
    .map(([label, value]) => ({ label, value, color: colorByLabel.get(label) ?? '#94a3b8' }))
    .sort((a, b) => b.value - a.value)
  const typeTotal = typeData.reduce((a, d) => a + d.value, 0)

  // Top mídias.
  const topData = topMedia.map(m => ({
    label: m.name, value: Number(m.total), sub: fmtDur(Number(m.seconds)),
  }))

  // Atividade por hora: 0–23 com zeros preenchidos.
  const hourMap = new Map(hourly.map(h => [Number(h.hour), Number(h.total)]))
  const hourBars = Array.from({ length: 24 }, (_, h) => ({
    label: h % 3 === 0 ? `${h}h` : '',
    sub: `${h}h–${h + 1}h`,
    value: hourMap.get(h) ?? 0,
  }))

  // Atividade por tela (mapeia nome via lista de telas).
  const nameById = new Map(screens.map(s => [s.id, s.name]))
  const screenData = byScreen.slice(0, 6).map(s => ({
    label: nameById.get(s.screen_id) ?? '— removida —',
    value: Number(s.total),
    sub: fmtDur(Number(s.seconds)),
  }))

  const periodBtn = (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {[{ d: 7, l: '7 dias' }, { d: 30, l: '30 dias' }].map(o => (
        <button key={o.d} onClick={() => setDays(o.d)}
          className={`px-2.5 py-1 font-medium transition-colors ${days === o.d ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-gray-50'}`}>
          {o.l}
        </button>
      ))}
    </div>
  )

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg sm:text-xl font-semibold">Visão geral</h3>
        {periodBtn}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Exibições por dia — largura total */}
        <div className="lg:col-span-2">
          <ChartCard title="Exibições por dia" icon={<BarChart3 size={18} className="text-brand-600" />}>
            <VBars data={dayBars} />
          </ChartCard>
        </div>

        <ChartCard title="Distribuição por tipo" icon={<PieChart size={18} className="text-brand-600" />}>
          <Donut data={typeData} total={typeTotal} />
        </ChartCard>

        <ChartCard title="Mídias mais exibidas" icon={<Film size={18} className="text-brand-600" />}>
          <HBars data={topData} />
        </ChartCard>

        <ChartCard title="Atividade por hora do dia" icon={<Clock size={18} className="text-brand-600" />}>
          <VBars data={hourBars} accent="amber" />
        </ChartCard>

        <ChartCard title="Atividade por tela" icon={<MonitorPlay size={18} className="text-brand-600" />}>
          <HBars data={screenData} accent="teal" />
        </ChartCard>
      </div>
    </div>
  )
}

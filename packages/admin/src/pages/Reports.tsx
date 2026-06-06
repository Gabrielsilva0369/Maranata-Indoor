import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen } from '../lib/database.types'
import { FileBarChart, FileDown, Loader2, Monitor, Film } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface LogRow {
  name: string
  type: string | null
  shown_at: string
}
interface MediaLogRow {
  screen_id: string
  shown_at: string
}

const PERIODS = [
  { key: 'today', label: 'Hoje', days: 0 },
  { key: '7', label: 'Últimos 7 dias', days: 7 },
  { key: '15', label: 'Últimos 15 dias', days: 15 },
  { key: '30', label: 'Últimos 30 dias', days: 30 },
] as const

function category(row: LogRow): string {
  if (row.type === 'rss') return row.name
  return 'Arquivos'
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function periodStart(days: number): Date {
  const d = new Date()
  if (days === 0) d.setHours(0, 0, 0, 0)
  else d.setDate(d.getDate() - days)
  return d
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '0%')

export default function Reports() {
  const [mode, setMode] = useState<'screen' | 'media'>('screen')
  const [screenId, setScreenId] = useState('')
  const [mediaName, setMediaName] = useState('')
  const [period, setPeriod] = useState<typeof PERIODS[number]['key']>('today')
  const [generating, setGenerating] = useState(false)

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ['screens'],
    queryFn: async () => {
      const { data, error } = await supabase.from('screens').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  // Lista de mídias (nomes) para o relatório por mídia.
  const { data: mediaNames = [] } = useQuery<string[]>({
    queryKey: ['media-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('media').select('name').order('name')
      if (error) throw error
      const names = (data ?? []).map((m: { name: string }) => m.name).filter(Boolean)
      return Array.from(new Set(names)) // sem duplicados
    },
  })

  // Limpa logs com mais de 30 dias ao abrir (garantia extra além do cron).
  useQuery({
    queryKey: ['purge-logs'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('exhibition_logs').delete().lt('shown_at', cutoff)
      return true
    },
    staleTime: Infinity,
  })

  const periodInfo = PERIODS.find(p => p.key === period)!
  const screenName = (id: string) => screens.find(s => s.id === id)?.name ?? '—'

  function header(doc: jsPDF, logo: HTMLImageElement | null, subtitle: string, now: Date) {
    const fmt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const x = logo ? 104 : 40
    if (logo) { try { doc.addImage(logo, 'PNG', 40, 28, 52, 52) } catch { /* ignora */ } }
    doc.setFontSize(16); doc.setTextColor(30)
    doc.text('Relatório de Exibições', x, 48)
    doc.setFontSize(11); doc.setTextColor(90)
    doc.text(`Maranata Marketing  -  ${subtitle}`, x, 66)
    doc.setFontSize(9); doc.setTextColor(130)
    doc.text(`Gerado em ${fmt(now)}`, x, 81)
  }

  function pageFooter(doc: jsPDF, now: Date) {
    const fmt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const page = doc.getNumberOfPages()
    doc.setFontSize(8); doc.setTextColor(150)
    doc.text(`Relatório gerado em ${fmt(now)}`, 40, doc.internal.pageSize.getHeight() - 20)
    doc.text(`${page}`, doc.internal.pageSize.getWidth() - 50, doc.internal.pageSize.getHeight() - 20)
  }

  // Paginação genérica de logs.
  async function fetchPaged<T>(build: (from: number, to: number) => any): Promise<T[]> {
    const out: T[] = []
    let from = 0
    const PAGE = 1000
    for (;;) {
      const { data, error } = await build(from, from + PAGE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      out.push(...(data as T[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    return out
  }

  // ── Relatório POR TELA ──
  async function generateByScreen() {
    if (!screenId) return
    const screen = screens.find(s => s.id === screenId)
    const since = periodStart(periodInfo.days)
    const rows = await fetchPaged<LogRow>((from, to) => supabase
      .from('exhibition_logs').select('name, type, shown_at')
      .eq('screen_id', screenId).gte('shown_at', since.toISOString())
      .order('shown_at', { ascending: true }).range(from, to))

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const now = new Date()
    const periodLabel = periodInfo.days === 0
      ? now.toLocaleDateString('pt-BR')
      : `${since.toLocaleDateString('pt-BR')} a ${now.toLocaleDateString('pt-BR')}`
    const logo = await loadImage('/maranata-logo.png')
    header(doc, logo, screen?.name ?? 'Tela', now)

    doc.setFontSize(11); doc.setTextColor(30)
    doc.text(`Total de itens exibidos: ${rows.length}`, 40, 116)
    doc.text(`Período: ${periodInfo.label} (${periodLabel})`, 40, 132)

    const byCat = new Map<string, number>()
    const byFile = new Map<string, number>()
    for (const r of rows) {
      byCat.set(category(r), (byCat.get(category(r)) ?? 0) + 1)
      if (r.type !== 'rss') byFile.set(r.name, (byFile.get(r.name) ?? 0) + 1)
    }
    const totalFiles = [...byFile.values()].reduce((a, b) => a + b, 0)
    const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, String(n), pct(n, rows.length)])
    const fileRows = [...byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => [f, String(n), pct(n, totalFiles)])

    autoTable(doc, { startY: 152, head: [['Categoria', 'Exibições', '%']], body: catRows, styles: { fontSize: 9 }, headStyles: { fillColor: [37, 99, 235] }, margin: { left: 40, right: 40 } })
    if (fileRows.length) {
      autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 16, head: [['Arquivo', 'Exibições', '%']], body: fileRows, styles: { fontSize: 9 }, headStyles: { fillColor: [13, 148, 136] }, margin: { left: 40, right: 40 } })
    }

    const multiDay = periodInfo.days !== 0
    const listRows = rows.map(r => {
      const t = new Date(r.shown_at)
      const when = multiDay
        ? t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      return [when, r.type === 'rss' ? 'Notícias/RSS' : (r.type ?? '—'), r.name]
    })
    autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 20, head: [['Quando', 'Tipo', 'Item']], body: listRows, styles: { fontSize: 8 }, headStyles: { fillColor: [71, 85, 105] }, margin: { left: 40, right: 40 }, didDrawPage: () => pageFooter(doc, now) })

    const safe = (screen?.name ?? 'tela').replace(/[^\w\-]+/g, '-')
    doc.save(`relatorio-${safe}-${periodInfo.key}-${now.toISOString().slice(0, 10)}.pdf`)
  }

  // ── Relatório POR MÍDIA (para o cliente) ──
  async function generateByMedia() {
    if (!mediaName) return
    const since = periodStart(periodInfo.days)
    const rows = await fetchPaged<MediaLogRow>((from, to) => supabase
      .from('exhibition_logs').select('screen_id, shown_at')
      .eq('name', mediaName).gte('shown_at', since.toISOString())
      .order('shown_at', { ascending: true }).range(from, to))

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const now = new Date()
    const periodLabel = periodInfo.days === 0
      ? now.toLocaleDateString('pt-BR')
      : `${since.toLocaleDateString('pt-BR')} a ${now.toLocaleDateString('pt-BR')}`
    const logo = await loadImage('/maranata-logo.png')
    header(doc, logo, `Mídia: ${mediaName}`, now)

    doc.setFontSize(11); doc.setTextColor(30)
    doc.text(`Total de exibições: ${rows.length}`, 40, 116)
    doc.text(`Período: ${periodInfo.label} (${periodLabel})`, 40, 132)

    // Detalhamento por tela
    const byScreen = new Map<string, number>()
    for (const r of rows) byScreen.set(r.screen_id, (byScreen.get(r.screen_id) ?? 0) + 1)
    const screenRows = [...byScreen.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, n]) => [screenName(id), String(n), pct(n, rows.length)])

    autoTable(doc, { startY: 152, head: [['Tela', 'Exibições', '%']], body: screenRows, styles: { fontSize: 9 }, headStyles: { fillColor: [37, 99, 235] }, margin: { left: 40, right: 40 } })

    const multiDay = periodInfo.days !== 0
    const listRows = rows.map(r => {
      const t = new Date(r.shown_at)
      const when = multiDay
        ? t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      return [when, screenName(r.screen_id)]
    })
    autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 20, head: [['Quando', 'Tela']], body: listRows, styles: { fontSize: 8 }, headStyles: { fillColor: [71, 85, 105] }, margin: { left: 40, right: 40 }, didDrawPage: () => pageFooter(doc, now) })

    const safe = mediaName.replace(/[^\w\-]+/g, '-')
    doc.save(`relatorio-midia-${safe}-${periodInfo.key}-${now.toISOString().slice(0, 10)}.pdf`)
  }

  async function generate() {
    setGenerating(true)
    try {
      if (mode === 'screen') await generateByScreen()
      else await generateByMedia()
    } catch (e) {
      console.error(e)
      alert('Falha ao gerar o relatório.')
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate = mode === 'screen' ? !!screenId : !!mediaName

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="flex items-center gap-2 text-2xl font-bold mb-1">
        <FileBarChart size={24} className="text-brand-600" /> Relatórios de Exibição
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Gere um PDF com o que foi exibido no período. Os registros ficam guardados por 30 dias.
      </p>

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        {/* Modo */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode('screen')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${mode === 'screen' ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
            <Monitor size={16} /> Por tela
          </button>
          <button onClick={() => setMode('media')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${mode === 'media' ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
            <Film size={16} /> Por mídia (cliente)
          </button>
        </div>

        {mode === 'screen' ? (
          <div>
            <label className="block text-sm font-medium mb-1">Tela</label>
            <select value={screenId} onChange={e => setScreenId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">— Escolha uma tela —</option>
              {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Mídia</label>
            <select value={mediaName} onChange={e => setMediaName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">— Escolha uma mídia —</option>
              {mediaNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Conta as exibições dessa mídia em TODAS as telas, com detalhamento por tela.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Período</label>
          <div className="grid grid-cols-4 gap-2">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`py-2 px-1 rounded-lg border text-xs font-medium transition-colors ${period === p.key ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:border-brand-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={!canGenerate || generating}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Gerando…</> : <><FileDown size={16} /> Gerar PDF</>}
        </button>
      </div>
    </div>
  )
}

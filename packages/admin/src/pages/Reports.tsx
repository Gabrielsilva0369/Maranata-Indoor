import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Screen } from '../lib/database.types'
import { FileBarChart, FileDown, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface LogRow {
  name: string
  type: string | null
  shown_at: string
}

const PERIODS = [
  { key: 'today', label: 'Hoje', days: 0 },
  { key: '7', label: 'Últimos 7 dias', days: 7 },
  { key: '15', label: 'Últimos 15 dias', days: 15 },
  { key: '30', label: 'Últimos 30 dias', days: 30 },
] as const

// Categoria de alto nível: mídia vira "Arquivos"; RSS usa o nome do feed.
function category(row: LogRow): string {
  if (row.type === 'rss') return row.name
  return 'Arquivos'
}

// Carrega uma imagem (logo) para usar no PDF.
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
  if (days === 0) {
    d.setHours(0, 0, 0, 0) // hoje a partir da meia-noite
  } else {
    d.setDate(d.getDate() - days)
  }
  return d
}

export default function Reports() {
  const [screenId, setScreenId] = useState('')
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

  async function fetchAllLogs(sid: string, sinceISO: string): Promise<LogRow[]> {
    // Pagina (Supabase limita a 1000 por query).
    const out: LogRow[] = []
    let from = 0
    const PAGE = 1000
    for (;;) {
      const { data, error } = await supabase
        .from('exhibition_logs')
        .select('name, type, shown_at')
        .eq('screen_id', sid)
        .gte('shown_at', sinceISO)
        .order('shown_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      out.push(...(data as LogRow[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    return out
  }

  async function generate() {
    if (!screenId) return
    setGenerating(true)
    try {
      const screen = screens.find(s => s.id === screenId)
      const since = periodStart(periodInfo.days)
      const rows = await fetchAllLogs(screenId, since.toISOString())

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const now = new Date()
      const fmtDate = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      const periodLabel = periodInfo.days === 0
        ? now.toLocaleDateString('pt-BR')
        : `${since.toLocaleDateString('pt-BR')} a ${now.toLocaleDateString('pt-BR')}`

      // Logo da Maranata no topo
      const logo = await loadImage('/maranata-logo.png')
      const textX = logo ? 104 : 40
      if (logo) {
        try { doc.addImage(logo, 'PNG', 40, 28, 52, 52) } catch { /* ignora */ }
      }

      // Cabeçalho
      doc.setFontSize(16); doc.setTextColor(30)
      doc.text('Relatório de Exibições', textX, 48)
      doc.setFontSize(11); doc.setTextColor(90)
      doc.text(`Maranata Marketing  -  ${screen?.name ?? 'Tela'}`, textX, 66)
      doc.setFontSize(9); doc.setTextColor(130)
      doc.text(`Gerado em ${fmtDate(now)}`, textX, 81)

      // Resumo
      doc.setFontSize(11); doc.setTextColor(30)
      doc.text(`Total de itens exibidos: ${rows.length}`, 40, 116)
      doc.text(`Período: ${periodInfo.label} (${periodLabel})`, 40, 132)

      // ── Estatísticas por categoria ──
      const byCat = new Map<string, number>()
      const byFile = new Map<string, number>()
      for (const r of rows) {
        const c = category(r)
        byCat.set(c, (byCat.get(c) ?? 0) + 1)
        if (r.type !== 'rss') byFile.set(r.name, (byFile.get(r.name) ?? 0) + 1)
      }
      const totalFiles = [...byFile.values()].reduce((a, b) => a + b, 0)
      const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '0%')
      const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1])
        .map(([c, n]) => [c, String(n), pct(n, rows.length)])
      const fileRows = [...byFile.entries()].sort((a, b) => b[1] - a[1])
        .map(([f, n]) => [f, String(n), pct(n, totalFiles)])

      autoTable(doc, {
        startY: 152,
        head: [['Categoria', 'Exibições', '%']],
        body: catRows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: 40, right: 40 },
      })

      if (fileRows.length) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 16,
          head: [['Arquivo', 'Exibições', '%']],
          body: fileRows,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [13, 148, 136] },
          margin: { left: 40, right: 40 },
        })
      }

      // ── Lista cronológica ──
      const multiDay = periodInfo.days !== 0
      const listRows = rows.map(r => {
        const t = new Date(r.shown_at)
        const when = multiDay
          ? t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        return [when, r.type === 'rss' ? 'Notícias/RSS' : (r.type ?? '—'), r.name]
      })

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Quando', 'Tipo', 'Item']],
        body: listRows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [71, 85, 105] },
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
          const page = doc.getNumberOfPages()
          doc.setFontSize(8); doc.setTextColor(150)
          doc.text(`Relatório gerado em ${fmtDate(now)}`, 40, doc.internal.pageSize.getHeight() - 20)
          doc.text(`${page}`, doc.internal.pageSize.getWidth() - 50, doc.internal.pageSize.getHeight() - 20)
        },
      })

      const safeName = (screen?.name ?? 'tela').replace(/[^\w\-]+/g, '-')
      doc.save(`relatorio-${safeName}-${periodInfo.key}-${now.toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error(e)
      alert('Falha ao gerar o relatório.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="flex items-center gap-2 text-2xl font-bold mb-1">
        <FileBarChart size={24} className="text-brand-600" /> Relatórios de Exibição
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Gere um PDF com tudo que uma tela exibiu no período. Os registros ficam guardados por 30 dias.
      </p>

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Tela</label>
          <select value={screenId} onChange={e => setScreenId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">— Escolha uma tela —</option>
            {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

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

        <button onClick={generate} disabled={!screenId || generating}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Gerando…</> : <><FileDown size={16} /> Gerar PDF</>}
        </button>
      </div>
    </div>
  )
}

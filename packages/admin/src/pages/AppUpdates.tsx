import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { AppBundle } from '../lib/database.types'
import { DownloadCloud, Upload, Trash2, CheckCircle2, Circle, Plus } from 'lucide-react'

const SEMVER = /^\d+\.\d+\.\d+$/

// sha256 do arquivo (hex) — só para exibição/integridade no admin
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function AppUpdates() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [activateNow, setActivateNow] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: bundles = [] } = useQuery<AppBundle[]>({
    queryKey: ['app_bundles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_bundles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const resetForm = () => {
    setVersion(''); setNotes(''); setFile(null); setActivateNow(true)
    setUploading(false); setError(''); setShowAdd(false)
  }

  const publish = useMutation({
    mutationFn: async () => {
      setError('')
      if (!SEMVER.test(version.trim())) throw new Error('Versão deve ser semver, ex: 1.0.3')
      if (!file) throw new Error('Selecione o arquivo .zip do bundle')
      if (bundles.some((b) => b.version === version.trim()))
        throw new Error('Já existe uma versão com esse número')

      setUploading(true)
      const v = version.trim()
      const checksum = await sha256Hex(file)
      const storagePath = `${v}/bundle.zip`

      const { error: upErr } = await supabase.storage
        .from('app-bundles')
        .upload(storagePath, file, { upsert: true, contentType: 'application/zip' })
      if (upErr) throw upErr

      // Se for ativar agora, desativa todas as outras primeiro (índice único exige 1 ativa)
      if (activateNow) {
        const { error: offErr } = await supabase
          .from('app_bundles')
          .update({ active: false })
          .eq('active', true)
        if (offErr) throw offErr
      }

      const { error: insErr } = await supabase.from('app_bundles').insert({
        version: v,
        storage_path: storagePath,
        checksum,
        notes: notes.trim() || null,
        active: activateNow,
      })
      if (insErr) throw insErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app_bundles'] })
      resetForm()
    },
    onError: (e: unknown) => {
      setUploading(false)
      setError(e instanceof Error ? e.message : String(e))
    },
  })

  const activate = useMutation({
    mutationFn: async (bundle: AppBundle) => {
      await supabase.from('app_bundles').update({ active: false }).eq('active', true)
      const { error } = await supabase.from('app_bundles').update({ active: true }).eq('id', bundle.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_bundles'] }),
  })

  const remove = useMutation({
    mutationFn: async (bundle: AppBundle) => {
      await supabase.storage.from('app-bundles').remove([bundle.storage_path])
      const { error } = await supabase.from('app_bundles').delete().eq('id', bundle.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_bundles'] }),
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <DownloadCloud size={24} /> Atualizações
        </h2>
        <button onClick={() => { resetForm(); setShowAdd(true) }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Publicar versão
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6 max-w-3xl">
        Publique uma nova versão do player e os aparelhos se atualizam sozinhos no próximo
        reinício — sem reinstalar o APK. Gere o arquivo com <code className="bg-gray-100 px-1 rounded">npm run bundle</code> no
        projeto do player e suba o <code className="bg-gray-100 px-1 rounded">.zip</code> aqui.
      </p>

      {/* Modal publicar */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl my-4">
              <h3 className="text-lg font-semibold mb-4">Publicar nova versão</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Versão (semver)</label>
                  <input value={version} onChange={(e) => setVersion(e.target.value)}
                    placeholder="ex: 1.0.3"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Arquivo do bundle (.zip)</label>
                  <input ref={fileRef} type="file" accept=".zip,application/zip"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-brand-400 w-full justify-center">
                    <Upload size={16} />
                    {file ? file.name : 'Selecionar maranata-player-x.y.z.zip'}
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notas (opcional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="O que mudou nesta versão"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand-600" />
                  Ativar imediatamente (os players passam a baixar esta versão)
                </label>

                {error && <p className="text-red-500 text-xs">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button onClick={resetForm} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                  <button onClick={() => publish.mutate()} disabled={uploading || publish.isPending}
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50">
                    {uploading || publish.isPending ? 'Enviando...' : 'Publicar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Versão</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Notas</th>
              <th className="px-4 py-3 font-medium">Publicada</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-3 font-mono font-medium">{b.version}</td>
                <td className="px-4 py-3">
                  {b.active ? (
                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                      <CheckCircle2 size={14} /> Ativa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Circle size={14} /> Inativa
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{b.notes || '—'}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(b.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {!b.active && (
                      <button onClick={() => activate.mutate(b)} disabled={activate.isPending}
                        className="text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50">
                        Ativar
                      </button>
                    )}
                    <button onClick={() => { if (confirm(`Excluir a versão ${b.version}?`)) remove.mutate(b) }}
                      title="Excluir" className="text-red-600 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {bundles.length === 0 && (
              <tr><td colSpan={5} className="text-center text-gray-400 py-12">
                Nenhuma versão publicada ainda.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

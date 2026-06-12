import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uploadToSpaces, deleteFromSpaces, mediaUrl } from '../lib/spaces'
import { useIbgeStates, useIbgeCities } from '../lib/ibge'
import type { Client, ClientType } from '../lib/database.types'
import { X, Upload, Loader2, UserRound } from 'lucide-react'

const field = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const lbl = 'block text-sm font-medium mb-1'

export default function ClientModal({ client, onClose }: {
  client: Client | null            // null = novo cliente
  onClose: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<ClientType>(client?.type ?? 'fisica')
  const [name, setName] = useState(client?.name ?? '')
  const [document, setDocument] = useState(client?.document ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [phone1, setPhone1] = useState(client?.phone1 ?? '')
  const [phone2, setPhone2] = useState(client?.phone2 ?? '')
  const [address, setAddress] = useState(client?.address ?? '')
  const [number, setNumber] = useState(client?.number ?? '')
  const [complement, setComplement] = useState(client?.complement ?? '')
  const [district, setDistrict] = useState(client?.district ?? '')
  const [zip, setZip] = useState(client?.zip ?? '')
  const [state, setState] = useState(client?.state ?? '')
  const [city, setCity] = useState(client?.city ?? '')

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | undefined>(
    client?.image_path ? mediaUrl(client.image_path) : undefined,
  )
  const [saving, setSaving] = useState(false)

  const states = useIbgeStates()
  const { cities, loading: loadingCities } = useIbgeCities(state)

  const pickImage = (f: File | null) => {
    setImageFile(f)
    if (f) setImagePreview(URL.createObjectURL(f))
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      let image_path = client?.image_path ?? null
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `clients/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        await uploadToSpaces(path, imageFile, imageFile.type)
        if (client?.image_path) await deleteFromSpaces(client.image_path)
        image_path = path
      }

      const payload = {
        name: name.trim(), type, document: document.trim() || null,
        email: email.trim() || null, phone1: phone1.trim() || null, phone2: phone2.trim() || null,
        image_path, address: address.trim() || null, number: number.trim() || null,
        complement: complement.trim() || null, district: district.trim() || null,
        zip: zip.trim() || null, state: state || null, city: city || null,
      }

      const { error } = client
        ? await supabase.from('clients').update(payload).eq('id', client.id)
        : await supabase.from('clients').insert(payload)
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['clients'] })
      if (client) qc.invalidateQueries({ queryKey: ['client', client.id] })
      onClose()
    } catch (e) {
      alert('Erro ao salvar o cliente: ' + (e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-2xl my-4 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">{client ? 'Editar Cliente' : 'Novo Cliente'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Imagem */}
          <div>
            <label className={lbl}>Imagem</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => pickImage(e.target.files?.[0] ?? null)} />
            <div className="flex items-center gap-3">
              <button onClick={() => fileRef.current?.click()}
                className="w-24 h-24 shrink-0 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors overflow-hidden">
                {imagePreview
                  ? <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  : <><Upload size={20} /><span className="text-[11px]">Escolher<br />arquivo…</span></>}
              </button>
              {imagePreview && (
                <button onClick={() => { setImageFile(null); setImagePreview(undefined) }}
                  className="text-xs text-red-500 hover:underline">Remover imagem</button>
              )}
            </div>
          </div>

          {/* Tipo + documento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Tipo</label>
              <div className="flex gap-4 pt-1.5">
                {([['fisica', 'Física'], ['juridica', 'Jurídica']] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="client-type" checked={type === v}
                      onChange={() => setType(v)} className="accent-brand-600 w-4 h-4" />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>{type === 'fisica' ? 'CPF' : 'CNPJ'}</label>
              <input value={document} onChange={e => setDocument(e.target.value)} className={field}
                placeholder={type === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className={lbl}>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Ex: Avulso" />
          </div>

          {/* Email */}
          <div>
            <label className={lbl}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={field} />
          </div>

          {/* Telefones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Telefone #1</label>
              <input value={phone1} onChange={e => setPhone1(e.target.value)} className={field} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <label className={lbl}>Telefone #2</label>
              <input value={phone2} onChange={e => setPhone2(e.target.value)} className={field} placeholder="(00) 00000-0000" />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Endereço + número */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={lbl}>Endereço</label>
              <input value={address} onChange={e => setAddress(e.target.value)} className={field} placeholder="Ex: Rua Estados Unidos" />
            </div>
            <div>
              <label className={lbl}>Número</label>
              <input value={number} onChange={e => setNumber(e.target.value)} className={field} placeholder="Nº 123" />
            </div>
          </div>

          {/* Complemento */}
          <div>
            <label className={lbl}>Complemento</label>
            <input value={complement} onChange={e => setComplement(e.target.value)} className={field} />
          </div>

          {/* Bairro + CEP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Bairro</label>
              <input value={district} onChange={e => setDistrict(e.target.value)} className={field} />
            </div>
            <div>
              <label className={lbl}>CEP</label>
              <input value={zip} onChange={e => setZip(e.target.value)} className={field} placeholder="00000-000" />
            </div>
          </div>

          {/* Estado + cidade (IBGE) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Estado</label>
              <select value={state} onChange={e => { setState(e.target.value); setCity('') }} className={field}>
                <option value="">Selecione</option>
                {states.map(s => <option key={s.id} value={s.sigla}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Cidade</label>
              <select value={city} onChange={e => setCity(e.target.value)} disabled={!state || loadingCities}
                className={`${field} disabled:bg-gray-50 disabled:text-gray-400`}>
                <option value="">{loadingCities ? 'Carregando…' : 'Selecione'}</option>
                {cities.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-4 sm:px-6 py-4 border-t bg-gray-50 rounded-b-2xl justify-end">
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <UserRound size={15} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

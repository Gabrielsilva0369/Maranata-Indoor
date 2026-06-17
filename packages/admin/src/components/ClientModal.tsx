import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uploadToSpaces, deleteFromSpaces, mediaUrl } from '../lib/spaces'
import { useIbgeStates, useIbgeCities } from '../lib/ibge'
import type { Client, ClientType, ClientStatus } from '../lib/database.types'
import { X, Upload, Loader2, UserRound, DollarSign, MapPin } from 'lucide-react'
import PhoneField from './PhoneField'

const field = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const lbl = 'block text-sm font-medium mb-1'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Campo de valor em R$ (number com prefixo).
function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <div className="flex items-center w-full border rounded-lg px-3 text-sm bg-white focus-within:ring-2 focus-within:ring-brand-500">
        <span className="text-gray-400 mr-1 shrink-0">R$</span>
        <input type="number" min={0} step="0.01" value={value} onChange={e => onChange(e.target.value)}
          placeholder="0,00" className="flex-1 py-2 bg-transparent focus:outline-none min-w-0" />
      </div>
    </div>
  )
}

export default function ClientModal({ client, onClose }: {
  client: Client | null            // null = novo cliente
  onClose: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<ClientType>(client?.type ?? 'fisica')
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? 'ativo')
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

  // Financeiro (campos como string para permitir vazio; convertidos no save)
  const str = (v: number | null | undefined) => (v == null ? '' : String(v))
  const [billingMonthly, setBillingMonthly] = useState(str(client?.billing_monthly))
  const [costMonthly, setCostMonthly] = useState(str(client?.cost_monthly))
  const [startDate, setStartDate] = useState(client?.start_date ?? '')
  const [paymentDay, setPaymentDay] = useState(str(client?.payment_day))

  const [tab, setTab] = useState<'dados' | 'endereco' | 'financeiro'>('dados')

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

      const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return s.trim() === '' || isNaN(n) ? null : n }

      const payload = {
        name: name.trim(), type, status, document: document.trim() || null,
        email: email.trim() || null, phone1: phone1.trim() || null, phone2: phone2.trim() || null,
        image_path, address: address.trim() || null, number: number.trim() || null,
        complement: complement.trim() || null, district: district.trim() || null,
        zip: zip.trim() || null, state: state || null, city: city || null,
        billing_monthly: num(billingMonthly), billing_per_media: null,
        cost_monthly: num(costMonthly), cost_per_media: null,
        start_date: startDate || null,
        payment_day: paymentDay.trim() === '' ? null : Math.min(31, Math.max(1, parseInt(paymentDay, 10) || 1)),
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

  const nf = (s: string) => { const x = parseFloat(s.replace(',', '.')); return isNaN(x) ? 0 : x }
  const netMonthly = nf(billingMonthly) - nf(costMonthly)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-2xl my-4 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5">
          <h3 className="text-lg font-semibold">{client ? 'Editar Cliente' : 'Novo Cliente'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex gap-1 px-2 sm:px-4 pt-3 overflow-x-auto">
          {([
            { key: 'dados', label: 'Dados', icon: <UserRound size={15} /> },
            { key: 'endereco', label: 'Endereço', icon: <MapPin size={15} /> },
            { key: 'financeiro', label: 'Financeiro', icon: <DollarSign size={15} /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${tab === t.key ? 'text-brand-600 border-brand-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 border-t">
          {/* ── DADOS ── */}
          {tab === 'dados' && (<>
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

          {/* Status */}
          <div>
            <label className={lbl}>Status do cliente</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { v: 'ativo', label: 'Ativo', active: 'bg-emerald-600 text-white border-emerald-600' },
                { v: 'atraso', label: 'Em atraso', active: 'bg-amber-500 text-white border-amber-500' },
                { v: 'pausado', label: 'Pausado', active: 'bg-sky-600 text-white border-sky-600' },
                { v: 'cancelado', label: 'Cancelado', active: 'bg-gray-500 text-white border-gray-500' },
              ] as const).map(o => (
                <button key={o.v} type="button" onClick={() => setStatus(o.v)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-colors ${status === o.v ? o.active : 'border-gray-200 text-slate-600 hover:border-brand-300'}`}>
                  {o.label}
                </button>
              ))}
            </div>
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
              <PhoneField value={phone1} onChange={setPhone1} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <label className={lbl}>Telefone #2</label>
              <PhoneField value={phone2} onChange={setPhone2} placeholder="(00) 00000-0000" />
            </div>
          </div>
          </>)}

          {/* ── ENDEREÇO ── */}
          {tab === 'endereco' && (<>
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
          </>)}

          {/* ── FINANCEIRO ── */}
          {tab === 'financeiro' && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MoneyField label="Cobrança por mês" value={billingMonthly} onChange={setBillingMonthly} />
              <MoneyField label="Custo operacional por mês" value={costMonthly} onChange={setCostMonthly} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={lbl}>Data de início</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={field} />
              </div>
              <div>
                <label className={lbl}>Dia do pagamento <span className="text-gray-400 font-normal">(mensal)</span></label>
                <input type="number" min={1} max={31} value={paymentDay} onChange={e => setPaymentDay(e.target.value)}
                  className={field} placeholder="Ex: 10" />
              </div>
            </div>

            {/* Resultado estimado */}
            {(billingMonthly || costMonthly) && (
              <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <p>Resultado/mês estimado: <b className={netMonthly >= 0 ? 'text-emerald-600' : 'text-red-600'}>{brl(netMonthly)}</b></p>
              </div>
            )}
          </div>
          )}
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

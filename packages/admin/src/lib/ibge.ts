import { useEffect, useState } from 'react'

// API pública do IBGE (grátis, sem chave) para estados e cidades do Brasil.
export interface IbgeState { id: number; sigla: string; nome: string }
export interface IbgeCity { id: number; nome: string }

export function useIbgeStates(): IbgeState[] {
  const [states, setStates] = useState<IbgeState[]>([])
  useEffect(() => {
    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
      .then(r => r.json()).then(setStates).catch(() => { /* offline: dropdown vazio */ })
  }, [])
  return states
}

export function useIbgeCities(uf: string | null | undefined): { cities: IbgeCity[]; loading: boolean } {
  const [cities, setCities] = useState<IbgeCity[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!uf) { setCities([]); return }
    setLoading(true)
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then(r => r.json())
      .then((data: IbgeCity[]) => setCities(data))
      .catch(() => setCities([]))
      .finally(() => setLoading(false))
  }, [uf])
  return { cities, loading }
}

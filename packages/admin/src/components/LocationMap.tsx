import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number | null | undefined
  lng: number | null | undefined
  /** Disparado quando o usuário arrasta o pino ou clica no mapa. */
  onChange: (lat: number, lng: number) => void
}

const BRAZIL_CENTER: [number, number] = [-14.235, -51.925]

// Pino SVG no tom da marca (evita o problema clássico de ícone do Leaflet
// com bundlers — não depende de imagens externas).
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="34" height="34" viewBox="0 0 24 24" fill="#7c3aed" stroke="#fff" stroke-width="1.4">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5" fill="#fff" stroke="none"/></svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})

export default function LocationMap({ lat, lng, onChange }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const hasPos = lat != null && lng != null
    const start: [number, number] = hasPos ? [lat!, lng!] : BRAZIL_CENTER
    const map = L.map(elRef.current, { center: start, zoom: hasPos ? 16 : 3, scrollWheelZoom: true })
    // CARTO Voyager: tiles mais limpos/bonitos que o OSM cru, grátis e mundiais.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 20, detectRetina: true,
    }).addTo(map)

    const marker = L.marker(start, { draggable: true, icon: pinIcon }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      onChangeRef.current(p.lat, p.lng)
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      onChangeRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    markerRef.current = marker
    // O container pode montar com tamanho 0 dentro do modal; corrige após pintar.
    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recentraliza quando a posição muda de fora (ex.: geocodificação por endereço).
  useEffect(() => {
    if (lat == null || lng == null || !mapRef.current || !markerRef.current) return
    markerRef.current.setLatLng([lat, lng])
    mapRef.current.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={elRef} className="w-full h-full" />
}

import { useState, useEffect } from 'react'

interface WeatherConfig {
  city_name: string
  country: string
  latitude: number
  longitude: number
  unit: 'C' | 'F'
  text_color: string
  bg_type: 'auto' | 'color'
  bg_color: string
  show_humidity: boolean
  show_wind: boolean
  show_feels_like: boolean
}

interface Props {
  config: WeatherConfig
  duration: number
  onEnd: () => void
}

interface WeatherData {
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  wind_speed_10m: number
  weather_code: number
}

// ── Mapeamentos de clima ──────────────────────────────────────────────────────
function getWeatherInfo(code: number) {
  if (code === 0)  return { emoji: '☀️',  desc: 'Céu limpo',           gradient: ['#1e90ff', '#87ceeb'] }
  if (code <= 2)   return { emoji: '⛅',  desc: 'Parcialmente nublado', gradient: ['#5b8ab5', '#90b5d0'] }
  if (code === 3)  return { emoji: '☁️',  desc: 'Nublado',              gradient: ['#607080', '#909aaa'] }
  if (code <= 48)  return { emoji: '🌫️', desc: 'Névoa',                gradient: ['#708090', '#a0aab5'] }
  if (code <= 55)  return { emoji: '🌦️', desc: 'Chuvisco',             gradient: ['#4a7a9b', '#6a9ab5'] }
  if (code <= 67)  return { emoji: '🌧️', desc: 'Chuva',                gradient: ['#2c4a6e', '#4a6a8e'] }
  if (code <= 77)  return { emoji: '❄️',  desc: 'Neve',                 gradient: ['#a0b8d0', '#c8dcea'] }
  if (code <= 82)  return { emoji: '🌧️', desc: 'Pancadas de chuva',    gradient: ['#3a5a7e', '#5a7a9e'] }
  return           { emoji: '⛈️',  desc: 'Tempestade',           gradient: ['#1a1a3e', '#2a2a5e'] }
}

function toF(c: number) { return Math.round(c * 9 / 5 + 32) }

function windDir(deg: number) {
  const dirs = ['N','NE','L','SE','S','SO','O','NO']
  return dirs[Math.round(deg / 45) % 8]
}

// ── Player ────────────────────────────────────────────────────────────────────
export default function WeatherPlayer({ config, duration, onEnd }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [progress, setProgress] = useState(0)

  const fetchWeather = () => {
    fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${config.latitude}&longitude=${config.longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
      `&wind_speed_unit=kmh&timezone=auto`
    )
      .then(r => r.json())
      .then(d => setWeather(d.current))
      .catch(() => {})
  }

  useEffect(() => {
    fetchWeather()
    const id = setInterval(fetchWeather, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [config.latitude, config.longitude])

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    const total = duration * 1000
    const tick = setInterval(() => {
      const pct = Math.min((Date.now() - start) / total, 1)
      setProgress(pct)
      if (pct >= 1) { clearInterval(tick); onEnd() }
    }, 100)
    return () => clearInterval(tick)
  }, [duration, onEnd])

  const info = getWeatherInfo(weather?.weather_code ?? 0)
  const [g1, g2] = config.bg_type === 'auto' ? info.gradient : [config.bg_color, config.bg_color]

  const temp = weather
    ? (config.unit === 'F' ? toF(weather.temperature_2m) : Math.round(weather.temperature_2m))
    : null
  const feels = weather
    ? (config.unit === 'F' ? toF(weather.apparent_temperature) : Math.round(weather.apparent_temperature))
    : null
  const unit = config.unit === 'F' ? '°F' : '°C'
  const color = config.text_color

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `linear-gradient(160deg, ${g1} 0%, ${g2} 100%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      color,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Círculo decorativo de fundo */}
      <div style={{
        position: 'absolute',
        width: '60vmin', height: '60vmin',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)',
        top: '-10vmin', right: '-10vmin',
      }} />
      <div style={{
        position: 'absolute',
        width: '40vmin', height: '40vmin',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)',
        bottom: '-5vmin', left: '-5vmin',
      }} />

      {/* Conteúdo principal */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 40px' }}>

        {/* Cidade */}
        <p style={{
          fontSize: 'clamp(14px, 2.5vw, 28px)',
          fontWeight: 300,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          opacity: 0.8,
          marginBottom: '2vmin',
        }}>
          {config.city_name}{config.country ? `, ${config.country}` : ''}
        </p>

        {/* Emoji do clima */}
        <div style={{
          fontSize: 'clamp(64px, 14vmin, 140px)',
          lineHeight: 1,
          marginBottom: '1vmin',
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
        }}>
          {info.emoji}
        </div>

        {/* Temperatura */}
        <div style={{
          fontSize: 'clamp(72px, 16vw, 180px)',
          fontWeight: 100,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          textShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          {temp !== null ? `${temp}${unit}` : '--'}
        </div>

        {/* Condição */}
        <p style={{
          fontSize: 'clamp(16px, 3vw, 36px)',
          fontWeight: 300,
          opacity: 0.85,
          marginTop: '1vmin',
          letterSpacing: '0.05em',
        }}>
          {info.desc}
        </p>

        {/* Sensação */}
        {config.show_feels_like && feels !== null && (
          <p style={{
            fontSize: 'clamp(12px, 1.8vw, 24px)',
            opacity: 0.65,
            marginTop: '0.5vmin',
          }}>
            Sensação {feels}{unit}
          </p>
        )}

        {/* Separador */}
        <div style={{
          width: 48, height: 1,
          background: color,
          opacity: 0.3,
          margin: '3vmin auto',
        }} />

        {/* Stats: umidade + vento */}
        {weather && (config.show_humidity || config.show_wind) && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'clamp(24px, 5vw, 60px)',
            fontSize: 'clamp(14px, 2.2vw, 28px)',
            opacity: 0.8,
          }}>
            {config.show_humidity && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '1.4em' }}>💧</span>
                <span>{weather.relative_humidity_2m}%</span>
                <span style={{ fontSize: '0.7em', opacity: 0.6 }}>Umidade</span>
              </div>
            )}
            {config.show_wind && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '1.4em' }}>💨</span>
                <span>{Math.round(weather.wind_speed_10m)} km/h</span>
                <span style={{ fontSize: '0.7em', opacity: 0.6 }}>Vento</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de progresso */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 3, background: 'rgba(255,255,255,0.15)',
      }}>
        <div style={{
          height: '100%', width: `${progress * 100}%`,
          background: 'rgba(255,255,255,0.6)',
          transition: 'width 100ms linear',
        }} />
      </div>
    </div>
  )
}

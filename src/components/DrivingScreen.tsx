import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, LineData, ServiceConfig } from '../types'
import { useGeolocation } from '../hooks/useGeolocation'
import { useLineProgress } from '../hooks/useLineProgress'
import { useTurnDetection } from '../hooks/useTurnDetection'
import { useWakeLock } from '../hooks/useWakeLock'
import { speak, vibrate } from '../utils/speech'
import { DrivingMap } from './DrivingMap'
import { HUD } from './HUD'
import { StopNav } from './StopNav'
import { Settings } from './Settings'

interface Props {
  line: LineData
  service: ServiceConfig
  settings: AppSettings
  onChangeSettings: (patch: Partial<AppSettings>) => void
  onEndService: () => void
}

const OVERRIDE_TIMEOUT_MS = 10000

export function DrivingScreen({
  line,
  service,
  settings,
  onChangeSettings,
  onEndService,
}: Props) {
  const route = line.shapes[service.direction]
  const dirStops = line.stops[service.direction]
  const geo = useGeolocation(true)
  useWakeLock(true)

  const progress = useLineProgress(
    route,
    dirStops,
    geo.lat,
    geo.lon,
    geo.speed,
  )
  const turn = useTurnDetection(route, geo.lat, geo.lon)

  const [showSettings, setShowSettings] = useState(false)
  const [recenterSignal, setRecenterSignal] = useState(0)
  const [autoFollowLive, setAutoFollowLive] = useState(settings.autoFollow)

  // Override manuel d'arrêt (consultation précédent/suivant).
  const [overrideIndex, setOverrideIndex] = useState<number | null>(null)
  const overrideTimer = useRef<number | null>(null)

  // Suit le réglage auto-follow, mais un pan utilisateur peut le couper.
  useEffect(() => setAutoFollowLive(settings.autoFollow), [settings.autoFollow])

  const directionLabel = useMemo(() => {
    if (dirStops.length === 0) return ''
    // Terminus = dernier arrêt du sens (ordre GTFS).
    return `Sens ${dirStops[dirStops.length - 1].name}`
  }, [dirStops])

  const displayIndex =
    overrideIndex ?? Math.min(progress.nextIndex, progress.orderedStops.length - 1)
  const overridden = overrideIndex !== null

  const scheduleOverrideReset = () => {
    if (overrideTimer.current) window.clearTimeout(overrideTimer.current)
    overrideTimer.current = window.setTimeout(() => {
      setOverrideIndex(null)
      overrideTimer.current = null
    }, OVERRIDE_TIMEOUT_MS)
  }

  const handlePrev = () => {
    setOverrideIndex((cur) => {
      const base = cur ?? progress.nextIndex
      return Math.max(0, base - 1)
    })
    scheduleOverrideReset()
  }
  const handleNext = () => {
    setOverrideIndex((cur) => {
      const base = cur ?? progress.nextIndex
      return Math.min(progress.orderedStops.length - 1, base + 1)
    })
    scheduleOverrideReset()
  }

  useEffect(
    () => () => {
      if (overrideTimer.current) window.clearTimeout(overrideTimer.current)
    },
    [],
  )

  // ----- Annonces vocales & vibrations -----
  const announced = useRef<{
    approach: string | null
    imminent: string | null
    turnKey: string | null
    terminus: boolean
  }>({ approach: null, imminent: null, turnKey: null, terminus: false })

  // Approche (< 300 m) et arrêt imminent (< 80 m).
  useEffect(() => {
    const stop = progress.nextStop
    if (!stop) return
    const d = progress.distanceToNext

    if (d < 300 && announced.current.approach !== stop.id) {
      announced.current.approach = stop.id
      vibrate(120, settings.vibrationEnabled)
      speak(`Prochain arrêt : ${stop.name}`, settings.voiceEnabled)
    }
    if (d < 80 && announced.current.imminent !== stop.id) {
      announced.current.imminent = stop.id
      vibrate([180, 80, 180], settings.vibrationEnabled)
      speak(`Arrêt ${stop.name}`, settings.voiceEnabled)
    }
  }, [
    progress.nextStop,
    progress.distanceToNext,
    settings.vibrationEnabled,
    settings.voiceEnabled,
  ])

  // Virage anticipé (< 150 m).
  useEffect(() => {
    if (!turn.side || turn.distance >= 150) {
      if (turn.distance >= 150) announced.current.turnKey = null
      return
    }
    const key = `${turn.side}-${Math.round(turn.angle)}`
    if (announced.current.turnKey === key) return
    announced.current.turnKey = key
    const dist = Math.round(turn.distance / 10) * 10
    speak(
      `Virage à ${turn.side === 'left' ? 'gauche' : 'droite'} dans ${dist} mètres`,
      settings.voiceEnabled,
    )
  }, [turn.side, turn.distance, turn.angle, settings.voiceEnabled])

  // Terminus atteint.
  useEffect(() => {
    if (progress.isFinished && !announced.current.terminus) {
      announced.current.terminus = true
      const last = progress.orderedStops[progress.orderedStops.length - 1]
      vibrate([200, 100, 200, 100, 200], settings.vibrationEnabled)
      speak(
        `Terminus ${last ? last.name : ''}. Fin de service.`,
        settings.voiceEnabled,
      )
    }
    if (!progress.isFinished) announced.current.terminus = false
  }, [
    progress.isFinished,
    progress.orderedStops,
    settings.vibrationEnabled,
    settings.voiceEnabled,
  ])

  // ----- Bandeau d'alerte GPS / permission -----
  const alert = useMemo<
    { level: 'warn' | 'danger'; text: string } | null
  >(() => {
    if (geo.permission === 'denied' || geo.permission === 'unsupported') {
      return { level: 'danger', text: geo.error ?? 'Géolocalisation indisponible.' }
    }
    if (geo.lat == null) {
      return {
        level: 'warn',
        text: geo.error ?? 'Acquisition du signal GPS…',
      }
    }
    if (geo.accuracy != null && geo.accuracy > 50) {
      return { level: 'warn', text: 'Précision GPS faible.' }
    }
    return null
  }, [geo.permission, geo.error, geo.lat, geo.accuracy])

  const speedKmh =
    geo.speed != null ? Math.max(0, Math.round(geo.speed * 3.6)) : null

  return (
    <div className="driving">
      <DrivingMap
        color={line.color}
        route={route}
        stops={progress.orderedStops}
        passed={progress.passed}
        nextIndex={Math.min(
          progress.nextIndex,
          progress.orderedStops.length - 1,
        )}
        busLat={geo.lat}
        busLon={geo.lon}
        heading={geo.heading}
        autoFollow={autoFollowLive}
        headingUp={settings.headingUp}
        recenterSignal={recenterSignal}
        onUserPan={() => setAutoFollowLive(false)}
      />

      <button
        className="menu-fab"
        onClick={() => setShowSettings(true)}
        aria-label="Menu"
      >
        ≡
      </button>

      <HUD
        nextStopName={
          overridden ? progress.orderedStops[displayIndex]?.name : progress.nextStop?.name ?? null
        }
        distanceToNext={progress.distanceToNext}
        etaSeconds={progress.etaSeconds}
        isFinished={progress.isFinished && !overridden}
        turn={turn}
        alert={alert}
        overridden={overridden}
      />

      {speedKmh != null && (
        <div className="speed-pill">
          {speedKmh}
          <span className="u">km/h</span>
        </div>
      )}

      <button
        className={`recenter-fab${autoFollowLive ? ' active' : ''}`}
        aria-label="Recentrer"
        onClick={() => {
          setAutoFollowLive(true)
          setRecenterSignal((s) => s + 1)
        }}
      >
        ◎
      </button>

      <StopNav
        lineId={line.nom}
        lineColor={line.color}
        lineTextColor={line.text_color}
        directionLabel={directionLabel}
        stops={progress.orderedStops}
        displayIndex={displayIndex}
        overridden={overridden}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {showSettings && (
        <Settings
          settings={settings}
          onChange={onChangeSettings}
          onClose={() => setShowSettings(false)}
          onEndService={onEndService}
        />
      )}
    </div>
  )
}
